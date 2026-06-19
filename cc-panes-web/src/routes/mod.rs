pub mod resources;
pub mod static_files;
pub mod terminal;

use axum::{
    routing::{delete, get, patch, post, put},
    Router,
};
use tower_http::cors::CorsLayer;

use crate::state::AppState;
use crate::ws_handler::ws_upgrade;

/// Build the axum router with all routes.
pub fn build_router(state: AppState) -> Router {
    let api = Router::new()
        .route("/api/sessions", post(terminal::create_session))
        .route("/api/sessions", get(terminal::list_sessions))
        .route(
            "/api/sessions/{id}/status",
            get(terminal::get_session_status),
        )
        .route(
            "/api/sessions/{id}/output",
            get(terminal::get_session_output),
        )
        .route(
            "/api/sessions/{id}/snapshot",
            get(terminal::get_session_snapshot),
        )
        .route("/api/sessions/{id}/write", post(terminal::write_session))
        .route("/api/sessions/{id}/submit", post(terminal::submit_session))
        .route("/api/sessions/{id}/resize", post(terminal::resize_session))
        .route("/api/sessions/{id}", delete(terminal::kill_session))
        .route("/api/workspaces", get(resources::list_workspaces))
        .route("/api/workspaces", post(resources::create_workspace))
        .route(
            "/api/workspaces/reorder",
            post(resources::reorder_workspaces),
        )
        .route("/api/workspaces/{name}", get(resources::get_workspace))
        .route(
            "/api/workspaces/{name}",
            delete(resources::delete_workspace),
        )
        .route(
            "/api/workspaces/{name}/rename",
            post(resources::rename_workspace),
        )
        .route(
            "/api/workspaces/{name}/alias",
            patch(resources::update_workspace_alias),
        )
        .route(
            "/api/workspaces/{name}/path",
            patch(resources::update_workspace_path),
        )
        .route(
            "/api/workspaces/{name}/provider",
            patch(resources::update_workspace_provider),
        )
        .route(
            "/api/workspaces/{name}/projects",
            post(resources::add_workspace_project),
        )
        .route(
            "/api/workspaces/{name}/ssh-projects",
            post(resources::add_workspace_ssh_project),
        )
        .route(
            "/api/workspaces/{name}/projects/{project_id}",
            delete(resources::remove_workspace_project),
        )
        .route(
            "/api/workspaces/{name}/projects/{project_id}/alias",
            patch(resources::update_workspace_project_alias),
        )
        .route("/api/projects", get(resources::list_projects))
        .route("/api/projects", post(resources::add_project))
        .route("/api/projects/{id}", get(resources::get_project))
        .route("/api/projects/{id}", delete(resources::remove_project))
        .route(
            "/api/projects/{id}/name",
            patch(resources::update_project_name),
        )
        .route(
            "/api/projects/{id}/alias",
            patch(resources::update_project_alias),
        )
        .route("/api/providers", get(resources::list_providers))
        .route("/api/providers", post(resources::add_provider))
        .route(
            "/api/providers/default",
            get(resources::get_default_provider),
        )
        .route(
            "/api/providers/default",
            post(resources::set_default_provider),
        )
        .route("/api/providers/{id}", get(resources::get_provider))
        .route("/api/providers/{id}", put(resources::update_provider))
        .route("/api/providers/{id}", delete(resources::remove_provider))
        .route("/api/settings", get(resources::get_settings))
        .route("/api/settings", put(resources::update_settings))
        .route("/api/fs/list", get(resources::fs_list_directory))
        .route("/api/fs/read", get(resources::fs_read_file))
        .route("/api/fs/write", post(resources::fs_write_file))
        .route("/api/fs/create-file", post(resources::fs_create_file))
        .route(
            "/api/fs/create-directory",
            post(resources::fs_create_directory),
        )
        .route("/api/fs/delete", post(resources::fs_delete_entry))
        .route("/api/fs/rename", post(resources::fs_rename_entry))
        .route("/api/fs/copy", post(resources::fs_copy_entry))
        .route("/api/fs/move", post(resources::fs_move_entry))
        .route("/api/fs/info", get(resources::fs_get_entry_info));

    let ws = Router::new().route("/ws/{session_id}", get(ws_upgrade));

    Router::new()
        .merge(api)
        .merge(ws)
        .fallback(static_files::static_handler)
        .layer(CorsLayer::permissive())
        .with_state(state)
}
