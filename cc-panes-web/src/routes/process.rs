use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use cc_panes_core::models::ProcessScanResult;
use serde::Deserialize;

use crate::state::AppState;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KillProcessesRequest {
    pub pids: Vec<u32>,
}

fn service_error(error: impl ToString) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, error.to_string())
}

pub async fn scan_claude_processes(
    State(state): State<AppState>,
) -> Result<Json<ProcessScanResult>, (StatusCode, String)> {
    let service = state.process_monitor_service.clone();
    tokio::task::spawn_blocking(move || service.scan_claude_processes())
        .await
        .map_err(service_error)?
        .map(Json)
        .map_err(service_error)
}

pub async fn kill_claude_process(
    State(state): State<AppState>,
    Path(pid): Path<u32>,
) -> Result<Json<bool>, (StatusCode, String)> {
    let service = state.process_monitor_service.clone();
    tokio::task::spawn_blocking(move || service.kill_process(pid))
        .await
        .map_err(service_error)?
        .map(Json)
        .map_err(service_error)
}

pub async fn kill_claude_processes(
    State(state): State<AppState>,
    Json(req): Json<KillProcessesRequest>,
) -> Result<Json<Vec<(u32, bool)>>, (StatusCode, String)> {
    let service = state.process_monitor_service.clone();
    tokio::task::spawn_blocking(move || service.kill_processes(req.pids))
        .await
        .map_err(service_error)?
        .map(Json)
        .map_err(service_error)
}
