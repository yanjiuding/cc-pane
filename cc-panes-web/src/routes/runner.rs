use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use cc_panes_core::models::{
    PortClaim, PortConflict, RunnerInstance, RunnerInstanceStatus, RunnerLaunchPlan, RunnerProfile,
    RunnerProfileDraft,
};
use serde::Deserialize;

use crate::state::AppState;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListRunnerProfilesQuery {
    pub project_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListActiveInstancesQuery {
    pub project_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortConflictsRequest {
    pub ports: Vec<u16>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkInstanceExitedRequest {
    pub exit_code: Option<i32>,
    pub orphaned: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KillPidRequest {
    pub pid: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterForSessionRequest {
    pub session_id: String,
    pub project_path: String,
    pub workspace_name: Option<String>,
    pub profile_id: Option<String>,
    pub runtime_kind: String,
    pub command: String,
    pub cwd: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterImplicitInstanceRequest {
    pub project_path: String,
    pub workspace_name: Option<String>,
    pub session_id: Option<String>,
    pub root_pid: u32,
    pub runtime_kind: String,
    pub command: String,
    pub cwd: String,
}

fn service_error(error: impl ToString) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, error.to_string())
}

pub async fn list_profiles(
    State(state): State<AppState>,
    Query(query): Query<ListRunnerProfilesQuery>,
) -> Result<Json<Vec<RunnerProfile>>, (StatusCode, String)> {
    state
        .runner_service
        .list_profiles(&query.project_path)
        .map(Json)
        .map_err(service_error)
}

pub async fn get_profile(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Option<RunnerProfile>>, (StatusCode, String)> {
    state
        .runner_service
        .get_profile(&id)
        .map(Json)
        .map_err(service_error)
}

pub async fn upsert_profile(
    State(state): State<AppState>,
    Json(draft): Json<RunnerProfileDraft>,
) -> Result<Json<RunnerProfile>, (StatusCode, String)> {
    state
        .runner_service
        .upsert_profile(draft)
        .map(Json)
        .map_err(service_error)
}

pub async fn delete_profile(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    state
        .runner_service
        .delete_profile(&id)
        .map_err(service_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn plan_launch(
    State(state): State<AppState>,
    Path(profile_id): Path<String>,
) -> Result<Json<RunnerLaunchPlan>, (StatusCode, String)> {
    state
        .runner_service
        .plan_launch(&profile_id)
        .map(Json)
        .map_err(service_error)
}

pub async fn list_active_instances(
    State(state): State<AppState>,
    Query(query): Query<ListActiveInstancesQuery>,
) -> Result<Json<Vec<RunnerInstance>>, (StatusCode, String)> {
    state
        .runner_service
        .list_active_instances(query.project_path.as_deref())
        .map(Json)
        .map_err(service_error)
}

pub async fn list_port_conflicts(
    State(state): State<AppState>,
    Json(req): Json<PortConflictsRequest>,
) -> Result<Json<Vec<PortConflict>>, (StatusCode, String)> {
    state
        .runner_service
        .find_conflicts(&req.ports, None)
        .map(Json)
        .map_err(service_error)
}

pub async fn refresh_port_claims(
    State(state): State<AppState>,
    Path(instance_id): Path<String>,
) -> Result<Json<Vec<PortClaim>>, (StatusCode, String)> {
    state
        .runner_service
        .refresh_port_claims(&instance_id)
        .map(Json)
        .map_err(service_error)
}

pub async fn mark_instance_exited(
    State(state): State<AppState>,
    Path(instance_id): Path<String>,
    Json(req): Json<MarkInstanceExitedRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let status = if req.orphaned.unwrap_or(false) {
        RunnerInstanceStatus::Orphaned
    } else {
        RunnerInstanceStatus::Exited
    };
    state
        .runner_service
        .mark_instance_exited(&instance_id, req.exit_code, status)
        .map_err(service_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn kill_instance(
    State(state): State<AppState>,
    Path(instance_id): Path<String>,
) -> Result<Json<bool>, (StatusCode, String)> {
    state
        .runner_service
        .kill_instance(&instance_id)
        .map(Json)
        .map_err(service_error)
}

pub async fn kill_pid(
    State(state): State<AppState>,
    Json(req): Json<KillPidRequest>,
) -> Result<Json<bool>, (StatusCode, String)> {
    state
        .process_monitor_service
        .kill_process(req.pid)
        .map(Json)
        .map_err(service_error)
}

pub async fn register_for_session(
    State(state): State<AppState>,
    Json(req): Json<RegisterForSessionRequest>,
) -> Result<Json<RunnerInstance>, (StatusCode, String)> {
    let statuses = state
        .terminal_backend
        .get_all_status()
        .map_err(service_error)?;
    let root_pid = statuses
        .into_iter()
        .find(|status| status.session_id == req.session_id)
        .and_then(|status| status.pid)
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                format!("session not found or no PID: {}", req.session_id),
            )
        })?;

    state
        .runner_service
        .register_instance(
            req.profile_id.as_deref(),
            &req.project_path,
            req.workspace_name.as_deref(),
            Some(&req.session_id),
            root_pid,
            &req.runtime_kind,
            &req.command,
            &req.cwd,
        )
        .map(Json)
        .map_err(service_error)
}

pub async fn register_implicit_instance(
    State(state): State<AppState>,
    Json(req): Json<RegisterImplicitInstanceRequest>,
) -> Result<Json<RunnerInstance>, (StatusCode, String)> {
    state
        .runner_service
        .register_implicit_instance(
            &req.project_path,
            req.workspace_name.as_deref(),
            req.session_id.as_deref(),
            req.root_pid,
            &req.runtime_kind,
            &req.command,
            &req.cwd,
        )
        .map(Json)
        .map_err(service_error)
}

#[cfg(test)]
#[path = "runner_tests.rs"]
mod runner_tests;
