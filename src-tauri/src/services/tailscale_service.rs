//! Tailscale 只读探测：为「远程访问引导」设置页提供本机 tailscale 状态。
//!
//! 安全边界（借鉴 claude_codex_bridge 的模型）：只执行 `tailscale status --json`
//! 只读探测，绝不执行 `tailscale up/serve`，不读写任何 Tailscale 凭证/ACL。

use serde::Serialize;
use std::process::Command;
use std::time::Duration;

const DETECT_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TailscaleStatus {
    /// tailscale CLI 是否可用（PATH 中可执行）
    pub installed: bool,
    /// BackendState："Running" / "NeedsLogin" / "Stopped"；None = 未安装或解析失败
    pub backend_state: Option<String>,
    /// 本机节点 MagicDNS 名（去尾点），Tailscale Serve 的访问域名
    pub dns_name: Option<String>,
    pub tailscale_ips: Vec<String>,
}

pub fn detect_tailscale() -> TailscaleStatus {
    let output = cc_panes_core::utils::output_with_timeout(
        Command::new("tailscale").args(["status", "--json"]),
        DETECT_TIMEOUT,
    );
    let output = match output {
        Ok(output) => output,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return TailscaleStatus {
                installed: false,
                backend_state: None,
                dns_name: None,
                tailscale_ips: Vec::new(),
            };
        }
        Err(_) => {
            // 存在但执行失败（超时等）：报告已安装、状态未知
            return TailscaleStatus {
                installed: true,
                backend_state: None,
                dns_name: None,
                tailscale_ips: Vec::new(),
            };
        }
    };
    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_tailscale_status(&stdout)
}

fn parse_tailscale_status(json_text: &str) -> TailscaleStatus {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(json_text) else {
        return TailscaleStatus {
            installed: true,
            backend_state: None,
            dns_name: None,
            tailscale_ips: Vec::new(),
        };
    };
    let backend_state = value
        .get("BackendState")
        .and_then(|state| state.as_str())
        .map(str::to_string);
    let self_node = value.get("Self");
    let dns_name = self_node
        .and_then(|node| node.get("DNSName"))
        .and_then(|name| name.as_str())
        .map(|name| name.trim_end_matches('.').to_string())
        .filter(|name| !name.is_empty());
    let tailscale_ips = self_node
        .and_then(|node| node.get("TailscaleIPs"))
        .and_then(|ips| ips.as_array())
        .map(|ips| {
            ips.iter()
                .filter_map(|ip| ip.as_str())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();

    TailscaleStatus {
        installed: true,
        backend_state,
        dns_name,
        tailscale_ips,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_running_status() {
        let status = parse_tailscale_status(
            r#"{
                "BackendState": "Running",
                "Self": {
                    "DNSName": "my-pc.tailnet-1234.ts.net.",
                    "TailscaleIPs": ["100.64.0.5", "fd7a::1"]
                }
            }"#,
        );
        assert!(status.installed);
        assert_eq!(status.backend_state.as_deref(), Some("Running"));
        assert_eq!(
            status.dns_name.as_deref(),
            Some("my-pc.tailnet-1234.ts.net")
        );
        assert_eq!(status.tailscale_ips, vec!["100.64.0.5", "fd7a::1"]);
    }

    #[test]
    fn parses_needs_login_without_self() {
        let status = parse_tailscale_status(r#"{"BackendState": "NeedsLogin"}"#);
        assert!(status.installed);
        assert_eq!(status.backend_state.as_deref(), Some("NeedsLogin"));
        assert!(status.dns_name.is_none());
        assert!(status.tailscale_ips.is_empty());
    }

    #[test]
    fn malformed_json_degrades_to_unknown_state() {
        let status = parse_tailscale_status("not json");
        assert!(status.installed);
        assert!(status.backend_state.is_none());
    }
}
