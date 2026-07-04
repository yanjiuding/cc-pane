use crate::services::{detect_tailscale, TailscaleStatus};
use crate::utils::AppResult;
use tracing::debug;

/// 探测本机 Tailscale 状态（只读，不执行 up/serve、不碰凭证）。
/// async + spawn_blocking：子进程探测最长 3s，不能阻塞 IPC 线程。
#[tauri::command]
pub async fn detect_tailscale_status() -> AppResult<TailscaleStatus> {
    debug!("cmd::detect_tailscale_status");
    tauri::async_runtime::spawn_blocking(detect_tailscale)
        .await
        .map_err(|error| crate::utils::AppError::from(error.to_string()))
}
