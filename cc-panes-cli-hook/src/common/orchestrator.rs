//! Orchestrator 端点解析：优先环境变量，缺失时回退运行时文件 `mcp-orchestrator.json`。
//!
//! resume / 重启后仍在跑的会话可能拿不到 `CC_PANES_API_*` 环境变量（老 orchestrator
//! 已带着旧端口+token 退出）。此时从主进程每次启动都刷新的 `mcp-orchestrator.json`
//! 读回**当前**端点，让 hook 的 REST 调用不至于 `both missing` 直接失败。

use std::collections::HashMap;
use std::path::PathBuf;

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

/// 解析 orchestrator 端点为 `(base_url, token)`。
/// 优先环境变量（`CC_PANES_API_BASE_URL` 或 `CC_PANES_API_PORT` + `CC_PANES_API_TOKEN`），
/// 都缺失时回退读 `mcp-orchestrator.json`（跨重启拿当前端口+token）。
pub fn resolve_api_endpoint() -> Option<(String, String)> {
    endpoint_from_env().or_else(endpoint_from_manifest)
}

fn endpoint_from_env() -> Option<(String, String)> {
    let base = non_empty_var("CC_PANES_API_BASE_URL").or_else(|| {
        non_empty_var("CC_PANES_API_PORT").map(|port| format!("http://127.0.0.1:{}", port))
    })?;
    let token = non_empty_var("CC_PANES_API_TOKEN")?;
    Some((base, token))
}

fn endpoint_from_manifest() -> Option<(String, String)> {
    let path = find_orchestrator_config()?;
    let content = std::fs::read_to_string(&path).ok()?;
    parse_manifest(&content)
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

fn find_orchestrator_config() -> Option<PathBuf> {
    if let Some(dir) = non_empty_var("CC_PANES_DATA_DIR") {
        let path = PathBuf::from(dir).join("mcp-orchestrator.json");
        if path.exists() {
            return Some(path);
        }
    }
    let home = dirs::home_dir()?;
    for dir_name in [".cc-panes", ".cc-panes-dev"] {
        let path = home.join(dir_name).join("mcp-orchestrator.json");
        if path.exists() {
            return Some(path);
        }
    }
    None
}

fn non_empty_var(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

/// 从 `http://host:port/mcp?...` 取 `http://host:port`。
fn url_base(url: &str) -> Option<String> {
    let (scheme, rest) = url.split_once("://")?;
    let authority = rest.split('/').next()?;
    (!authority.is_empty()).then(|| format!("{}://{}", scheme, authority))
}

fn token_from_query(url: &str) -> Option<String> {
    let query = url.split('?').nth(1)?;
    query
        .split('&')
        .find_map(|kv| kv.strip_prefix("token=").map(str::to_string))
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
        let content =
            r#"{"mcpServers":{"ccpanes":{"url":"http://127.0.0.1:5/mcp?token=q1"}}}"#;
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
}
