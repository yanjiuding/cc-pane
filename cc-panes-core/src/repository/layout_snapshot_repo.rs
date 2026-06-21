use crate::models::{LayoutSnapshot, SaveLayoutSnapshotRequest};
use crate::repository::Database;
use std::sync::Arc;

pub struct LayoutSnapshotRepository {
    db: Arc<Database>,
}

impl LayoutSnapshotRepository {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    pub fn save_snapshot(&self, snapshot: &SaveLayoutSnapshotRequest) -> Result<(), String> {
        let conn = self.db.connection().map_err(|e| e.to_string())?;
        let payload = serde_json::to_string(&snapshot.payload)
            .map_err(|e| format!("Failed to serialize layout payload: {}", e))?;
        conn.execute(
            "INSERT INTO layout_snapshots (
                profile_id, workspace_id, workspace_name, payload_json, saved_at, source
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(profile_id) DO UPDATE SET
                workspace_id = excluded.workspace_id,
                workspace_name = excluded.workspace_name,
                payload_json = excluded.payload_json,
                saved_at = excluded.saved_at,
                source = excluded.source",
            rusqlite::params![
                snapshot.profile_id,
                snapshot.workspace_id,
                snapshot.workspace_name,
                payload,
                snapshot.saved_at,
                snapshot.source,
            ],
        )
        .map_err(|e| format!("Failed to save layout snapshot: {}", e))?;
        Ok(())
    }

    pub fn load_snapshot(&self, profile_id: &str) -> Result<Option<LayoutSnapshot>, String> {
        let conn = self.db.connection().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT profile_id, workspace_id, workspace_name, payload_json, saved_at, source
                 FROM layout_snapshots
                 WHERE profile_id = ?1",
            )
            .map_err(|e| format!("Failed to prepare layout snapshot query: {}", e))?;

        let result = stmt.query_row([profile_id], |row| {
            let payload_json: String = row.get(3)?;
            let payload = serde_json::from_str(&payload_json).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    3,
                    rusqlite::types::Type::Text,
                    Box::new(e),
                )
            })?;
            Ok(LayoutSnapshot {
                profile_id: row.get(0)?,
                workspace_id: row.get(1)?,
                workspace_name: row.get(2)?,
                payload,
                saved_at: row.get(4)?,
                source: row.get(5)?,
            })
        });

        match result {
            Ok(snapshot) => Ok(Some(snapshot)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(format!("Failed to load layout snapshot: {}", e)),
        }
    }

    pub fn clear_snapshot(&self, profile_id: &str) -> Result<(), String> {
        let conn = self.db.connection().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM layout_snapshots WHERE profile_id = ?1",
            [profile_id],
        )
        .map_err(|e| format!("Failed to clear layout snapshot: {}", e))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn request(profile_id: &str, saved_at: &str, title: &str) -> SaveLayoutSnapshotRequest {
        SaveLayoutSnapshotRequest {
            profile_id: profile_id.to_string(),
            workspace_id: Some("workspace-1".to_string()),
            workspace_name: Some("Workspace One".to_string()),
            payload: json!({
                "layouts": [{
                    "id": "layout-1",
                    "name": "main",
                    "rootPane": {
                        "type": "panel",
                        "id": "panel-1",
                        "tabs": [{
                            "id": "tab-1",
                            "title": title,
                            "contentType": "terminal",
                            "sessionId": "session-1"
                        }],
                        "activeTabId": "tab-1"
                    },
                    "activePaneId": "panel-1"
                }],
                "currentLayoutId": "layout-1"
            }),
            saved_at: saved_at.to_string(),
            source: "desktop".to_string(),
        }
    }

    #[test]
    fn save_and_load_snapshot_round_trips_opaque_payload() {
        let db = Arc::new(Database::new_in_memory().expect("db"));
        let repo = LayoutSnapshotRepository::new(db);

        repo.save_snapshot(&request("default", "2026-06-21T01:00:00Z", "Codex"))
            .expect("save");

        let loaded = repo
            .load_snapshot("default")
            .expect("load")
            .expect("snapshot");
        assert_eq!(loaded.profile_id, "default");
        assert_eq!(loaded.workspace_id.as_deref(), Some("workspace-1"));
        assert_eq!(
            loaded.payload["layouts"][0]["rootPane"]["tabs"][0]["sessionId"],
            "session-1"
        );
    }

    #[test]
    fn save_replaces_existing_profile_snapshot() {
        let db = Arc::new(Database::new_in_memory().expect("db"));
        let repo = LayoutSnapshotRepository::new(db);

        repo.save_snapshot(&request("default", "2026-06-21T01:00:00Z", "Old"))
            .expect("first save");
        repo.save_snapshot(&request("default", "2026-06-21T01:01:00Z", "New"))
            .expect("second save");

        let loaded = repo
            .load_snapshot("default")
            .expect("load")
            .expect("snapshot");
        assert_eq!(loaded.saved_at, "2026-06-21T01:01:00Z");
        assert_eq!(
            loaded.payload["layouts"][0]["rootPane"]["tabs"][0]["title"],
            "New"
        );
    }

    #[test]
    fn clear_snapshot_removes_only_matching_profile() {
        let db = Arc::new(Database::new_in_memory().expect("db"));
        let repo = LayoutSnapshotRepository::new(db);

        repo.save_snapshot(&request("default", "2026-06-21T01:00:00Z", "Default"))
            .expect("save default");
        repo.save_snapshot(&request("other", "2026-06-21T01:00:00Z", "Other"))
            .expect("save other");

        repo.clear_snapshot("default").expect("clear");

        assert!(repo
            .load_snapshot("default")
            .expect("load default")
            .is_none());
        assert!(repo.load_snapshot("other").expect("load other").is_some());
    }
}
