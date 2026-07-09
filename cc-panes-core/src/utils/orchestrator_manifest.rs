use std::path::Path;

pub const ORCHESTRATOR_MANIFEST_FILE: &str = "mcp-orchestrator.json";

pub fn read_endpoint(data_dir: &Path) -> Option<(u16, String)> {
    let content = std::fs::read_to_string(data_dir.join(ORCHESTRATOR_MANIFEST_FILE)).ok()?;
    parse_endpoint(&content)
}

pub fn parse_endpoint(content: &str) -> Option<(u16, String)> {
    let json: serde_json::Value = serde_json::from_str(content).ok()?;
    let url = json.pointer("/mcpServers/ccpanes/url")?.as_str()?;
    let port = parse_orchestrator_port_from_url(url)?;
    let token = json
        .pointer("/mcpServers/ccpanes/headers/Authorization")
        .and_then(|value| value.as_str())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::to_string)?;
    (!token.is_empty()).then_some((port, token))
}

pub fn parse_orchestrator_port_from_url(url: &str) -> Option<u16> {
    let parsed = url::Url::parse(url).ok()?;
    if !parsed.path().starts_with("/mcp") {
        return None;
    }
    parsed.port()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_orchestrator_port_from_url_extracts_port() {
        assert_eq!(
            parse_orchestrator_port_from_url("http://127.0.0.1:61012/mcp?token=abc"),
            Some(61012)
        );
        assert_eq!(
            parse_orchestrator_port_from_url("http://127.0.0.1:8/mcp"),
            Some(8)
        );
        assert_eq!(
            parse_orchestrator_port_from_url("http://127.0.0.1/mcp"),
            None
        );
        assert_eq!(
            parse_orchestrator_port_from_url("http://127.0.0.1:61012/other?token=abc"),
            None
        );
        assert_eq!(parse_orchestrator_port_from_url("not-a-url"), None);
    }

    #[test]
    fn parse_endpoint_reuses_port_and_token() {
        let content = r#"{"mcpServers":{"ccpanes":{"type":"http",
            "url":"http://127.0.0.1:61012/mcp?token=deadbeef",
            "headers":{"Authorization":"Bearer deadbeef"}}}}"#;
        assert_eq!(
            parse_endpoint(content),
            Some((61012, "deadbeef".to_string()))
        );
    }

    #[test]
    fn parse_endpoint_rejects_malformed() {
        assert_eq!(parse_endpoint("{}"), None);
        assert_eq!(parse_endpoint("not json"), None);
        let no_auth = r#"{"mcpServers":{"ccpanes":{"url":"http://127.0.0.1:61012/mcp"}}}"#;
        assert_eq!(parse_endpoint(no_auth), None);
        let no_port = r#"{"mcpServers":{"ccpanes":{"url":"http://127.0.0.1/mcp","headers":{"Authorization":"Bearer token"}}}}"#;
        assert_eq!(parse_endpoint(no_port), None);
    }
}
