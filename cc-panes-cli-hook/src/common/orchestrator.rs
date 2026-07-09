//! Orchestrator 端点解析：优先环境变量，缺失时回退运行时文件 `mcp-orchestrator.json`。
//!
//! resume / 重启后仍在跑的会话可能拿不到 `CC_PANES_API_*` 环境变量（老 orchestrator
//! 已带着旧端口+token 退出）。此时从主进程每次启动都刷新的 `mcp-orchestrator.json`
//! 读回**当前**端点，让 hook 的 REST 调用不至于 `both missing` 直接失败。

use std::collections::HashMap;
use std::net::{TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::time::{Duration, SystemTime};

use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct OrchestratorConfig {
    #[serde(rename = "mcpServers")]
    mcp_servers: HashMap<String, OrchestratorServerEntry>,
}

#[derive(Debug, Deserialize)]
struct OrchestratorServerEntry {
    url: String,
    headers: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone)]
struct EndpointCandidate {
    base_url: String,
    token: String,
    modified: SystemTime,
}

/// 解析 orchestrator 端点为 `(base_url, token)`。
/// 优先环境变量（`CC_PANES_API_BASE_URL` 或 `CC_PANES_API_PORT` + `CC_PANES_API_TOKEN`），
/// 但**先探活**：resume/重启后老会话带着的 env 可能指向已退出的旧端口，此时应让位给
/// `mcp-orchestrator.json` 里主进程每次刷新的当前端点。WSL 下 env 里的 loopback
/// 还会被改写成 Windows host（NAT 模式 127.0.0.1 不可达）。三者皆不可达时，退回原始
/// env（好过 both-missing 直接失败）。
pub fn resolve_api_endpoint() -> Option<(String, String)> {
    let env_candidate = endpoint_candidate_from_env();

    // env 优先，但必须探活（并在 WSL 下改写 loopback host）。
    if let Some(candidate) = env_candidate.clone() {
        if let Some(adapted) = adapt_candidate_for_current_host(candidate) {
            if endpoint_reachable(&adapted.base_url) {
                return Some(endpoint_tuple(adapted));
            }
        }
    }

    if let Some(endpoint) = endpoint_from_manifest() {
        return Some(endpoint);
    }

    // manifest 也没有：退回原始 env（未探活，但好过直接失败）。
    env_candidate.map(endpoint_tuple)
}

fn endpoint_candidate_from_env() -> Option<EndpointCandidate> {
    let (base_url, token) = endpoint_from_env()?;
    Some(EndpointCandidate {
        base_url,
        token,
        modified: SystemTime::UNIX_EPOCH,
    })
}

fn endpoint_tuple(candidate: EndpointCandidate) -> (String, String) {
    (
        candidate.base_url.trim_end_matches('/').to_string(),
        candidate.token,
    )
}

fn endpoint_from_env() -> Option<(String, String)> {
    let base = non_empty_var("CC_PANES_API_BASE_URL").or_else(|| {
        non_empty_var("CC_PANES_API_PORT").map(|port| format!("http://127.0.0.1:{}", port))
    })?;
    let token = non_empty_var("CC_PANES_API_TOKEN")?;
    Some((base, token))
}

fn endpoint_from_manifest() -> Option<(String, String)> {
    if let Some(dir) = non_empty_var("CC_PANES_DATA_DIR") {
        let path = PathBuf::from(dir).join("mcp-orchestrator.json");
        let candidate = read_manifest_candidate(path)?;
        return adapt_candidate_for_current_host(candidate).map(|candidate| {
            (
                candidate.base_url.trim_end_matches('/').to_string(),
                candidate.token,
            )
        });
    }

    select_manifest_endpoint(find_orchestrator_config_candidates())
}

/// 与文件 IO 分离的纯解析，便于单测。
fn parse_manifest(content: &str) -> Option<(String, String)> {
    let config: OrchestratorConfig = serde_json::from_str(content).ok()?;
    let server = config.mcp_servers.get("ccpanes")?;
    let base_url = url_base(&server.url)?;
    let token = server
        .headers
        .as_ref()
        .and_then(|h| h.get("Authorization"))
        .and_then(|auth| auth.strip_prefix("Bearer ").map(str::to_string))
        .or_else(|| token_from_query(&server.url))
        .filter(|t| !t.is_empty())?;
    Some((base_url, token))
}

fn read_manifest_candidate(path: PathBuf) -> Option<EndpointCandidate> {
    let content = std::fs::read_to_string(&path).ok()?;
    let (base_url, token) = parse_manifest(&content)?;
    let modified = std::fs::metadata(&path)
        .and_then(|metadata| metadata.modified())
        .unwrap_or(SystemTime::UNIX_EPOCH);
    Some(EndpointCandidate {
        base_url,
        token,
        modified,
    })
}

fn find_orchestrator_config_candidates() -> Vec<EndpointCandidate> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    [".cc-panes", ".cc-panes-dev"]
        .into_iter()
        .filter_map(|dir_name| {
            read_manifest_candidate(home.join(dir_name).join("mcp-orchestrator.json"))
        })
        .collect()
}

fn select_manifest_endpoint(candidates: Vec<EndpointCandidate>) -> Option<(String, String)> {
    let mut candidates = candidates
        .into_iter()
        .filter_map(adapt_candidate_for_current_host)
        .collect::<Vec<_>>();

    if let Some(candidate) = candidates
        .iter()
        .find(|candidate| endpoint_reachable(&candidate.base_url))
    {
        return Some((
            candidate.base_url.trim_end_matches('/').to_string(),
            candidate.token.clone(),
        ));
    }

    if running_in_wsl() {
        return None;
    }

    candidates.sort_by_key(|candidate| candidate.modified);
    candidates.pop().map(|candidate| {
        (
            candidate.base_url.trim_end_matches('/').to_string(),
            candidate.token,
        )
    })
}

fn adapt_candidate_for_current_host(candidate: EndpointCandidate) -> Option<EndpointCandidate> {
    if !running_in_wsl() || !is_loopback_base_url(&candidate.base_url) {
        return Some(candidate);
    }

    wsl_windows_host_candidates()
        .into_iter()
        .filter_map(|host| rewrite_base_url_host(&candidate.base_url, &host))
        .find(|base_url| endpoint_reachable(base_url))
        .map(|base_url| EndpointCandidate {
            base_url,
            token: candidate.token,
            modified: candidate.modified,
        })
}

fn non_empty_var(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

/// 从 `http://host:port/mcp?...` 取 `http://host:port`。
fn url_base(url: &str) -> Option<String> {
    let mut parsed = url::Url::parse(url).ok()?;
    parsed.set_path("");
    parsed.set_query(None);
    parsed.set_fragment(None);
    Some(parsed.to_string().trim_end_matches('/').to_string())
}

fn token_from_query(url: &str) -> Option<String> {
    let query = url.split('?').nth(1)?;
    query
        .split('&')
        .find_map(|kv| kv.strip_prefix("token=").map(str::to_string))
}

fn endpoint_reachable(base_url: &str) -> bool {
    let Ok(url) = url::Url::parse(base_url) else {
        return false;
    };
    let Some(host) = url.host_str() else {
        return false;
    };
    let Some(port) = url.port_or_known_default() else {
        return false;
    };
    (host, port)
        .to_socket_addrs()
        .ok()
        .into_iter()
        .flatten()
        .any(|addr| TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_ok())
}

fn is_loopback_base_url(base_url: &str) -> bool {
    url::Url::parse(base_url)
        .ok()
        .and_then(|url| url.host_str().map(|host| host.to_ascii_lowercase()))
        .is_some_and(|host| host == "127.0.0.1" || host == "localhost" || host == "::1")
}

fn rewrite_base_url_host(base_url: &str, host: &str) -> Option<String> {
    let mut url = url::Url::parse(base_url).ok()?;
    url.set_host(Some(host)).ok()?;
    Some(url.to_string().trim_end_matches('/').to_string())
}

fn running_in_wsl() -> bool {
    std::env::var_os("WSL_DISTRO_NAME").is_some()
        || std::fs::read_to_string("/proc/version")
            .map(|version| version.to_ascii_lowercase().contains("microsoft"))
            .unwrap_or(false)
}

fn wsl_windows_host_candidates() -> Vec<String> {
    let mut hosts = Vec::new();
    hosts.push("127.0.0.1".to_string());
    if let Ok(content) = std::fs::read_to_string("/etc/resolv.conf") {
        for line in content.lines() {
            let line = line.trim();
            if let Some(rest) = line.strip_prefix("nameserver") {
                if let Some(host) = rest.split_whitespace().next() {
                    if !hosts.iter().any(|existing| existing == host) {
                        hosts.push(host.to_string());
                    }
                }
            }
        }
    }
    hosts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_base_url_and_bearer_token() {
        let content = r#"{"mcpServers":{"ccpanes":{"type":"http",
            "url":"http://127.0.0.1:61012/mcp?token=deadbeef",
            "headers":{"Authorization":"Bearer deadbeef"}}}}"#;
        assert_eq!(
            parse_manifest(content),
            Some(("http://127.0.0.1:61012".to_string(), "deadbeef".to_string()))
        );
    }

    #[test]
    fn falls_back_to_token_query_when_no_header() {
        let content = r#"{"mcpServers":{"ccpanes":{"url":"http://127.0.0.1:5/mcp?token=q1"}}}"#;
        assert_eq!(
            parse_manifest(content),
            Some(("http://127.0.0.1:5".to_string(), "q1".to_string()))
        );
    }

    #[test]
    fn rejects_malformed_or_missing() {
        assert_eq!(parse_manifest("{}"), None);
        assert_eq!(parse_manifest("not json"), None);
        // 无 token（header 与 query 都没有）→ None。
        let no_token = r#"{"mcpServers":{"ccpanes":{"url":"http://127.0.0.1:5/mcp"}}}"#;
        assert_eq!(parse_manifest(no_token), None);
    }

    #[test]
    fn selects_reachable_manifest_over_newer_unreachable_manifest() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().expect("addr").port();
        let reachable = EndpointCandidate {
            base_url: format!("http://127.0.0.1:{port}"),
            token: "reachable".to_string(),
            modified: SystemTime::UNIX_EPOCH,
        };
        let unreachable = EndpointCandidate {
            base_url: "http://127.0.0.1:9".to_string(),
            token: "newer".to_string(),
            modified: SystemTime::UNIX_EPOCH + Duration::from_secs(60),
        };

        assert_eq!(
            select_manifest_endpoint(vec![unreachable, reachable]),
            Some((format!("http://127.0.0.1:{port}"), "reachable".to_string()))
        );
    }

    #[test]
    fn selects_newest_manifest_when_none_reachable_outside_wsl() {
        if running_in_wsl() {
            return;
        }
        let old = EndpointCandidate {
            base_url: "http://127.0.0.1:9".to_string(),
            token: "old".to_string(),
            modified: SystemTime::UNIX_EPOCH,
        };
        let new = EndpointCandidate {
            base_url: "http://127.0.0.1:10".to_string(),
            token: "new".to_string(),
            modified: SystemTime::UNIX_EPOCH + Duration::from_secs(60),
        };

        assert_eq!(
            select_manifest_endpoint(vec![old, new]),
            Some(("http://127.0.0.1:10".to_string(), "new".to_string()))
        );
    }

    #[test]
    fn rewrites_loopback_base_url_host() {
        assert_eq!(
            rewrite_base_url_host("http://127.0.0.1:61012", "172.20.16.1"),
            Some("http://172.20.16.1:61012".to_string())
        );
    }
}
