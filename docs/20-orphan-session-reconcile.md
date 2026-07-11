# 孤儿会话回收与多实例安全（Kill 事件语义）

> 状态：已实现（0.10.16）。本文合并了 0.10.15 引入前端孤儿对账后发生的
> "多实例互杀"事故的调查结论，以及后续的止血设计。

## 背景：两级孤儿回收

daemon 里的终端会话可能失去全部前端引用（布局删除、崩溃重启后未被收养等），
空闲 TUI 每帧重绘持续消耗 CPU。回收分两级：

| 层 | 位置 | 周期 | 判定依据 |
|---|---|---|---|
| 前端对账 | `web/hooks/useOrphanSessionReconciler.ts` | 首轮 5min，之后每 10min | 本实例内存中的全部引用源（全布局 tab + Self-Chat + Runner + 活跃 task binding） |
| daemon TTL 兜底 | `cc-panes-daemon/src/session_reaper.rs` | 每 60s | 无 WS 订阅且无 HTTP 访问超过 TTL（默认 24h），覆盖 app 不运行的时段 |

## 事故：多桌面实例互杀（0.10.15）

**症状**：右键"打开 Claude Code"，tab 弹出后立即消失。

**根因**：升级后旧版本 app 实例残留未退出，与新实例共享同一个 daemon 和
`data.db`。前端对账的"被引用会话全集"只来自**本实例内存**——其他实例新开的
tab 完全不可见，被判为孤儿杀掉。kill 前的 TOCTOU 复查复查的仍是自己实例的
store，救不了跨实例。日志侧证：`orphan-session-reclaimed` 通知反复触发、
两个不同前端 bundle 并发写同一份日志、两实例各自每 60s 互相覆盖
`Saving terminal sessions for restore`。

**调查中发现的伴生缺陷**：

1. daemon 模式下 `session-killed` 事件到不了前端——daemon 的 `WsEmitter`
   只转发 `terminal-output`/`terminal-exit`，`session-killed` 被丢弃；
   app 桥接 `terminal_daemon_event_bridge.rs` 也只解析 Output/Exit。
   连带 MCP `kill_session` 在 daemon 模式下也无法通知前端关标签。
2. `closeTabBySessionId`（唯一由后端事件驱动的关标签路径）全程无日志。
3. daemon 进程 stdout/stderr 均为 `Stdio::null()`，reaper 日志不可见
   （app 侧日志在 `%LOCALAPPDATA%/com.ccpanes.app/logs/`）。

## 修复设计（三层防御）

### 1. 桌面端单实例锁（结构性修复）

`tauri-plugin-single-instance`，在 `src-tauri/src/lib.rs` 作为**第一个插件**
注册。第二次启动同 identifier 的 app 只会聚焦已有窗口。锁按 identifier
派生，dev（`com.ccpanes.dev`）与 release（`com.ccpanes.app`）仍可并存。

### 2. KillReason 贯通 + session-killed 补通道

`cc-panes-core::services::terminal_service::KillReason`（kebab-case serde，
`#[serde(other)] Unknown` 兜底）：

| reason | 发起方 | 前端行为 |
|---|---|---|
| `user-close` | 关标签/关面板/快捷键/Self-Chat（命令层缺省值） | 关标签 |
| `mcp` | orchestrator `kill_session`（MCP/HTTP） | 关标签 |
| `orphan-reclaim` | 前端孤儿对账 | **保留标签**，显示进程退出 |
| `daemon-reaper` | daemon TTL 兜底 | **保留标签**，显示进程退出 |
| `unknown` | 旧客户端/未标注 | 关标签（与旧行为一致） |

贯通路径：

- `TerminalService::kill_with_reason` → emit `session-killed {sessionId, reason}`；
  旧 `kill()` 委托 `Unknown`。`TerminalBackend` trait 加默认方法。
- daemon HTTP：`DELETE /api/sessions/{id}?reason=...`（query 参数，旧 daemon
  忽略未知 query，旧 app 不带 reason → `Unknown`）。
- daemon `WsEmitter` 新增 `session-killed` → `{"type":"killed","reason"}` 转发
  给该会话的所有 WS 订阅者（cc-panes-web 同步）；app 桥接解析 `Killed` 消息
  重新 emit 给 webview，并 synthesize 一次 exited 状态。桥接的
  `DaemonStreamMessage` 加 `#[serde(other)] Unknown` 兜底，未来新增消息类型
  不会把整条流打退化成轮询。
- 前端 `terminalService` 的 `session-killed` 监听按上表分流；保留标签的
  分支驱动 exit 回调让 TerminalView 显示 "Process exited"。
  `closeTabBySessionId` 入口补 `console.info` 留痕。

回滚升级兼容：旧 app + 新 daemon → 旧桥接遇 `killed` 消息 serde 失败退化
轮询（功能不损）；新前端 + 无 reason 事件 → 默认关标签（与旧行为一致）。

### 3. 多客户端 fail-closed（对账守卫）

daemon 新增 `GET /ws/control?kind=desktop&token=...` 控制 WS：每个桌面实例
启动后保持一条（`src-tauri/src/services/terminal_daemon_control_link.rs`，
断开指数退避重连），daemon 用 RAII guard 统计活跃连接数并在
`/api/daemon/status` 暴露 `desktopClientCount`。

选连接计数而非"HTTP 注册 + 心跳 + TTL"：连接存活 = 该进程还可能发起 kill，
语义精确；卡死实例的心跳会过期被剔除，反而让别的实例误以为独占（与
fail-closed 目标相反）。`kind=web`（cc-panes-web）不计入——web 镜像不跑
对账（`isTauriRuntime()` 门禁），计入会导致开着 web access 时对账永久失效。

前端对账在 sweep 开头与每次 kill 前检查
`get_terminal_daemon_client_info`：

- in-process → 会话本实例独占，照常；
- daemon 且 `desktopClientCount === 1` → 照常；
- 计数 >1 / 缺失（旧 daemon）/ 查询失败 → **跳过本轮**（宁可不杀）。

已知残余风险（接受）：纯 web 端新建、桌面端未收养的会话仍可能被桌面对账
判孤儿——与 0.10.15 行为一致，不在止血范围。

## 排障索引

- 前端：`[orphan-reconcile] ...`（sweep 跳过/回收/失败）、
  `[terminal] session-killed ...`（分流决策）、
  `[panes] closeTabBySessionId`（关标签留痕）。
- daemon：`reaping orphaned session`、`desktop control client connected/disconnected`。
- 单实例锁：`[single-instance] second launch blocked ...`。
