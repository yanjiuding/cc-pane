use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use cc_panes_core::services::{JournalIndex, SessionSummary};
use serde::Deserialize;

use crate::state::AppState;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceNameQuery {
    pub workspace_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddJournalSessionRequest {
    pub workspace_name: String,
    pub title: String,
    pub summary: String,
    #[serde(default)]
    pub commits: Vec<String>,
}

fn service_error(error: impl ToString) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, error.to_string())
}

pub async fn add_journal_session(
    State(state): State<AppState>,
    Json(req): Json<AddJournalSessionRequest>,
) -> Result<Json<u32>, (StatusCode, String)> {
    let session = SessionSummary {
        title: req.title,
        summary: req.summary,
        commits: req.commits,
        date: chrono::Local::now().format("%Y-%m-%d").to_string(),
    };
    state
        .journal_service
        .add_session_by_workspace(&req.workspace_name, session)
        .map(Json)
        .map_err(service_error)
}

pub async fn get_journal_index(
    State(state): State<AppState>,
    Query(query): Query<WorkspaceNameQuery>,
) -> Result<Json<JournalIndex>, (StatusCode, String)> {
    state
        .journal_service
        .get_index_by_workspace(&query.workspace_name)
        .map(Json)
        .map_err(service_error)
}

pub async fn get_recent_journal(
    State(state): State<AppState>,
    Query(query): Query<WorkspaceNameQuery>,
) -> Result<Json<String>, (StatusCode, String)> {
    state
        .journal_service
        .get_recent_journal_by_workspace(&query.workspace_name)
        .map(Json)
        .map_err(service_error)
}
