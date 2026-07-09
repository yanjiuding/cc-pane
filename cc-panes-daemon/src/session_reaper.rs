use std::sync::Arc;
use std::time::{Duration, Instant};

use cc_panes_core::services::terminal_service::SessionStatus;
use cc_panes_core::services::SettingsService;
use tracing::{info, warn};

use crate::server::DaemonConfig;

const SWEEP_INTERVAL: Duration = Duration::from_secs(60);

#[derive(Debug, Clone)]
pub struct ReaperEntry {
    pub session_id: String,
    pub last_viewer_activity: Instant,
    pub has_active_subscriber: bool,
    pub status: SessionStatus,
    pub last_output_at: u64,
}

/// 纯判定：从会话活动信息中选出过期会话，
/// 返回按 last_activity 升序（先进先出）排序的 id 列表。
pub fn select_expired(
    entries: &[ReaperEntry],
    ttl: Duration,
    now: Instant,
    now_epoch_millis: u64,
) -> Vec<String> {
    let ttl_millis = ttl.as_millis() as u64;
    let mut expired: Vec<(&str, Instant)> = entries
        .iter()
        .filter(|entry| {
            !entry.has_active_subscriber
                && !is_reap_protected_status(entry.status)
                && now.saturating_duration_since(entry.last_viewer_activity) > ttl
                && now_epoch_millis.saturating_sub(entry.last_output_at) > ttl_millis
        })
        .map(|entry| (entry.session_id.as_str(), entry.last_viewer_activity))
        .collect();
    expired.sort_by_key(|(_, last_activity)| *last_activity);
    expired.into_iter().map(|(id, _)| id.to_string()).collect()
}

fn is_reap_protected_status(status: SessionStatus) -> bool {
    status.is_busy()
        || matches!(
            status,
            SessionStatus::Initializing | SessionStatus::WaitingInput
        )
}

fn current_epoch_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// 孤儿会话回收：pane 消失（无 WS 订阅且无 HTTP 访问）超过 TTL 的会话按 FIFO 回收。
/// 每轮 sweep 前重读 config.toml，TTL 改动无需重启 daemon 即生效。
/// 全程阻塞 I/O，跑在独立线程上。
pub fn spawn_session_reaper(config: DaemonConfig, settings: Arc<SettingsService>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(SWEEP_INTERVAL);

        // 热生效：重读 config.toml。文件存在但读/解析失败（可能是半写瞬态）时
        // 保留旧内存设置并跳过本轮回收——绝不回落默认值。文件不存在则沿用
        // 内存中的默认设置（全新安装尚未写过配置）。
        if settings.config_path().exists() {
            if let Err(error) = settings.reload_from_disk() {
                warn!(error = %error, "session reaper: settings reload failed; skipping sweep");
                continue;
            }
        }
        let ttl_minutes = settings.get_settings().terminal.daemon_orphan_ttl_minutes;
        if ttl_minutes == 0 {
            continue;
        }
        let ttl = Duration::from_secs(u64::from(ttl_minutes) * 60);

        let sessions = match config.terminal_backend().get_all_status() {
            Ok(sessions) => sessions,
            Err(error) => {
                warn!(error = %error, "session reaper: failed to list sessions; skipping sweep");
                continue;
            }
        };

        let now = Instant::now();
        let now_epoch_millis = current_epoch_millis();
        let activity = config.session_activity_snapshot();

        // activity 表里已不存在的会话（自然退出等）清掉，防 map 泄漏。
        for id in activity.keys() {
            if !sessions.iter().any(|s| &s.session_id == id) {
                config.remove_session_activity(id);
            }
        }

        let entries: Vec<ReaperEntry> = sessions
            .iter()
            .map(|session| {
                let id = session.session_id.clone();
                // 首次见到（daemon 启动前已存在等）：登记为现在，给满一个 TTL 宽限。
                let last_activity = activity.get(&id).copied().unwrap_or_else(|| {
                    config.touch_session(&id);
                    now
                });
                let has_subscriber = config.has_active_subscriber(&id);
                ReaperEntry {
                    session_id: id,
                    last_viewer_activity: last_activity,
                    has_active_subscriber: has_subscriber,
                    status: session.status,
                    last_output_at: session.last_output_at,
                }
            })
            .collect();

        for id in select_expired(&entries, ttl, now, now_epoch_millis) {
            // TOCTOU 复检：select 快照与 kill 之间用户可能重新打开该 pane
            // （新建 WS 订阅或 HTTP 访问会 touch 活动时间）。杀前用**实时**状态再确认
            // 一次，避免误杀刚被接管的会话。
            if config.has_active_subscriber(&id) {
                info!(session_id = %id, "reap skipped: viewer reattached before kill");
                continue;
            }
            let recheck_now = Instant::now();
            let reattached = config
                .session_activity_snapshot()
                .get(&id)
                .map(|last| recheck_now.saturating_duration_since(*last) <= ttl)
                .unwrap_or(false);
            if reattached {
                info!(session_id = %id, "reap skipped: recent viewer activity before kill");
                continue;
            }

            info!(
                session_id = %id,
                ttl_minutes,
                "reaping orphaned session (no viewer past TTL)"
            );
            if let Err(error) = config.terminal_backend().kill(&id) {
                warn!(session_id = %id, error = %error, "failed to reap session");
            }
            config.remove_session_activity(&id);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(
        id: &str,
        viewer_age: Duration,
        output_age: Duration,
        now: Instant,
        now_epoch_millis: u64,
        subscribed: bool,
        status: SessionStatus,
    ) -> ReaperEntry {
        ReaperEntry {
            session_id: id.to_string(),
            last_viewer_activity: now - viewer_age,
            has_active_subscriber: subscribed,
            status,
            last_output_at: now_epoch_millis.saturating_sub(output_age.as_millis() as u64),
        }
    }

    #[test]
    fn expired_sessions_are_returned_fifo_oldest_first() {
        let now = Instant::now();
        let now_epoch_millis = 10_000_000;
        let ttl = Duration::from_secs(600);
        let entries = vec![
            entry(
                "newer",
                Duration::from_secs(700),
                Duration::from_secs(700),
                now,
                now_epoch_millis,
                false,
                SessionStatus::Idle,
            ),
            entry(
                "oldest",
                Duration::from_secs(900),
                Duration::from_secs(900),
                now,
                now_epoch_millis,
                false,
                SessionStatus::Idle,
            ),
            entry(
                "fresh",
                Duration::from_secs(100),
                Duration::from_secs(900),
                now,
                now_epoch_millis,
                false,
                SessionStatus::Idle,
            ),
        ];

        let expired = select_expired(&entries, ttl, now, now_epoch_millis);

        assert_eq!(expired, vec!["oldest".to_string(), "newer".to_string()]);
    }

    #[test]
    fn active_subscriber_exempts_session_regardless_of_age() {
        let now = Instant::now();
        let now_epoch_millis = 10_000_000;
        let ttl = Duration::from_secs(60);
        let entries = vec![entry(
            "watched",
            Duration::from_secs(9999),
            Duration::from_secs(9999),
            now,
            now_epoch_millis,
            true,
            SessionStatus::Idle,
        )];

        assert!(select_expired(&entries, ttl, now, now_epoch_millis).is_empty());
    }

    #[test]
    fn busy_status_and_recent_output_exempt_session() {
        let now = Instant::now();
        let now_epoch_millis = 10_000_000;
        let ttl = Duration::from_secs(600);
        let entries = vec![
            entry(
                "busy",
                Duration::from_secs(9999),
                Duration::from_secs(9999),
                now,
                now_epoch_millis,
                false,
                SessionStatus::ToolRunning,
            ),
            entry(
                "recent-output",
                Duration::from_secs(9999),
                Duration::from_secs(10),
                now,
                now_epoch_millis,
                false,
                SessionStatus::Idle,
            ),
        ];

        assert!(select_expired(&entries, ttl, now, now_epoch_millis).is_empty());
    }

    #[test]
    fn session_exactly_at_ttl_is_not_expired() {
        let now = Instant::now();
        let now_epoch_millis = 10_000_000;
        let ttl = Duration::from_secs(600);
        let entries = vec![entry(
            "edge",
            Duration::from_secs(600),
            Duration::from_secs(600),
            now,
            now_epoch_millis,
            false,
            SessionStatus::Idle,
        )];

        assert!(select_expired(&entries, ttl, now, now_epoch_millis).is_empty());
    }
}
