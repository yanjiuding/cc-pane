use axum::{extract::Query, http::StatusCode, Json};
use cc_panes_core::services::{claude_session_service, codex_session_service};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSessionsQuery {
    pub project_path: String,
    pub runtime_kind: Option<String>,
    pub wsl_distro: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionLimitQuery {
    pub limit: Option<usize>,
}

fn service_error(error: impl ToString) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, error.to_string())
}

pub async fn list_claude_sessions(
    Query(query): Query<ProjectSessionsQuery>,
) -> Result<Json<Vec<claude_session_service::ClaudeSession>>, (StatusCode, String)> {
    claude_session_service::list_sessions(&query.project_path, query.limit.unwrap_or(10))
        .map(Json)
        .map_err(service_error)
}

pub async fn list_all_claude_sessions(
    Query(query): Query<SessionLimitQuery>,
) -> Result<Json<Vec<claude_session_service::ClaudeSession>>, (StatusCode, String)> {
    claude_session_service::list_all_sessions(query.limit.unwrap_or(20))
        .map(Json)
        .map_err(service_error)
}

pub async fn list_codex_sessions(
    Query(query): Query<ProjectSessionsQuery>,
) -> Result<Json<Vec<codex_session_service::CodexSession>>, (StatusCode, String)> {
    let limit = query.limit.unwrap_or(10);
    let result = if query.runtime_kind.as_deref() == Some("wsl") {
        codex_session_service::list_wsl_sessions(
            &query.project_path,
            limit,
            query.wsl_distro.as_deref(),
        )
    } else {
        codex_session_service::list_sessions(&query.project_path, limit)
    };
    result.map(Json).map_err(service_error)
}

#[cfg(test)]
#[path = "agent_sessions_tests.rs"]
mod agent_sessions_tests;
