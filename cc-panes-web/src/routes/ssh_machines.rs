use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use cc_panes_core::{
    models::{SshMachine, SshMachineUpsertRequest},
    services::SshConnectivityResult,
    utils::validate_ssh_machine,
};

use crate::state::AppState;

fn service_error(error: impl ToString) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, error.to_string())
}

pub async fn list_ssh_machines(
    State(state): State<AppState>,
) -> Result<Json<Vec<SshMachine>>, (StatusCode, String)> {
    Ok(Json(state.ssh_machine_service.list()))
}

pub async fn get_ssh_machine(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Option<SshMachine>>, (StatusCode, String)> {
    Ok(Json(state.ssh_machine_service.get(&id)))
}

pub async fn add_ssh_machine(
    State(state): State<AppState>,
    Json(request): Json<SshMachineUpsertRequest>,
) -> Result<(StatusCode, Json<SshMachine>), (StatusCode, String)> {
    validate_ssh_machine(&request.machine).map_err(service_error)?;
    let machine = state
        .ssh_machine_service
        .add(request)
        .map_err(service_error)?;
    Ok((StatusCode::CREATED, Json(machine)))
}

pub async fn update_ssh_machine(
    State(state): State<AppState>,
    Json(request): Json<SshMachineUpsertRequest>,
) -> Result<Json<SshMachine>, (StatusCode, String)> {
    validate_ssh_machine(&request.machine).map_err(service_error)?;
    state
        .ssh_machine_service
        .update(request)
        .map(Json)
        .map_err(service_error)
}

pub async fn remove_ssh_machine(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    state
        .ssh_machine_service
        .remove(&id)
        .map_err(service_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn check_ssh_connectivity(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<SshConnectivityResult>, (StatusCode, String)> {
    state
        .ssh_machine_service
        .check_connectivity(&id)
        .await
        .map(Json)
        .map_err(service_error)
}

#[cfg(test)]
#[path = "ssh_machines_tests.rs"]
mod ssh_machines_tests;
