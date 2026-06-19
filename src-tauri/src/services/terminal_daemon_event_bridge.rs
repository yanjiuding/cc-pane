use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use cc_panes_core::constants::events as EV;
use cc_panes_core::models::{TerminalExit, TerminalOutput, TerminalReplaySnapshot};
use cc_panes_core::services::terminal_service::{SessionStatus, SessionStatusInfo};
use cc_panes_core::services::TerminalBackend;
use futures_util::StreamExt;
use serde::Deserialize;
use tauri::Emitter;
use tokio_tungstenite::connect_async;
use tracing::{debug, warn};

#[derive(Clone)]
pub struct TerminalDaemonEventBridge {
    app_handle: tauri::AppHandle,
    sessions: Arc<Mutex<HashMap<String, SessionBridgeState>>>,
}

#[derive(Debug, Default)]
struct SessionBridgeState {
    last_snapshot: String,
    last_status: Option<SessionStatusInfo>,
    started: bool,
    terminal_exit_emitted: bool,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum DaemonStreamMessage {
    Output {
        data: String,
    },
    Exit {
        #[serde(rename = "exitCode")]
        exit_code: i32,
    },
}

impl TerminalDaemonEventBridge {
    pub fn new(app_handle: tauri::AppHandle) -> Self {
        Self {
            app_handle,
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn start_session(&self, session_id: impl Into<String>, backend: Arc<dyn TerminalBackend>) {
        self.start_session_with_snapshot(session_id, backend, None);
    }

    pub fn start_session_after_replay(
        &self,
        session_id: impl Into<String>,
        backend: Arc<dyn TerminalBackend>,
        snapshot: &TerminalReplaySnapshot,
    ) {
        self.start_session_with_snapshot(session_id, backend, Some(snapshot.data.clone()));
    }

    fn start_session_with_snapshot(
        &self,
        session_id: impl Into<String>,
        backend: Arc<dyn TerminalBackend>,
        initial_snapshot: Option<String>,
    ) {
        let session_id = session_id.into();
        let should_start = {
            let mut sessions = self.sessions.lock().unwrap_or_else(|err| err.into_inner());
            let state = sessions.entry(session_id.clone()).or_default();
            if let Some(snapshot) = initial_snapshot {
                state.last_snapshot = snapshot;
            }
            if state.started {
                false
            } else {
                state.started = true;
                true
            }
        };

        if !should_start {
            return;
        }

        let bridge = self.clone();
        tauri::async_runtime::spawn(async move {
            bridge.run_session(session_id, backend).await;
        });
    }

    fn stop_session(&self, session_id: &str) {
        let mut sessions = self.sessions.lock().unwrap_or_else(|err| err.into_inner());
        sessions.remove(session_id);
    }

    async fn run_session(&self, session_id: String, backend: Arc<dyn TerminalBackend>) {
        if let Some(url) = backend.event_stream_url(&session_id) {
            match self
                .stream_session(session_id.clone(), url, backend.clone())
                .await
            {
                Ok(()) => {
                    self.stop_session(&session_id);
                    debug!(session_id = %session_id, "terminal daemon websocket bridge stopped");
                    return;
                }
                Err(error) => {
                    warn!(session_id = %session_id, error = %error, "terminal daemon websocket bridge failed; falling back to polling");
                }
            }
        }

        self.poll_session(session_id, backend).await;
    }

    async fn stream_session(
        &self,
        session_id: String,
        url: String,
        backend: Arc<dyn TerminalBackend>,
    ) -> anyhow::Result<()> {
        let (mut ws, _) = connect_async(&url).await?;
        let mut status_interval = tokio::time::interval(Duration::from_millis(500));

        loop {
            tokio::select! {
                message = ws.next() => {
                    let Some(message) = message else {
                        self.emit_terminal_status_once(synthesized_exited_status(&session_id))?;
                        self.emit_terminal_exit_once(&session_id, -1)?;
                        return Ok(());
                    };
                    let message = message?;
                    if message.is_close() {
                        self.emit_terminal_status_once(synthesized_exited_status(&session_id))?;
                        self.emit_terminal_exit_once(&session_id, -1)?;
                        return Ok(());
                    }
                    if !message.is_text() {
                        continue;
                    }
                    if self.handle_stream_message(&session_id, message.to_text()?)? {
                        return Ok(());
                    }
                }
                _ = status_interval.tick() => {
                    if self.poll_status(&session_id, backend.clone()).await? == PollStatus::Done {
                        return Ok(());
                    }
                }
            }
        }
    }

    fn handle_stream_message(&self, session_id: &str, text: &str) -> anyhow::Result<bool> {
        let message: DaemonStreamMessage = serde_json::from_str(text)?;
        match message {
            DaemonStreamMessage::Output { data } => {
                self.app_handle.emit(
                    EV::TERMINAL_OUTPUT,
                    serde_json::to_value(TerminalOutput {
                        session_id: session_id.to_string(),
                        data,
                    })?,
                )?;
                Ok(false)
            }
            DaemonStreamMessage::Exit { exit_code } => {
                self.emit_terminal_status_once(synthesized_exited_status_with_code(
                    session_id,
                    Some(exit_code),
                ))?;
                self.emit_terminal_exit_once(session_id, exit_code)?;
                Ok(true)
            }
        }
    }

    async fn poll_session(&self, session_id: String, backend: Arc<dyn TerminalBackend>) {
        let mut interval = tokio::time::interval(Duration::from_millis(100));
        loop {
            interval.tick().await;

            if let Err(error) = self.poll_snapshot(&session_id, backend.clone()).await {
                warn!(session_id = %session_id, error = %error, "terminal daemon output bridge failed");
                self.stop_session(&session_id);
                break;
            }

            match self.poll_status(&session_id, backend.clone()).await {
                Ok(PollStatus::Continue) => {}
                Ok(PollStatus::Done) => {
                    self.stop_session(&session_id);
                    break;
                }
                Err(error) => {
                    warn!(session_id = %session_id, error = %error, "terminal daemon status bridge failed");
                    self.stop_session(&session_id);
                    break;
                }
            }
        }

        debug!(session_id = %session_id, "terminal daemon event bridge stopped");
    }

    async fn poll_snapshot(
        &self,
        session_id: &str,
        backend: Arc<dyn TerminalBackend>,
    ) -> anyhow::Result<()> {
        let sid = session_id.to_string();
        let snapshot =
            tauri::async_runtime::spawn_blocking(move || backend.get_session_replay_snapshot(&sid))
                .await
                .map_err(|error| anyhow::anyhow!(error.to_string()))?
                .map_err(|error| anyhow::anyhow!(error.to_string()))?;

        let Some(snapshot) = snapshot else {
            return Ok(());
        };

        if let Some(delta) = self.apply_snapshot_delta(session_id, &snapshot) {
            self.app_handle.emit(
                EV::TERMINAL_OUTPUT,
                serde_json::to_value(TerminalOutput {
                    session_id: session_id.to_string(),
                    data: delta,
                })?,
            )?;
        }

        Ok(())
    }

    async fn poll_status(
        &self,
        session_id: &str,
        backend: Arc<dyn TerminalBackend>,
    ) -> anyhow::Result<PollStatus> {
        let sid = session_id.to_string();
        let status = tauri::async_runtime::spawn_blocking(move || backend.get_session_status(&sid))
            .await
            .map_err(|error| anyhow::anyhow!(error.to_string()))?
            .map_err(|error| anyhow::anyhow!(error.to_string()))?;

        let Some(status) = status else {
            self.emit_terminal_status_once(synthesized_exited_status(session_id))?;
            self.emit_terminal_exit_once(session_id, -1)?;
            return Ok(PollStatus::Done);
        };

        if self.should_emit_status(session_id, &status) {
            self.app_handle
                .emit(EV::TERMINAL_STATUS, serde_json::to_value(&status)?)?;
        }

        if status.status.is_terminal() {
            self.emit_terminal_exit_once(session_id, status.exit_code.unwrap_or(-1))?;
            return Ok(PollStatus::Done);
        }

        Ok(PollStatus::Continue)
    }

    fn apply_snapshot_delta(
        &self,
        session_id: &str,
        snapshot: &TerminalReplaySnapshot,
    ) -> Option<String> {
        let mut sessions = self.sessions.lock().unwrap_or_else(|err| err.into_inner());
        let state = sessions.entry(session_id.to_string()).or_default();
        let delta = replay_snapshot_delta(&state.last_snapshot, &snapshot.data)?;
        state.last_snapshot = snapshot.data.clone();
        Some(delta)
    }

    fn should_emit_status(&self, session_id: &str, status: &SessionStatusInfo) -> bool {
        let mut sessions = self.sessions.lock().unwrap_or_else(|err| err.into_inner());
        let state = sessions.entry(session_id.to_string()).or_default();
        if state
            .last_status
            .as_ref()
            .is_some_and(|previous| same_status_payload(previous, status))
        {
            return false;
        }
        state.last_status = Some(status.clone());
        true
    }

    fn emit_terminal_exit_once(&self, session_id: &str, exit_code: i32) -> anyhow::Result<()> {
        let should_emit = {
            let mut sessions = self.sessions.lock().unwrap_or_else(|err| err.into_inner());
            let state = sessions.entry(session_id.to_string()).or_default();
            if state.terminal_exit_emitted {
                false
            } else {
                state.terminal_exit_emitted = true;
                true
            }
        };

        if should_emit {
            self.app_handle.emit(
                EV::TERMINAL_EXIT,
                serde_json::to_value(TerminalExit {
                    session_id: session_id.to_string(),
                    exit_code,
                })?,
            )?;
        }

        Ok(())
    }

    fn emit_terminal_status_once(&self, status: SessionStatusInfo) -> anyhow::Result<()> {
        if self.should_emit_status(&status.session_id, &status) {
            self.app_handle
                .emit(EV::TERMINAL_STATUS, serde_json::to_value(&status)?)?;
        }

        Ok(())
    }
}

#[derive(Debug, PartialEq, Eq)]
enum PollStatus {
    Continue,
    Done,
}

fn replay_snapshot_delta(previous: &str, current: &str) -> Option<String> {
    if current.is_empty() {
        return None;
    }
    if previous.is_empty() {
        return Some(current.to_string());
    }
    if current == previous {
        return None;
    }
    if let Some(delta) = current.strip_prefix(previous) {
        return Some(delta.to_string());
    }
    Some(current.to_string())
}

fn same_status_payload(left: &SessionStatusInfo, right: &SessionStatusInfo) -> bool {
    left.session_id == right.session_id
        && left.status == right.status
        && left.last_output_at == right.last_output_at
        && left.pid == right.pid
        && left.exit_code == right.exit_code
        && left.current_tool_name == right.current_tool_name
        && left.current_tool_use_id == right.current_tool_use_id
        && left.current_tool_summary == right.current_tool_summary
        && left.updated_at == right.updated_at
}

fn synthesized_exited_status(session_id: &str) -> SessionStatusInfo {
    synthesized_exited_status_with_code(session_id, None)
}

fn synthesized_exited_status_with_code(
    session_id: &str,
    exit_code: Option<i32>,
) -> SessionStatusInfo {
    let now = current_epoch_millis();
    SessionStatusInfo {
        session_id: session_id.to_string(),
        status: SessionStatus::Exited,
        last_output_at: now,
        pid: None,
        exit_code,
        current_tool_name: None,
        current_tool_use_id: None,
        current_tool_summary: None,
        updated_at: now,
    }
}

fn current_epoch_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn status(session_id: &str, status: SessionStatus, updated_at: u64) -> SessionStatusInfo {
        SessionStatusInfo {
            session_id: session_id.to_string(),
            status,
            last_output_at: updated_at,
            pid: Some(42),
            exit_code: None,
            current_tool_name: None,
            current_tool_use_id: None,
            current_tool_summary: None,
            updated_at,
        }
    }

    #[test]
    fn replay_snapshot_delta_returns_only_new_suffix() {
        assert_eq!(
            replay_snapshot_delta("\u{1b}[2Jready", "\u{1b}[2Jready\nnext"),
            Some("\nnext".to_string())
        );
        assert_eq!(replay_snapshot_delta("same", "same"), None);
        assert_eq!(
            replay_snapshot_delta("old prefix", "new buffer"),
            Some("new buffer".to_string())
        );
        assert_eq!(replay_snapshot_delta("", ""), None);
    }

    #[test]
    fn same_status_payload_detects_relevant_changes() {
        let first = status("s1", SessionStatus::Active, 10);
        let same = status("s1", SessionStatus::Active, 10);
        let changed = status("s1", SessionStatus::Exited, 11);
        let mut changed_exit_code = changed.clone();
        changed_exit_code.updated_at = first.updated_at;
        changed_exit_code.last_output_at = first.last_output_at;
        changed_exit_code.status = first.status;
        changed_exit_code.exit_code = Some(7);

        assert!(same_status_payload(&first, &same));
        assert!(!same_status_payload(&first, &changed));
        assert!(!same_status_payload(&first, &changed_exit_code));
    }

    #[test]
    fn daemon_stream_message_parses_output_and_exit_payloads() {
        match serde_json::from_str::<DaemonStreamMessage>(r#"{"type":"output","data":"ready"}"#)
            .expect("output message")
        {
            DaemonStreamMessage::Output { data } => assert_eq!(data, "ready"),
            other => panic!("unexpected message: {other:?}"),
        }

        match serde_json::from_str::<DaemonStreamMessage>(r#"{"type":"exit","exitCode":7}"#)
            .expect("exit message")
        {
            DaemonStreamMessage::Exit { exit_code } => assert_eq!(exit_code, 7),
            other => panic!("unexpected message: {other:?}"),
        }
    }
}
