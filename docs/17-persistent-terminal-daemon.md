# Persistent Terminal Daemon Feature Plan

状态: P0 Planned
日期: 2026-06-17

优先级: 当前最重要的长期 feature。先做后端化 / daemon 化，把 CC-Panes 从
“UI 持有终端”改成“UI 连接后端终端服务”。远程访问和浏览器 UI 都排在这个基础之后。

## 1. 目标

把 CC-Panes 从“终端宿主”改成“终端客户端”:

- UI 可以关闭、重启、升级或崩溃。
- 终端进程由后台 `cc-panes-daemon` 持有。
- UI 重开后直接 attach 仍存活的 session。
- 浏览器 UI 未来也可以通过 daemon API 获得接近客户端的终端能力。

这个 feature 学 tmux 的 server/client 架构，但不做 tmux 后端。

## 2. 非目标

- 不接 tmux / zellij 作为后端。
- 不承诺系统重启后原 PTY、shell、Claude、Codex 进程还活着。
- MVP 不覆盖完整 SSH/WSL/跨平台。
- 不一次性重写 pane/layout/store。
- 不在未稳定前替换现有 in-process terminal path。

## 3. 恢复模型

### 热恢复

场景:

- 关闭 CC-Panes UI。
- Tauri UI 崩溃。
- 前端刷新或重启。
- 客户端升级但 daemon 兼容。

行为:

- daemon 继续持有 PTY 和子进程。
- UI 启动后 `list_sessions`，匹配 persisted `sessionId`。
- 可见终端 attach live session，拿 replay snapshot 后订阅实时输出。
- 不可见终端不订阅输出，不创建 xterm renderer。

### 冷恢复

场景:

- 系统重启。
- daemon 被杀。
- daemon session registry 丢失或版本不兼容。

行为:

- 原进程无法保活。
- UI 立即显示 persisted layout 和最后 replay/output snapshot。
- session 标记为 stale / needs resume。
- 只自动恢复当前可见终端。
- 其他终端点击或可见后按现有 resume/create 流程重建。

## 4. 性能原则

多开几十个终端不卡，核心约束:

- daemon 持有所有 PTY，UI 只 attach 可见终端。
- 不可见 session 只写 daemon-side ring buffer。
- 输出按帧批量推给 UI，避免 chunk 级 React/xterm 写入。
- 每个 session replay buffer 有硬上限。
- 每个 subscriber queue 有硬上限。UI 卡住时允许丢中间帧，再通过 snapshot resync。
- 恢复/启动限流，可见优先。
- xterm WebGL renderer 只为可见 terminal mount。
- daemon 侧每个 session 使用独立 task/channel，避免全局大锁。

## 5. MVP 范围

第一阶段只做 local terminal 热恢复:

- 新增 Rust binary: `cc-panes-daemon`。
- Tauri 启动时发现或拉起 daemon。
- daemon 持有:
  - PTY/session map
  - child process lifecycle
  - replay buffer
  - session registry
  - subscriber hub
- 现有 Tauri terminal commands 经 `DaemonBackend` 转发:
  - `create_terminal_session`
  - `write_terminal`
  - `resize_terminal`
  - `kill_terminal`
  - `get_terminal_replay_snapshot`
  - `get_all_terminal_status`
- UI 退出后 daemon 默认保留 session。
- UI 重启后 persisted `sessionId` 如果仍 live，直接 attach。
- daemon 不存在或 session missing 时 fallback 到当前恢复逻辑。

MVP 需要 feature flag:

```text
CCPANES_TERMINAL_DAEMON=1
```

默认仍走现有 in-process path。

## 6. 建议架构

先抽 `TerminalBackend`，避免大爆炸重构:

```rust
trait TerminalBackend {
    fn create_session(&self, request: CreateSessionRequest) -> Result<String>;
    fn attach_session(&self, session_id: &str) -> Result<TerminalReplaySnapshot>;
    fn write(&self, session_id: &str, data: &[u8]) -> Result<()>;
    fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<()>;
    fn kill(&self, session_id: &str) -> Result<()>;
    fn list_sessions(&self) -> Result<Vec<SessionStatusInfo>>;
}
```

Implementations:

```text
InProcessBackend  现有 TerminalService 行为，默认
DaemonBackend     实验路径，连接 cc-panes-daemon
```

daemon 内部建议模块:

```text
cc-panes-daemon
  SessionManager
  PtySupervisor
  BufferStore
  SubscriberHub
  RegistryStore
  LifecyclePolicy
```

UI 侧建议模块:

```text
DaemonClient
VisibleAttachManager
TerminalSessionState
```

## 7. Daemon API 草案

```text
daemon.status()
daemon.shutdown(policy)

session.create(request) -> sessionId
session.attach(sessionId, subscriberId) -> replaySnapshot + stream
session.detach(sessionId, subscriberId)
session.write(sessionId, bytes)
session.resize(sessionId, cols, rows)
session.kill(sessionId)
session.list(workspaceId?)
session.snapshot(sessionId) -> replaySnapshot
```

浏览器 UI 未来也走同一套 API。Tauri 只负责启动/发现 daemon、窗口、托盘、更新和少量原生能力。

## 8. 安全边界

- socket 放在 user runtime/app data dir。
- 启动时生成 per-user token。
- UI 连接 daemon 必须带 token。
- daemon 只接受当前用户连接。
- 浏览器模式默认只监听 localhost。
- 远程访问必须另行设计认证，不纳入 MVP。

## 9. 生命周期策略

后续设置项:

- 关闭窗口:
  - hide to tray
  - quit UI, keep daemon sessions
  - quit and kill sessions
- daemon 空闲保留时间。
- 重启后是否自动恢复可见 session。
- 是否自动恢复所有 session。
- 最大自动恢复并发。

托盘/菜单后续动作:

- Show Window
- Quit UI
- Quit and Kill Sessions
- Session Manager

## 10. 验收标准

MVP 验收:

- 启动一个本地 Claude/Codex/shell session。
- 关闭 CC-Panes UI。
- 重新打开 CC-Panes。
- 原 session 没有重启，可以继续输入。
- 10 个 session 存在时，UI 重启只 attach 当前可见终端。
- daemon 被杀后，UI fallback 到当前 session restore/resume 流程。
- 系统重启后显示 stale 状态，不假装热恢复。
- 未设置 `CCPANES_TERMINAL_DAEMON=1` 时现有终端功能不回退。

## 11. 下一次实施入口

优先顺序:

1. 定义 `TerminalBackend` trait 和 `InProcessBackend` 包装，不改变行为。
2. 增加 daemon binary skeleton 和 socket/token 握手。
3. 迁移 local PTY create/write/resize/kill/snapshot 到 daemon 实验路径。
4. UI 增加 attach live session path。
5. 保留现有 restore/resume fallback。
6. 加 local MVP 集成测试和手工验证脚本。

不要先碰 SSH/WSL，也不要先做浏览器 UI。先证明 local daemon 热恢复闭环。

## 12. 产品优先级结论

后端化先做，因为它同时解决三个核心问题:

- CC-Panes 关闭或重启后，原有终端可以秒级恢复。
- 多开几十个终端时，UI 只 attach 可见终端，性能模型更稳。
- 未来浏览器端可以连接同一后端，能力接近当前 Tauri 客户端。

因此后续 roadmap 应按这个顺序推进:

1. `TerminalBackend` 抽象和默认 `InProcessBackend`。
2. `cc-panes-daemon` local MVP。
3. Tauri client attach / detach live session。
4. session stale / resume fallback。
5. daemon API 稳定后再做浏览器 UI 和远程访问。
