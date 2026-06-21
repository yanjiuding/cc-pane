use cc_panes_core::models::{LayoutSnapshot, SaveLayoutSnapshotRequest};
use cc_panes_core::services::LayoutSnapshotService;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn save_layout_snapshot(
    snapshot: SaveLayoutSnapshotRequest,
    service: State<'_, Arc<LayoutSnapshotService>>,
) -> Result<(), String> {
    service.save_snapshot(&snapshot)
}

#[tauri::command]
pub async fn load_layout_snapshot(
    profile_id: String,
    service: State<'_, Arc<LayoutSnapshotService>>,
) -> Result<Option<LayoutSnapshot>, String> {
    service.load_snapshot(&profile_id)
}

#[tauri::command]
pub async fn clear_layout_snapshot(
    profile_id: String,
    service: State<'_, Arc<LayoutSnapshotService>>,
) -> Result<(), String> {
    service.clear_snapshot(&profile_id)
}
