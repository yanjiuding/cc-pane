use std::io::{ErrorKind, Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::Path;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::utils::error::AppError;
use crate::utils::AppResult;

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TerminalDaemonManifest {
    pub addr: String,
    pub token: String,
    pub pid: u32,
    pub started_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TerminalDaemonStatus {
    pub status: String,
    pub version: String,
    pub pid: u32,
    pub addr: String,
    pub started_at: u64,
    pub session_count: usize,
}

#[derive(Debug, Clone)]
pub struct TerminalDaemonClient {
    addr: String,
    token: String,
    timeout: Duration,
}

impl TerminalDaemonClient {
    pub fn new(addr: impl Into<String>, token: impl Into<String>) -> Self {
        Self {
            addr: addr.into(),
            token: token.into(),
            timeout: DEFAULT_TIMEOUT,
        }
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub fn from_manifest(manifest: TerminalDaemonManifest) -> Self {
        Self::new(manifest.addr, manifest.token)
    }

    pub fn from_manifest_path(path: impl AsRef<Path>) -> AppResult<Self> {
        let data = std::fs::read_to_string(path).map_err(AppError::from)?;
        let manifest: TerminalDaemonManifest =
            serde_json::from_str(&data).map_err(|error| AppError::from(error.to_string()))?;
        Ok(Self::from_manifest(manifest))
    }

    pub fn health(&self) -> AppResult<()> {
        self.get_json::<serde_json::Value>("/api/health", false)
            .map(|_| ())
    }

    pub fn status(&self) -> AppResult<TerminalDaemonStatus> {
        self.get_json("/api/daemon/status", true)
    }

    fn get_json<T>(&self, path: &str, authorize: bool) -> AppResult<T>
    where
        T: for<'de> Deserialize<'de>,
    {
        let response = self.request("GET", path, authorize)?;
        parse_json_response(&response)
    }

    fn request(&self, method: &str, path: &str, authorize: bool) -> AppResult<String> {
        let addr: SocketAddr = self
            .addr
            .parse()
            .map_err(|error| AppError::from(format!("invalid daemon addr: {error}")))?;
        let mut stream = TcpStream::connect_timeout(&addr, self.timeout).map_err(AppError::from)?;
        stream
            .set_read_timeout(Some(self.timeout))
            .map_err(AppError::from)?;
        stream
            .set_write_timeout(Some(self.timeout))
            .map_err(AppError::from)?;

        let mut request = format!(
            "{method} {path} HTTP/1.1\r\nHost: {}\r\nAccept: application/json\r\nConnection: close\r\n",
            self.addr
        );
        if authorize {
            request.push_str(&format!("Authorization: Bearer {}\r\n", self.token));
        }
        request.push_str("\r\n");

        stream
            .write_all(request.as_bytes())
            .map_err(AppError::from)?;
        let response = read_http_response(stream)?;
        Ok(response)
    }
}

fn read_http_response(mut stream: TcpStream) -> AppResult<String> {
    let mut bytes = Vec::new();
    let mut chunk = [0_u8; 4096];
    loop {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => bytes.extend_from_slice(&chunk[..n]),
            Err(error)
                if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut)
                    && !bytes.is_empty() =>
            {
                break;
            }
            Err(error) => return Err(AppError::from(error)),
        }
    }
    String::from_utf8(bytes).map_err(|error| AppError::from(error.to_string()))
}

fn parse_json_response<T>(response: &str) -> AppResult<T>
where
    T: for<'de> Deserialize<'de>,
{
    let (status, body) = split_http_response(response)?;
    if !(200..300).contains(&status) {
        return Err(AppError::from(format!(
            "daemon request failed with HTTP {status}: {body}"
        )));
    }
    serde_json::from_str(body).map_err(|error| AppError::from(error.to_string()))
}

fn split_http_response(response: &str) -> AppResult<(u16, &str)> {
    let (head, body): (&str, &str) = response
        .split_once("\r\n\r\n")
        .ok_or_else(|| AppError::from("invalid daemon HTTP response"))?;
    let status_line = head
        .lines()
        .next()
        .ok_or_else(|| AppError::from("missing daemon HTTP status line"))?;
    let status = status_line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| AppError::from("missing daemon HTTP status code"))?
        .parse::<u16>()
        .map_err(|error| AppError::from(format!("invalid daemon HTTP status code: {error}")))?;
    Ok((status, body))
}

#[cfg(test)]
mod tests {
    use std::net::TcpListener;
    use std::sync::mpsc;
    use std::thread;

    use super::*;

    fn spawn_response_server(response: String) -> (SocketAddr, mpsc::Receiver<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
        let addr = listener.local_addr().expect("local addr");
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept client");
            let mut request_bytes = Vec::new();
            let mut chunk = [0_u8; 1024];
            loop {
                let n = stream.read(&mut chunk).expect("read request");
                if n == 0 {
                    break;
                }
                request_bytes.extend_from_slice(&chunk[..n]);
                if request_bytes.windows(4).any(|window| window == b"\r\n\r\n") {
                    break;
                }
            }
            let request = String::from_utf8(request_bytes).expect("utf8 request");
            tx.send(request).ok();
            stream
                .write_all(response.as_bytes())
                .expect("write response");
        });
        (addr, rx)
    }

    #[test]
    fn reads_daemon_client_from_manifest_file() {
        let dir = tempfile::tempdir().expect("temp dir");
        let manifest_path = dir.path().join("daemon-manifest.json");
        std::fs::write(
            &manifest_path,
            r#"{"addr":"127.0.0.1:1234","token":"abc","pid":42,"startedAt":100}"#,
        )
        .expect("write manifest");

        let client = TerminalDaemonClient::from_manifest_path(&manifest_path).expect("client");

        assert_eq!(client.addr, "127.0.0.1:1234");
        assert_eq!(client.token, "abc");
    }

    #[test]
    fn status_sends_bearer_token_and_parses_response() {
        let body = r#"{"status":"ok","version":"0.1.0","pid":7,"addr":"127.0.0.1:1","startedAt":10,"sessionCount":0}"#;
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
            body.len(),
            body
        );
        let (addr, rx) = spawn_response_server(response);
        let client = TerminalDaemonClient::new(addr.to_string(), "secret")
            .with_timeout(Duration::from_secs(1));

        let status = client.status().expect("daemon status");

        assert_eq!(status.status, "ok");
        assert_eq!(status.pid, 7);
        let request = rx.recv().expect("captured request");
        assert!(request.starts_with("GET /api/daemon/status HTTP/1.1"));
        assert!(request.contains("Authorization: Bearer secret"));
    }

    #[test]
    fn health_does_not_send_bearer_token() {
        let response =
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 15\r\n\r\n{\"status\":\"ok\"}";
        let (addr, rx) = spawn_response_server(response.to_string());
        let client = TerminalDaemonClient::new(addr.to_string(), "secret")
            .with_timeout(Duration::from_secs(1));

        client.health().expect("daemon health");

        let request = rx.recv().expect("captured request");
        assert!(request.starts_with("GET /api/health HTTP/1.1"));
        assert!(!request.contains("Authorization: Bearer"));
    }

    #[test]
    fn non_success_status_returns_error() {
        let response =
            "HTTP/1.1 401 Unauthorized\r\nContent-Length: 24\r\n\r\n{\"code\":\"UNAUTHORIZED\"}";
        let result: AppResult<TerminalDaemonStatus> = parse_json_response(response);

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("HTTP 401"));
    }
}
