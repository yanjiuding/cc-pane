use crate::models::{
    UsageDayPoint, UsageEntry, UsageQueryResult, UsageStatsDelta, UsageTotals,
};
use crate::repository::UsageStatsRepository;
use crate::services::{claude_session_service, codex_session_service, LaunchHistoryService};
use crate::utils::{error::AppError, AppResult};
use anyhow::{anyhow, Context, Result};
use chrono::{Duration as ChronoDuration, Local};
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tokio::time::{sleep, Duration};
use tracing::{error, warn};

const GLOBAL_WORKSPACE: &str = "_global";
const UNKNOWN_CLI: &str = "unknown";

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
struct UsageKey {
    date: String,
    cli_tool: String,
    workspace_name: String,
}

pub struct UsageStatsService {
    repo: Arc<UsageStatsRepository>,
    launch_history: Arc<LaunchHistoryService>,
    pending_inputs: Mutex<HashMap<UsageKey, u64>>,
    background_started: AtomicBool,
    scan_running: AtomicBool,
}

impl UsageStatsService {
    pub fn new(
        repo: Arc<UsageStatsRepository>,
        launch_history: Arc<LaunchHistoryService>,
    ) -> Self {
        Self {
            repo,
            launch_history,
            pending_inputs: Mutex::new(HashMap::new()),
            background_started: AtomicBool::new(false),
            scan_running: AtomicBool::new(false),
        }
    }

    pub fn start_background_tasks(self: &Arc<Self>) {
        if self
            .background_started
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return;
        }

        let flush_service = self.clone();
        tokio::spawn(async move {
            loop {
                sleep(Duration::from_secs(30)).await;
                let svc = flush_service.clone();
                match tokio::task::spawn_blocking(move || svc.flush_pending()).await {
                    Ok(Ok(())) => {}
                    Ok(Err(error)) => error!(err = %error, "Failed to flush usage input stats"),
                    Err(error) => error!(err = %error, "Usage input flush task failed"),
                }
            }
        });

        let scan_service = self.clone();
        tokio::spawn(async move {
            scan_service.refresh_usage_stats_logged();
            loop {
                sleep(Duration::from_secs(300)).await;
                scan_service.refresh_usage_stats_logged();
            }
        });
    }

    pub fn record_input(&self, session_id: &str, raw_text: &str) -> AppResult<()> {
        self.record_input_chars(session_id, count_input_chars(raw_text) as u32)
    }

    pub fn record_input_chars(&self, session_id: &str, char_count: u32) -> AppResult<()> {
        if char_count == 0 {
            return Ok(());
        }

        let (cli_tool, workspace_name) = self.resolve_pty_context(session_id);
        let key = UsageKey {
            date: today_string(),
            cli_tool,
            workspace_name,
        };
        let mut pending = self
            .pending_inputs
            .lock()
            .map_err(|_| AppError::from("Usage input accumulator lock poisoned"))?;
        *pending.entry(key).or_insert(0) += u64::from(char_count);
        Ok(())
    }

    pub fn flush_pending(&self) -> AppResult<()> {
        let pending = {
            let mut guard = self
                .pending_inputs
                .lock()
                .map_err(|_| AppError::from("Usage input accumulator lock poisoned"))?;
            std::mem::take(&mut *guard)
        };

        if pending.is_empty() {
            return Ok(());
        }

        let deltas = pending
            .into_iter()
            .map(|(key, char_count)| UsageStatsDelta {
                date: key.date,
                cli_tool: key.cli_tool,
                workspace_name: key.workspace_name,
                char_count,
                ..UsageStatsDelta::default()
            })
            .collect::<Vec<_>>();
        self.repo
            .upsert_deltas(&deltas)
            .map_err(AppError::from)?;
        Ok(())
    }

    pub fn refresh_usage_stats(&self) -> AppResult<()> {
        if self
            .scan_running
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Ok(());
        }

        struct ScanGuard<'a>(&'a AtomicBool);
        impl Drop for ScanGuard<'_> {
            fn drop(&mut self) {
                self.0.store(false, Ordering::SeqCst);
            }
        }
        let _guard = ScanGuard(&self.scan_running);

        self.scan_all_usage_files().map_err(AppError::from)
    }

    pub fn query_usage(
        &self,
        range_days: u32,
        workspace_filter: Option<String>,
    ) -> AppResult<UsageQueryResult> {
        let range_days = range_days.clamp(1, 365);
        let today = Local::now().date_naive();
        let start = today - ChronoDuration::days(i64::from(range_days.saturating_sub(1)));
        let start_date = start.format("%Y-%m-%d").to_string();
        let workspace_filter = workspace_filter
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());

        let rows = self
            .repo
            .query_rows(&start_date, workspace_filter)
            .map_err(AppError::from)?;
        let mut days = BTreeMap::new();
        for offset in 0..range_days {
            let date = (start + ChronoDuration::days(i64::from(offset)))
                .format("%Y-%m-%d")
                .to_string();
            days.insert(
                date.clone(),
                UsageDayPoint {
                    date,
                    ..UsageDayPoint::default()
                },
            );
        }

        let mut totals = UsageTotals::default();
        let mut by_cli = HashMap::<String, UsageTotals>::new();
        for row in rows {
            totals.char_count += row.totals.char_count;
            totals.token_input += row.totals.token_input;
            totals.token_output += row.totals.token_output;
            totals.token_cache_read += row.totals.token_cache_read;
            totals.token_cache_creation += row.totals.token_cache_creation;
            let cli_totals = by_cli.entry(row.cli_tool.clone()).or_default();
            cli_totals.char_count += row.totals.char_count;
            cli_totals.token_input += row.totals.token_input;
            cli_totals.token_output += row.totals.token_output;
            cli_totals.token_cache_read += row.totals.token_cache_read;
            cli_totals.token_cache_creation += row.totals.token_cache_creation;

            if let Some(day) = days.get_mut(&row.date) {
                apply_row_to_day(day, &row.cli_tool, &row.totals);
            }
        }

        Ok(UsageQueryResult {
            series: days.into_values().collect(),
            totals,
            by_cli,
            workspaces: self.repo.list_workspaces().map_err(AppError::from)?,
        })
    }

    fn refresh_usage_stats_logged(&self) {
        if let Err(error) = self.refresh_usage_stats() {
            warn!(err = %error, "Usage stats refresh failed");
        }
    }

    fn scan_all_usage_files(&self) -> Result<()> {
        let home = dirs::home_dir().context("Failed to resolve home directory")?;
        let claude_root = home.join(".claude").join("projects");
        for path in collect_jsonl_files(&claude_root) {
            if let Err(error) = self.scan_file("claude", &path) {
                warn!(path = %path.display(), err = %error, "Failed to scan Claude usage file");
            }
        }

        let codex_root = home.join(".codex").join("sessions");
        for path in collect_jsonl_files(&codex_root) {
            if let Err(error) = self.scan_file("codex", &path) {
                warn!(path = %path.display(), err = %error, "Failed to scan Codex usage file");
            }
        }
        Ok(())
    }

    fn scan_file(&self, cli_tool: &str, path: &Path) -> Result<()> {
        let path_string = path.to_string_lossy().to_string();
        let metadata = fs::metadata(path).with_context(|| {
            format!("Failed to read usage jsonl metadata: {}", path.display())
        })?;
        let len = metadata.len();
        let mtime_ms = modified_mtime_ms(&metadata);
        let state = self
            .repo
            .get_scan_state(&path_string)
            .map_err(|e| anyhow!(e))
            .with_context(|| format!("Failed to read scan state: {}", path.display()))?;
        let from_offset = state
            .map(|state| state.last_byte_offset)
            .filter(|offset| *offset <= len)
            .unwrap_or(0);

        let (entries, new_offset) = match cli_tool {
            "claude" => claude_session_service::read_session_usage(path, from_offset),
            "codex" => codex_session_service::read_session_usage(path, from_offset),
            _ => Ok((Vec::new(), from_offset)),
        }
        .map_err(|e| anyhow!(e))
        .with_context(|| format!("Failed to parse usage jsonl: {}", path.display()))?;

        if !entries.is_empty() {
            let workspace = self.resolve_session_workspace(cli_tool, path);
            let deltas = aggregate_entries(cli_tool, &workspace, entries);
            self.repo
                .upsert_deltas(&deltas)
                .map_err(|e| anyhow!(e))
                .context("Failed to upsert usage stats")?;
        }

        self.repo
            .upsert_scan_state(&path_string, new_offset, mtime_ms)
            .map_err(|e| anyhow!(e))
            .context("Failed to update usage scan state")?;
        Ok(())
    }

    fn resolve_pty_context(&self, session_id: &str) -> (String, String) {
        match self.launch_history.find_by_pty_session_id(session_id) {
            Ok(Some(record)) => (
                normalize_cli(&record.cli_tool, UNKNOWN_CLI),
                normalize_workspace(record.workspace_name.as_deref()),
            ),
            Ok(None) => (UNKNOWN_CLI.to_string(), GLOBAL_WORKSPACE.to_string()),
            Err(error) => {
                warn!(session_id = %session_id, err = %error, "Failed to resolve usage pty context");
                (UNKNOWN_CLI.to_string(), GLOBAL_WORKSPACE.to_string())
            }
        }
    }

    fn resolve_session_workspace(&self, cli_tool: &str, path: &Path) -> String {
        let session_id = match session_id_for_path(cli_tool, path) {
            Some(session_id) => session_id,
            None => return GLOBAL_WORKSPACE.to_string(),
        };
        match self.launch_history.find_by_resume_session_id(&session_id) {
            Ok(Some(record)) => normalize_workspace(record.workspace_name.as_deref()),
            Ok(None) => GLOBAL_WORKSPACE.to_string(),
            Err(error) => {
                warn!(session_id = %session_id, err = %error, "Failed to resolve usage session workspace");
                GLOBAL_WORKSPACE.to_string()
            }
        }
    }
}

fn apply_row_to_day(day: &mut UsageDayPoint, cli_tool: &str, totals: &UsageTotals) {
    match cli_tool {
        "claude" => {
            day.claude_chars += totals.char_count;
            day.claude_tokens_in += totals.token_input;
            day.claude_tokens_out += totals.token_output;
            day.claude_cache_read += totals.token_cache_read;
            day.claude_cache_creation += totals.token_cache_creation;
        }
        "codex" => {
            day.codex_chars += totals.char_count;
            day.codex_tokens_in += totals.token_input;
            day.codex_tokens_out += totals.token_output;
            day.codex_cache_read += totals.token_cache_read;
            day.codex_cache_creation += totals.token_cache_creation;
        }
        _ => {
            day.unknown_chars += totals.char_count;
        }
    }
}

fn aggregate_entries(
    cli_tool: &str,
    workspace_name: &str,
    entries: Vec<UsageEntry>,
) -> Vec<UsageStatsDelta> {
    let mut by_date = HashMap::<String, UsageStatsDelta>::new();
    for entry in entries {
        let delta = by_date
            .entry(entry.date.clone())
            .or_insert_with(|| UsageStatsDelta {
                date: entry.date,
                cli_tool: cli_tool.to_string(),
                workspace_name: workspace_name.to_string(),
                ..UsageStatsDelta::default()
            });
        delta.token_input += entry.token_input;
        delta.token_output += entry.token_output;
        delta.token_cache_read += entry.token_cache_read;
        delta.token_cache_creation += entry.token_cache_creation;
    }
    by_date.into_values().collect()
}

fn collect_jsonl_files(root: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    collect_jsonl_files_inner(root, &mut files);
    files
}

fn collect_jsonl_files_inner(root: &Path, files: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_jsonl_files_inner(&path, files);
            continue;
        }
        if path.extension().and_then(|value| value.to_str()) == Some("jsonl") {
            files.push(path);
        }
    }
}

fn session_id_for_path(cli_tool: &str, path: &Path) -> Option<String> {
    match cli_tool {
        "codex" => codex_session_service::read_session_meta(path)
            .map(|(session_id, _)| session_id)
            .or_else(|| file_stem(path)),
        "claude" => file_stem(path),
        _ => None,
    }
}

fn file_stem(path: &Path) -> Option<String> {
    path.file_stem().map(|value| value.to_string_lossy().to_string())
}

fn normalize_cli(cli_tool: &str, fallback: &str) -> String {
    let value = cli_tool.trim();
    if value.is_empty() || value == "none" {
        fallback.to_string()
    } else {
        value.to_string()
    }
}

fn normalize_workspace(workspace_name: Option<&str>) -> String {
    workspace_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(GLOBAL_WORKSPACE)
        .to_string()
}

fn modified_mtime_ms(metadata: &fs::Metadata) -> i64 {
    metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis().min(i64::MAX as u128) as i64)
        .unwrap_or(0)
}

fn today_string() -> String {
    Local::now().date_naive().format("%Y-%m-%d").to_string()
}

pub fn count_input_chars(raw_text: &str) -> u64 {
    let mut count = 0;
    let mut chars = raw_text.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\x1b' {
            if chars.peek() == Some(&'[') {
                let _ = chars.next();
                for next in chars.by_ref() {
                    if ('@'..='~').contains(&next) {
                        break;
                    }
                }
            }
            continue;
        }

        if should_count_input_char(ch) {
            count += 1;
        }
    }
    count
}

fn should_count_input_char(ch: char) -> bool {
    ch == '\t' || (ch >= ' ' && ch != '\u{7f}')
}

#[cfg(test)]
mod tests {
    use super::count_input_chars;

    #[test]
    fn count_plain_ascii() {
        assert_eq!(count_input_chars("hello"), 5);
    }

    #[test]
    fn count_unicode_chars() {
        assert_eq!(count_input_chars("中文"), 2);
    }

    #[test]
    fn strip_ansi_sequences() {
        assert_eq!(count_input_chars("a\x1b[31mred\x1b[0m"), 4);
    }

    #[test]
    fn strip_control_chars_except_tab() {
        assert_eq!(count_input_chars("a\x03b"), 2);
        assert_eq!(count_input_chars("a\tb"), 3);
    }
}
