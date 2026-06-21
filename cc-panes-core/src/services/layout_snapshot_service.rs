use crate::models::{LayoutSnapshot, SaveLayoutSnapshotRequest};
use crate::repository::{Database, LayoutSnapshotRepository};
use std::sync::Arc;

pub struct LayoutSnapshotService {
    repo: LayoutSnapshotRepository,
}

impl LayoutSnapshotService {
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            repo: LayoutSnapshotRepository::new(db),
        }
    }

    pub fn save_snapshot(&self, snapshot: &SaveLayoutSnapshotRequest) -> Result<(), String> {
        validate_profile_id(&snapshot.profile_id)?;
        self.repo.save_snapshot(snapshot)
    }

    pub fn load_snapshot(&self, profile_id: &str) -> Result<Option<LayoutSnapshot>, String> {
        validate_profile_id(profile_id)?;
        self.repo.load_snapshot(profile_id)
    }

    pub fn clear_snapshot(&self, profile_id: &str) -> Result<(), String> {
        validate_profile_id(profile_id)?;
        self.repo.clear_snapshot(profile_id)
    }
}

fn validate_profile_id(profile_id: &str) -> Result<(), String> {
    if profile_id.trim().is_empty() {
        return Err("profileId cannot be empty".to_string());
    }
    if !profile_id
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.')
    {
        return Err(
            "profileId may only contain ASCII letters, numbers, '-', '_' or '.'".to_string(),
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rejects_empty_profile_id() {
        let db = Arc::new(Database::new_in_memory().expect("db"));
        let service = LayoutSnapshotService::new(db);
        let request = SaveLayoutSnapshotRequest {
            profile_id: " ".to_string(),
            workspace_id: None,
            workspace_name: None,
            payload: json!({}),
            saved_at: "2026-06-21T01:00:00Z".to_string(),
            source: "desktop".to_string(),
        };

        let error = service.save_snapshot(&request).expect_err("should reject");
        assert!(error.contains("profileId"));
    }
}
