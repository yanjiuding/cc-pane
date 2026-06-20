use std::collections::HashMap;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use cc_panes_core::{
    models::shared_mcp::{SharedMcpConfig, SharedMcpServerConfig, SharedMcpServerInfo},
    services::mcp_config_service::McpServerConfig,
    utils::{validate_command, validate_mcp_name, validate_path},
};
use serde::Deserialize;

use crate::state::AppState;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMcpQuery {
    pub project_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertMcpServerRequest {
    pub project_path: String,
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveMcpServerQuery {
    pub project_path: String,
    pub name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedServerRequest {
    pub name: String,
    pub config: SharedMcpServerConfig,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedGlobalConfigRequest {
    pub port_range_start: u16,
    pub port_range_end: u16,
    pub health_check_interval_secs: u64,
    pub max_restarts: u32,
}

fn service_error(error: impl ToString) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, error.to_string())
}

pub async fn list_mcp_servers(
    State(state): State<AppState>,
    Query(query): Query<ProjectMcpQuery>,
) -> Result<Json<HashMap<String, McpServerConfig>>, (StatusCode, String)> {
    validate_path(&query.project_path).map_err(service_error)?;
    state
        .mcp_config_service
        .list_mcp_servers(&query.project_path)
        .map(Json)
        .map_err(service_error)
}

pub async fn get_mcp_server(
    State(state): State<AppState>,
    Path(name): Path<String>,
    Query(query): Query<ProjectMcpQuery>,
) -> Result<Json<Option<McpServerConfig>>, (StatusCode, String)> {
    validate_path(&query.project_path).map_err(service_error)?;
    state
        .mcp_config_service
        .get_mcp_server(&query.project_path, &name)
        .map(Json)
        .map_err(service_error)
}

pub async fn upsert_mcp_server(
    State(state): State<AppState>,
    Json(req): Json<UpsertMcpServerRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    validate_path(&req.project_path).map_err(service_error)?;
    validate_mcp_name(&req.name).map_err(service_error)?;
    validate_command(&req.command).map_err(service_error)?;
    let config = McpServerConfig {
        command: req.command,
        args: req.args,
        env: req.env,
    };
    state
        .mcp_config_service
        .upsert_mcp_server(&req.project_path, &req.name, config)
        .map_err(service_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn remove_mcp_server(
    State(state): State<AppState>,
    Query(query): Query<RemoveMcpServerQuery>,
) -> Result<Json<bool>, (StatusCode, String)> {
    validate_path(&query.project_path).map_err(service_error)?;
    state
        .mcp_config_service
        .remove_mcp_server(&query.project_path, &query.name)
        .map(Json)
        .map_err(service_error)
}

pub async fn get_shared_mcp_config(State(state): State<AppState>) -> Json<SharedMcpConfig> {
    Json(state.shared_mcp_service.get_config())
}

pub async fn get_shared_mcp_status(
    State(state): State<AppState>,
) -> Json<Vec<SharedMcpServerInfo>> {
    Json(state.shared_mcp_service.get_all_status())
}

pub async fn upsert_shared_mcp_server(
    State(state): State<AppState>,
    Json(req): Json<SharedServerRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    validate_mcp_name(&req.name).map_err(service_error)?;
    validate_command(&req.config.command).map_err(service_error)?;
    state
        .shared_mcp_service
        .upsert_server(&req.name, req.config)
        .map_err(service_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn remove_shared_mcp_server(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    state
        .shared_mcp_service
        .remove_server(&name)
        .map_err(service_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn start_shared_mcp_server(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    state
        .shared_mcp_service
        .start_server(&name)
        .map_err(service_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn stop_shared_mcp_server(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> StatusCode {
    state.shared_mcp_service.stop_server(&name);
    StatusCode::NO_CONTENT
}

pub async fn restart_shared_mcp_server(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    state
        .shared_mcp_service
        .restart_server(&name)
        .map_err(service_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn update_shared_mcp_global_config(
    State(state): State<AppState>,
    Json(req): Json<SharedGlobalConfigRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    state
        .shared_mcp_service
        .update_global_config(
            req.port_range_start,
            req.port_range_end,
            req.health_check_interval_secs,
            req.max_restarts,
        )
        .map_err(service_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn import_shared_mcp_from_claude(
    State(state): State<AppState>,
) -> Result<Json<Vec<String>>, (StatusCode, String)> {
    state
        .shared_mcp_service
        .import_from_claude_json()
        .map(Json)
        .map_err(service_error)
}

#[cfg(test)]
#[path = "mcp_tests.rs"]
mod mcp_tests;
