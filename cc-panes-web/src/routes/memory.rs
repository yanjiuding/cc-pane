use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use cc_memory::models::{
    Memory, MemoryQuery, MemoryQueryResult, MemoryScope, MemoryStats, StoreMemoryRequest,
    UpdateMemoryRequest,
};
use serde::Deserialize;

use crate::state::AppState;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListMemoriesQuery {
    pub scope: Option<MemoryScope>,
    pub workspace_name: Option<String>,
    pub project_path: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryStatsQuery {
    pub workspace_name: Option<String>,
    pub project_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareSessionContextRequest {
    pub project_path: String,
    pub memory_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatMemoryRequest {
    pub memory_ids: Vec<String>,
}

fn service_error(error: impl ToString) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, error.to_string())
}

pub async fn search_memory(
    State(state): State<AppState>,
    Json(query): Json<MemoryQuery>,
) -> Result<Json<MemoryQueryResult>, (StatusCode, String)> {
    state
        .memory_service
        .search(query)
        .map(Json)
        .map_err(service_error)
}

pub async fn store_memory(
    State(state): State<AppState>,
    Json(request): Json<StoreMemoryRequest>,
) -> Result<(StatusCode, Json<Memory>), (StatusCode, String)> {
    let memory = state.memory_service.store(request).map_err(service_error)?;
    Ok((StatusCode::CREATED, Json(memory)))
}

pub async fn list_memories(
    State(state): State<AppState>,
    Query(query): Query<ListMemoriesQuery>,
) -> Result<Json<MemoryQueryResult>, (StatusCode, String)> {
    state
        .memory_service
        .list(
            query.scope,
            query.workspace_name.as_deref(),
            query.project_path.as_deref(),
            query.limit,
            query.offset,
        )
        .map(Json)
        .map_err(service_error)
}

pub async fn get_memory(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Option<Memory>>, (StatusCode, String)> {
    state
        .memory_service
        .get(&id)
        .map(Json)
        .map_err(service_error)
}

pub async fn update_memory(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<UpdateMemoryRequest>,
) -> Result<Json<bool>, (StatusCode, String)> {
    state
        .memory_service
        .update(&id, request)
        .map(Json)
        .map_err(service_error)
}

pub async fn delete_memory(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<bool>, (StatusCode, String)> {
    state
        .memory_service
        .delete(&id)
        .map(Json)
        .map_err(service_error)
}

pub async fn get_memory_stats(
    State(state): State<AppState>,
    Query(query): Query<MemoryStatsQuery>,
) -> Result<Json<MemoryStats>, (StatusCode, String)> {
    state
        .memory_service
        .stats(
            query.workspace_name.as_deref(),
            query.project_path.as_deref(),
        )
        .map(Json)
        .map_err(service_error)
}

pub async fn prepare_session_context(
    State(state): State<AppState>,
    Json(request): Json<PrepareSessionContextRequest>,
) -> Result<Json<String>, (StatusCode, String)> {
    state
        .memory_service
        .prepare_session_context(&request.project_path, &request.memory_ids)
        .map(Json)
        .map_err(service_error)
}

pub async fn format_memory_for_injection(
    State(state): State<AppState>,
    Json(request): Json<FormatMemoryRequest>,
) -> Result<Json<String>, (StatusCode, String)> {
    state
        .memory_service
        .format_for_injection(&request.memory_ids)
        .map(Json)
        .map_err(service_error)
}

#[cfg(test)]
#[path = "memory_tests.rs"]
mod memory_tests;
