use serde::{Deserialize, Serialize};

/// Shared frontend layout snapshot used by desktop and Web clients.
///
/// The backend intentionally treats `payload` as opaque JSON. React owns the
/// pane/tree schema; Rust only persists and transports the latest snapshot.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LayoutSnapshot {
    pub profile_id: String,
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub workspace_name: Option<String>,
    pub payload: serde_json::Value,
    pub saved_at: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SaveLayoutSnapshotRequest {
    pub profile_id: String,
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub workspace_name: Option<String>,
    pub payload: serde_json::Value,
    pub saved_at: String,
    pub source: String,
}
