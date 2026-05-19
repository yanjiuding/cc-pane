//! Env 读取与 CLI/运行环境探测
//!
//! 从 session_start.rs:44-80 抽取，提供给所有 cc-pane 事件子命令复用。

/// 读取一个必需的环境变量；缺失时返回错误信息（不 panic）。
pub fn required_env(key: &str) -> Result<String, String> {
    std::env::var(key).map_err(|_| format!("missing env: {}", key))
}

/// 读取一个可选的环境变量；空字符串视为缺失。
pub fn optional_env(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

/// 检测当前是哪个 CLI 工具触发了 hook（claude / codex）。
///
/// 优先级：
///   1. `CC_PANES_CLI_TOOL` 环境变量显式指定
///   2. Codex 启动时常见的 `CODEX_HOME` / `CODEX_SANDBOX` / `CODEX_REMOTE`
///   3. 默认 claude
pub fn detect_cli_tool() -> &'static str {
    if let Ok(cli_tool) = std::env::var("CC_PANES_CLI_TOOL") {
        match cli_tool.as_str() {
            "codex" => return "codex",
            "claude" => return "claude",
            _ => {}
        }
    }

    if std::env::var("CODEX_HOME").is_ok()
        || std::env::var("CODEX_SANDBOX").is_ok()
        || std::env::var("CODEX_REMOTE").is_ok()
    {
        "codex"
    } else {
        "claude"
    }
}

/// 检测运行环境（local / wsl / ssh）。
///
/// 优先级：
///   1. `CC_PANES_RUNTIME_KIND` 显式指定
///   2. `SSH_CONNECTION` / `SSH_CLIENT` → ssh
///   3. `WSL_DISTRO_NAME` → wsl
///   4. 默认 local
pub fn detect_runtime_kind() -> &'static str {
    if let Ok(runtime_kind) = std::env::var("CC_PANES_RUNTIME_KIND") {
        match runtime_kind.as_str() {
            "ssh" => return "ssh",
            "wsl" => return "wsl",
            "local" => return "local",
            _ => {}
        }
    }

    if std::env::var("SSH_CONNECTION").is_ok() || std::env::var("SSH_CLIENT").is_ok() {
        "ssh"
    } else if std::env::var("WSL_DISTRO_NAME").is_ok() {
        "wsl"
    } else {
        "local"
    }
}
