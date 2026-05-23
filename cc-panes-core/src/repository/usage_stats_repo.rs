use crate::models::{UsageScanState, UsageStatsDelta, UsageStatsRow, UsageTotals};
use crate::repository::Database;
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use std::sync::Arc;
use tracing::error;

pub struct UsageStatsRepository {
    db: Arc<Database>,
}

impl UsageStatsRepository {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    pub fn upsert_delta(&self, delta: &UsageStatsDelta) -> Result<(), String> {
        if delta.is_empty() {
            return Ok(());
        }

        let conn = self.db.connection().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO usage_stats (
                date, cli_tool, workspace_name, char_count, token_input, token_output,
                token_cache_read, token_cache_creation, updated_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(date, cli_tool, workspace_name) DO UPDATE SET
                char_count = char_count + excluded.char_count,
                token_input = token_input + excluded.token_input,
                token_output = token_output + excluded.token_output,
                token_cache_read = token_cache_read + excluded.token_cache_read,
                token_cache_creation = token_cache_creation + excluded.token_cache_creation,
                updated_at = excluded.updated_at",
            params![
                delta.date,
                delta.cli_tool,
                delta.workspace_name,
                delta.char_count as i64,
                delta.token_input as i64,
                delta.token_output as i64,
                delta.token_cache_read as i64,
                delta.token_cache_creation as i64,
                now,
            ],
        )
        .map_err(|e| {
            error!(table = "usage_stats", err = %e, "SQL upsert_delta failed");
            e.to_string()
        })?;
        Ok(())
    }

    pub fn upsert_deltas(&self, deltas: &[UsageStatsDelta]) -> Result<(), String> {
        for delta in deltas {
            self.upsert_delta(delta)?;
        }
        Ok(())
    }

    pub fn query_rows(
        &self,
        start_date: &str,
        workspace_filter: Option<&str>,
    ) -> Result<Vec<UsageStatsRow>, String> {
        let conn = self.db.connection().map_err(|e| e.to_string())?;
        let mut rows = Vec::new();

        if let Some(workspace) = workspace_filter {
            let mut stmt = conn
                .prepare(
                    "SELECT date, cli_tool,
                        SUM(char_count),
                        SUM(token_input),
                        SUM(token_output),
                        SUM(token_cache_read),
                        SUM(token_cache_creation)
                     FROM usage_stats
                     WHERE date >= ?1 AND workspace_name = ?2
                     GROUP BY date, cli_tool
                     ORDER BY date ASC",
                )
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map(params![start_date, workspace], row_to_usage_stats_row)
                .map_err(|e| e.to_string())?;
            for row in mapped {
                rows.push(row.map_err(|e| e.to_string())?);
            }
        } else {
            let mut stmt = conn
                .prepare(
                    "SELECT date, cli_tool,
                        SUM(char_count),
                        SUM(token_input),
                        SUM(token_output),
                        SUM(token_cache_read),
                        SUM(token_cache_creation)
                     FROM usage_stats
                     WHERE date >= ?1
                     GROUP BY date, cli_tool
                     ORDER BY date ASC",
                )
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map(params![start_date], row_to_usage_stats_row)
                .map_err(|e| e.to_string())?;
            for row in mapped {
                rows.push(row.map_err(|e| e.to_string())?);
            }
        }

        Ok(rows)
    }

    pub fn list_workspaces(&self) -> Result<Vec<String>, String> {
        let conn = self.db.connection().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT workspace_name
                 FROM usage_stats
                 ORDER BY CASE WHEN workspace_name = '_global' THEN 0 ELSE 1 END, workspace_name",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn get_scan_state(&self, jsonl_path: &str) -> Result<Option<UsageScanState>, String> {
        let conn = self.db.connection().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT jsonl_path, last_byte_offset, last_mtime_ms, scanned_at
             FROM usage_scan_state
             WHERE jsonl_path = ?1",
            params![jsonl_path],
            |row| {
                let offset: i64 = row.get(1)?;
                Ok(UsageScanState {
                    jsonl_path: row.get(0)?,
                    last_byte_offset: offset.max(0) as u64,
                    last_mtime_ms: row.get(2)?,
                    scanned_at: row.get(3)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())
    }

    pub fn upsert_scan_state(
        &self,
        jsonl_path: &str,
        last_byte_offset: u64,
        last_mtime_ms: i64,
    ) -> Result<(), String> {
        let conn = self.db.connection().map_err(|e| e.to_string())?;
        let scanned_at = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO usage_scan_state (
                jsonl_path, last_byte_offset, last_mtime_ms, scanned_at
             )
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(jsonl_path) DO UPDATE SET
                last_byte_offset = excluded.last_byte_offset,
                last_mtime_ms = excluded.last_mtime_ms,
                scanned_at = excluded.scanned_at",
            params![
                jsonl_path,
                last_byte_offset as i64,
                last_mtime_ms,
                scanned_at,
            ],
        )
        .map_err(|e| {
            error!(table = "usage_scan_state", path = %jsonl_path, err = %e, "SQL upsert_scan_state failed");
            e.to_string()
        })?;
        Ok(())
    }
}

fn row_to_usage_stats_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<UsageStatsRow> {
    Ok(UsageStatsRow {
        date: row.get(0)?,
        cli_tool: row.get(1)?,
        totals: UsageTotals {
            char_count: i64_to_u64(row.get(2)?),
            token_input: i64_to_u64(row.get(3)?),
            token_output: i64_to_u64(row.get(4)?),
            token_cache_read: i64_to_u64(row.get(5)?),
            token_cache_creation: i64_to_u64(row.get(6)?),
        },
    })
}

fn i64_to_u64(value: i64) -> u64 {
    value.max(0) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo() -> UsageStatsRepository {
        let db = Arc::new(Database::new_in_memory().expect("in-memory db"));
        UsageStatsRepository::new(db)
    }

    #[test]
    fn upsert_delta_accumulates_same_key() {
        let repo = repo();
        let mut delta = UsageStatsDelta {
            date: "2026-05-23".to_string(),
            cli_tool: "claude".to_string(),
            workspace_name: "main".to_string(),
            char_count: 5,
            token_input: 10,
            token_output: 20,
            token_cache_read: 30,
            token_cache_creation: 40,
        };
        repo.upsert_delta(&delta).expect("first upsert");

        delta.char_count = 7;
        delta.token_input = 11;
        delta.token_output = 13;
        delta.token_cache_read = 17;
        delta.token_cache_creation = 19;
        repo.upsert_delta(&delta).expect("second upsert");

        let rows = repo
            .query_rows("2026-05-01", Some("main"))
            .expect("query rows");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].totals.char_count, 12);
        assert_eq!(rows[0].totals.token_input, 21);
        assert_eq!(rows[0].totals.token_output, 33);
        assert_eq!(rows[0].totals.token_cache_read, 47);
        assert_eq!(rows[0].totals.token_cache_creation, 59);
    }
}
