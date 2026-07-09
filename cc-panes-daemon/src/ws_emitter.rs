use std::collections::HashMap;
use std::sync::Arc;

use cc_panes_core::events::EventEmitter;
use parking_lot::RwLock;
use serde_json::Value;
use tokio::sync::mpsc;
use tracing::debug;

#[derive(Clone, Default)]
pub struct WsEmitter {
    subscribers: Arc<RwLock<HashMap<String, Vec<mpsc::UnboundedSender<String>>>>>,
}

impl WsEmitter {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn subscribe(&self, session_id: &str) -> mpsc::UnboundedReceiver<String> {
        let (tx, rx) = mpsc::unbounded_channel();
        self.subscribers
            .write()
            .entry(session_id.to_string())
            .or_default()
            .push(tx);
        debug!(session_id, "daemon ws subscriber registered");
        rx
    }

    /// 是否仍有活跃（未断开）的 WS 订阅者——会话孤儿判定的信号之一。
    pub fn has_active_subscriber(&self, session_id: &str) -> bool {
        let subscribers = self.subscribers.read();
        subscribers
            .get(session_id)
            .is_some_and(|senders| senders.iter().any(|sender| !sender.is_closed()))
    }

    pub fn cleanup_session(&self, session_id: &str) {
        let mut subscribers = self.subscribers.write();
        if let Some(senders) = subscribers.get_mut(session_id) {
            senders.retain(|sender| !sender.is_closed());
            if senders.is_empty() {
                subscribers.remove(session_id);
            }
        }
    }

    fn publish(&self, session_id: &str, msg: String) {
        let subscribers = self.subscribers.read();
        if let Some(senders) = subscribers.get(session_id) {
            for sender in senders {
                let _ = sender.send(msg.clone());
            }
        }
    }
}

impl EventEmitter for WsEmitter {
    fn emit(&self, event: &str, payload: Value) -> anyhow::Result<()> {
        let Some(session_id) = payload.get("sessionId").and_then(|value| value.as_str()) else {
            return Ok(());
        };

        match event {
            "terminal-output" => {
                let data = payload
                    .get("data")
                    .and_then(|value| value.as_str())
                    .unwrap_or_default();
                self.publish(
                    session_id,
                    serde_json::json!({
                        "type": "output",
                        "data": data,
                    })
                    .to_string(),
                );
            }
            "terminal-exit" => {
                let exit_code = payload
                    .get("exitCode")
                    .and_then(|value| value.as_i64())
                    .unwrap_or(-1);
                self.publish(
                    session_id,
                    serde_json::json!({
                        "type": "exit",
                        "exitCode": exit_code,
                    })
                    .to_string(),
                );
            }
            _ => {}
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use cc_panes_core::constants::events as EV;

    use super::*;

    #[test]
    fn publishes_terminal_output_and_exit_to_session_subscribers() {
        let emitter = WsEmitter::new();
        let mut rx = emitter.subscribe("session-1");

        emitter
            .emit(
                EV::TERMINAL_OUTPUT,
                serde_json::json!({
                    "sessionId": "session-1",
                    "data": "ready",
                }),
            )
            .expect("output emit");
        emitter
            .emit(
                EV::TERMINAL_EXIT,
                serde_json::json!({
                    "sessionId": "session-1",
                    "exitCode": 7,
                }),
            )
            .expect("exit emit");

        let output = rx.try_recv().expect("output message");
        let exit = rx.try_recv().expect("exit message");

        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&output).expect("output json"),
            serde_json::json!({"type":"output","data":"ready"})
        );
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&exit).expect("exit json"),
            serde_json::json!({"type":"exit","exitCode":7})
        );
    }
}
