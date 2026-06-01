//! Launch history backfill — 启动后回填 resume_session_id（agent rollout id）。
//!
//! 背景：本地 Windows Codex 不装 cc-panes hook（codex.rs 在 Windows 判 unsupported），
//! 无法靠 hook 上报 resume_session_id。本服务在会话启动后延迟扫 `~/.codex/sessions`
//! （或 Claude 的 `~/.claude/projects`）按 cwd + 时间窗口反查刚生成的 rollout id，
//! 回填 launch_history 并 emit `history-updated`，让前端把 resumeId 存进 SavedSession，
//! 从而 reload 能 `codex resume <id>` 自动恢复。
//!
//! 设计要点（评审吸收）：
//! - 本函数接受 plain `AppHandle` + `Arc<LaunchHistoryService>`，**不依赖 command 层的
//!   `State<..>`**，因此 OrchestratorService（service 层）可直接调用，command 仅薄包装。
//! - 调用方须在 **创建 PTY 之前** 捕获 `after_ts` 并显式传入，避免 rollout 已生成但
//!   mtime 早于 backfill 启动时间而被反查跳过。

use crate::services::extract_last_prompt;
use crate::utils::encode_claude_project_path;
use chrono::{DateTime, Utc};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tracing::debug;

use cc_panes_core::services::LaunchHistoryService;

/// 反查某次启动对应的 agent rollout/session id（claude/codex，含 wsl）。
pub(crate) fn detect_resume_session(
    cli_tool: &str,
    runtime_kind: Option<&str>,
    wsl_distro: Option<&str>,
    project_path: String,
    workspace_path: Option<String>,
    after_ts: String,
) -> Result<Option<String>, String> {
    match cli_tool {
        "claude" => detect_claude_session(project_path, workspace_path, after_ts),
        "codex" => {
            let after: DateTime<Utc> = DateTime::parse_from_rfc3339(&after_ts)
                .map_err(|e| format!("Invalid timestamp: {}", e))?
                .with_timezone(&Utc);

            let mut paths_to_try = Vec::new();
            if let Some(ref workspace_path) = workspace_path {
                paths_to_try.push(workspace_path.as_str());
            }
            paths_to_try.push(project_path.as_str());

            let runtime_kind = runtime_kind.unwrap_or("local");
            if runtime_kind == "wsl" {
                cc_panes_core::services::codex_session_service::detect_wsl_session(
                    &paths_to_try,
                    after,
                    wsl_distro,
                )
            } else {
                cc_panes_core::services::codex_session_service::detect_session(&paths_to_try, after)
            }
        }
        _ => Ok(None),
    }
}

/// 反查 Claude 会话 id：扫 `~/.claude/projects/<encoded>/*.jsonl`，按 cwd 候选 + mtime 取最新。
fn detect_claude_session(
    project_path: String,
    workspace_path: Option<String>,
    after_ts: String,
) -> Result<Option<String>, String> {
    let after: DateTime<Utc> = DateTime::parse_from_rfc3339(&after_ts)
        .map_err(|e| format!("Invalid timestamp: {}", e))?
        .with_timezone(&Utc);

    let mut paths_to_try = Vec::new();
    if let Some(ref ws) = workspace_path {
        paths_to_try.push(ws.as_str());
    }
    paths_to_try.push(&project_path);

    let home = dirs::home_dir().ok_or_else(|| "Cannot determine home directory".to_string())?;

    for path in paths_to_try {
        let encoded = encode_claude_project_path(path);
        let sessions_dir = home.join(".claude").join("projects").join(&encoded);
        if !sessions_dir.is_dir() {
            continue;
        }

        let mut latest: Option<(String, std::time::SystemTime)> = None;
        if let Ok(entries) = std::fs::read_dir(&sessions_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                    continue;
                }
                let stem = p
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_string();
                if uuid::Uuid::parse_str(&stem).is_err() {
                    continue;
                }
                if let Ok(meta) = entry.metadata() {
                    if let Ok(modified) = meta.modified() {
                        let modified_dt: DateTime<Utc> = modified.into();
                        if modified_dt < after {
                            continue;
                        }
                        if latest.as_ref().map(|(_, t)| modified > *t).unwrap_or(true) {
                            latest = Some((stem, modified));
                        }
                    }
                }
            }
        }
        if let Some((id, _)) = latest {
            return Ok(Some(id));
        }
    }

    Ok(None)
}

/// 兜底回填循环：每轮先查记录是否已有 resume_session_id（提前退出 / 幂等），否则反查并回填+emit。
/// `after_ts` 应由调用方在创建 PTY 前捕获。`spawn` 在调用方完成，本函数只跑循环。
#[allow(clippy::too_many_arguments)]
pub async fn run_launch_history_backfill(
    app_handle: AppHandle,
    service: Arc<LaunchHistoryService>,
    launch_id: String,
    pty_session_id: String,
    cli_tool: String,
    runtime_kind: String,
    wsl_distro: Option<String>,
    project_path: String,
    workspace_path: Option<String>,
    after_ts: String,
) {
    for attempt in 0..15 {
        if let Ok(Some(record)) = service.find_by_launch_id(&launch_id) {
            if record.resume_session_id.is_some() {
                return;
            }
        }

        if let Ok(Some(resume_session_id)) = detect_resume_session(
            &cli_tool,
            Some(&runtime_kind),
            wsl_distro.as_deref(),
            project_path.clone(),
            workspace_path.clone(),
            after_ts.clone(),
        ) {
            if let Ok(Some(record_id)) = service.update_session_started(
                &launch_id,
                &pty_session_id,
                &resume_session_id,
                &cli_tool,
                &runtime_kind,
                wsl_distro.as_deref(),
                workspace_path.as_deref(),
            ) {
                if let Ok(Some(last_prompt)) = extract_last_prompt(
                    &cli_tool,
                    Some(&runtime_kind),
                    wsl_distro.as_deref(),
                    &project_path,
                    &resume_session_id,
                ) {
                    let _ =
                        service.update_last_prompt_by_pty_session_id(&pty_session_id, &last_prompt);
                }
                let _ = app_handle.emit(
                    "history-updated",
                    serde_json::json!({
                        "source": "launch-backfill",
                        "recordId": record_id,
                        "launchId": launch_id,
                        "ptySessionId": pty_session_id,
                        "resumeSessionId": resume_session_id,
                    }),
                );
                debug!(
                    launch_id = %launch_id,
                    pty_session_id = %pty_session_id,
                    "launch-backfill: filled resume_session_id"
                );
            }
            return;
        }

        // Codex 冷启 1-3s：前几轮快查，之后放慢。总覆盖 ~2s + 22s。
        let delay = if attempt < 4 { 500 } else { 2000 };
        tokio::time::sleep(Duration::from_millis(delay)).await;
    }
}

/// 一次性补救历史遗留的 Codex 记录：launch_history 里 `cli_tool==codex` 且
/// `resume_session_id IS NULL` 的行（多为本修复前经 orchestrator 启动、从未回填的会话），
/// 按各自 runtime/cwd + launched_at 反查 `~/.codex/sessions` 的 rollout id 补上，
/// 使旧会话也能 reload 恢复。best-effort、按记录 launched_at 作为时间窗口起点。
/// 调用方负责 marker 去重与放进后台任务。
pub async fn rescue_null_codex_records(app_handle: AppHandle, service: Arc<LaunchHistoryService>) {
    let records = match service.list(2000) {
        Ok(records) => records,
        Err(error) => {
            debug!(err = %error, "rescue_null_codex_records: list failed");
            return;
        }
    };

    let mut rescued = 0usize;
    for record in records {
        if record.cli_tool != "codex" || record.resume_session_id.is_some() {
            continue;
        }
        // 反查时间窗口起点：用记录的 launched_at（历史时刻）。
        let after_ts = record.launched_at.clone();
        let workspace_path = record
            .workspace_path
            .clone()
            .or_else(|| record.launch_cwd.clone());

        let detected = detect_resume_session(
            "codex",
            Some(&record.runtime_kind),
            record.wsl_distro.as_deref(),
            record.project_path.clone(),
            workspace_path,
            after_ts,
        );

        if let Ok(Some(resume_session_id)) = detected {
            if service.update_session_id(record.id, &resume_session_id).is_ok() {
                rescued += 1;
                let _ = app_handle.emit(
                    "history-updated",
                    serde_json::json!({
                        "source": "null-rescue",
                        "recordId": record.id,
                        "ptySessionId": record.pty_session_id,
                        "resumeSessionId": resume_session_id,
                    }),
                );
            }
        }
    }

    if rescued > 0 {
        debug!(rescued, "rescue_null_codex_records: backfilled legacy codex records");
    }
}

