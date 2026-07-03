use axum::extract::Query;
use serde_json::json;

use super::*;

fn unique_missing_project_path(tag: &str) -> String {
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("system clock")
        .as_millis();
    std::env::temp_dir()
        .join(format!(
            "cc-panes-web-agent-sessions-{tag}-{millis}-{}-missing",
            std::process::id()
        ))
        .to_string_lossy()
        .to_string()
}

#[tokio::test]
async fn list_claude_sessions_returns_empty_for_unknown_project() {
    let Json(sessions) = list_claude_sessions(Query(ProjectSessionsQuery {
        project_path: unique_missing_project_path("claude"),
        runtime_kind: None,
        wsl_distro: None,
        limit: None,
    }))
    .await
    .expect("list claude sessions");

    assert!(sessions.is_empty());
}

#[tokio::test]
async fn list_all_claude_sessions_honors_zero_limit() {
    let Json(sessions) = list_all_claude_sessions(Query(SessionLimitQuery { limit: Some(0) }))
        .await
        .expect("list all claude sessions");

    assert!(sessions.is_empty());
}

#[tokio::test]
async fn list_codex_sessions_returns_empty_for_unknown_project() {
    let Json(sessions) = list_codex_sessions(Query(ProjectSessionsQuery {
        project_path: unique_missing_project_path("codex"),
        runtime_kind: None,
        wsl_distro: None,
        limit: Some(5),
    }))
    .await
    .expect("list codex sessions");

    assert!(sessions.is_empty());
}

#[test]
fn project_sessions_query_uses_camel_case_field_names() {
    let query: ProjectSessionsQuery = serde_json::from_value(json!({
        "projectPath": "/repo",
        "runtimeKind": "wsl",
        "wslDistro": "Ubuntu",
        "limit": 3
    }))
    .expect("deserialize query");

    assert_eq!(query.project_path, "/repo");
    assert_eq!(query.runtime_kind.as_deref(), Some("wsl"));
    assert_eq!(query.wsl_distro.as_deref(), Some("Ubuntu"));
    assert_eq!(query.limit, Some(3));
}
