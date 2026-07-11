use std::time::Duration;

use futures_util::StreamExt;
use tokio_tungstenite::connect_async;
use tracing::{debug, warn};

use crate::services::TerminalDaemonClient;

const RECONNECT_MIN: Duration = Duration::from_secs(1);
const RECONNECT_MAX: Duration = Duration::from_secs(60);

/// 维持到 daemon 的桌面控制 WS 连接（`/ws/control?kind=desktop`）。
///
/// daemon 用活跃控制连接数统计 `desktopClientCount`，前端孤儿会话对账在
/// 计数 >1 时 fail-closed 跳过——多个桌面实例共享 daemon 时，任何单实例的
/// "被引用会话全集"都是残缺视图，据此杀会话会误杀其他实例的面板。
///
/// 断开后指数退避重连，任务与 app 同生命周期。
pub fn spawn_terminal_daemon_control_link(client: TerminalDaemonClient) {
    tauri::async_runtime::spawn(async move {
        let url = client.websocket_control_url("desktop");
        let mut backoff = RECONNECT_MIN;
        loop {
            match connect_async(&url).await {
                Ok((mut ws, _)) => {
                    debug!("terminal daemon control link connected");
                    backoff = RECONNECT_MIN;
                    // 只挂着等断开；daemon 侧不主动推业务消息
                    while let Some(message) = ws.next().await {
                        if message.is_err() {
                            break;
                        }
                    }
                    warn!("terminal daemon control link disconnected; reconnecting");
                }
                Err(error) => {
                    debug!(error = %error, "terminal daemon control link connect failed");
                }
            }
            tokio::time::sleep(backoff).await;
            backoff = (backoff * 2).min(RECONNECT_MAX);
        }
    });
}
