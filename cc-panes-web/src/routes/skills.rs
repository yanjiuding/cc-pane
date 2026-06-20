use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use cc_panes_core::{
    models::DiscoveredExternalSkill,
    services::{skill_service::SkillInfo, skill_service::SkillSummary, InstalledUserSkill},
    utils::validate_path,
};
use serde::Deserialize;

use crate::state::AppState;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSkillsQuery {
    pub project_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillQuery {
    pub project_path: String,
    pub name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSkillRequest {
    pub project_path: String,
    pub name: String,
    pub content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CopySkillRequest {
    pub source_project: String,
    pub target_project: String,
    pub name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalSkillsQuery {
    pub source: Option<String>,
}

fn service_error(error: impl ToString) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, error.to_string())
}

fn validate_skill_name(name: &str) -> Result<(), (StatusCode, String)> {
    if name.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Skill name cannot be empty".to_string(),
        ));
    }
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err((
            StatusCode::BAD_REQUEST,
            "Skill name cannot contain path separators".to_string(),
        ));
    }
    if name.starts_with('.') {
        return Err((
            StatusCode::BAD_REQUEST,
            "Skill name cannot start with '.'".to_string(),
        ));
    }
    Ok(())
}

pub async fn list_skills(
    State(state): State<AppState>,
    Query(query): Query<ProjectSkillsQuery>,
) -> Result<Json<Vec<SkillSummary>>, (StatusCode, String)> {
    validate_path(&query.project_path).map_err(service_error)?;
    state
        .skill_service
        .list_skills(&query.project_path)
        .map(Json)
        .map_err(service_error)
}

pub async fn get_skill(
    State(state): State<AppState>,
    Path(name): Path<String>,
    Query(query): Query<ProjectSkillsQuery>,
) -> Result<Json<Option<SkillInfo>>, (StatusCode, String)> {
    validate_path(&query.project_path).map_err(service_error)?;
    validate_skill_name(&name)?;
    state
        .skill_service
        .get_skill(&query.project_path, &name)
        .map(Json)
        .map_err(service_error)
}

pub async fn save_skill(
    State(state): State<AppState>,
    Json(req): Json<SaveSkillRequest>,
) -> Result<Json<SkillInfo>, (StatusCode, String)> {
    validate_path(&req.project_path).map_err(service_error)?;
    validate_skill_name(&req.name)?;
    state
        .skill_service
        .save_skill(&req.project_path, &req.name, &req.content)
        .map(Json)
        .map_err(service_error)
}

pub async fn delete_skill(
    State(state): State<AppState>,
    Query(query): Query<SkillQuery>,
) -> Result<Json<bool>, (StatusCode, String)> {
    validate_path(&query.project_path).map_err(service_error)?;
    validate_skill_name(&query.name)?;
    state
        .skill_service
        .delete_skill(&query.project_path, &query.name)
        .map(Json)
        .map_err(service_error)
}

pub async fn copy_skill(
    State(state): State<AppState>,
    Json(req): Json<CopySkillRequest>,
) -> Result<Json<SkillInfo>, (StatusCode, String)> {
    validate_path(&req.source_project).map_err(service_error)?;
    validate_path(&req.target_project).map_err(service_error)?;
    validate_skill_name(&req.name)?;
    state
        .skill_service
        .copy_skill(&req.source_project, &req.target_project, &req.name)
        .map(Json)
        .map_err(service_error)
}

pub async fn list_external_skills(
    State(state): State<AppState>,
    Query(query): Query<ExternalSkillsQuery>,
) -> Result<Json<Vec<DiscoveredExternalSkill>>, (StatusCode, String)> {
    let source = query
        .source
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_ascii_lowercase);

    let skills = match source.as_deref() {
        None => state.external_skill_registry.list(),
        Some("claude" | "codex" | "plugin") => state
            .external_skill_registry
            .list_by_source_filter(source.as_deref().unwrap()),
        Some(other) => Err(format!(
            "Unsupported external skill source '{}'; expected claude, codex, or plugin",
            other
        )
        .into()),
    }
    .map_err(service_error)?;

    Ok(Json(skills))
}

pub async fn list_user_skills(
    State(state): State<AppState>,
) -> Result<Json<Vec<InstalledUserSkill>>, (StatusCode, String)> {
    state
        .user_skill_service
        .list_skills()
        .map(Json)
        .map_err(service_error)
}

pub async fn remove_user_skill(
    State(state): State<AppState>,
    Path(skill_id): Path<String>,
) -> Result<Json<bool>, (StatusCode, String)> {
    state
        .user_skill_service
        .remove_skill(&skill_id)
        .map(Json)
        .map_err(service_error)
}

#[cfg(test)]
#[path = "skills_tests.rs"]
mod skills_tests;
