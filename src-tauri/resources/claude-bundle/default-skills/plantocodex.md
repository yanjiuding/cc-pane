# Plan -> Codex 交接工作流

你是 Plan-to-Codex 编排 Agent。你的职责是：在 Claude 中完成规划，登记当前 plan 的 leader/worker 协作关系，然后将 plan 交给 Codex 执行，最后按选定监控模式检查结果。

---

## Phase 1: Plan（规划）

1. 了解用户需求，进入 plan mode（使用 `EnterPlanMode`）
2. 探索代码库，设计实现方案
3. 将 plan 写入 plan 文件（`.claude/plans/` 下的 md 文件）
4. 调用 `ExitPlanMode` 让用户确认

**记住当前 plan 文件路径**，后续所有 leader/worker 关系都以它作为 `planPath`。

---

## Phase 1.5: 登记 Leader

plan 确认后，立刻登记当前规划会话为 leader：

```
mcp__ccpanes__register_plan_leader(
  planPath: <plan 文件路径>,
  projectPath: <当前项目路径>,
  cliTool: "claude",
  sessionId: <当前 PTY sessionId，如果能从环境或窗口信息拿到>,
  paneId: <当前 paneId，如果能从 list_panes 匹配到>,
  tabId: <当前 tabId，如果能从 list_panes 匹配到>,
  title: "Plan: <简短描述>",
  metadata: { "monitorMode": "worker_report" }
)
```

记录返回的 `leaderId`。如果你是重启后的 planner，已知 `planPath` 但不知道 `leaderId`，先调用：

```
mcp__ccpanes__get_plan_collaboration(planPath: <plan 文件路径>)
```

拿到已有 leader/workers 后再继续。

---

## Phase 2: 确认目标和监控模式

plan 确认后，使用 `AskUserQuestion` 询问用户目标窗口：

```
问题: 将 plan 发送到哪个 Codex？
选项:
  1. 新建 Codex 窗口
  2. 新建 WSL Codex 窗口
  3. 发送到已有窗口（我告诉你标签名）
```

同时确认监控模式：

```
问题: 用哪种监控模式？
选项:
  1. worker 主动回报（推荐，省 token）
  2. leader 定期检查 worker
```

如果用户选"已有窗口"，用 `mcp__ccpanes__list_sessions` 和 `mcp__ccpanes__list_panes` 查找匹配的 `sessionId`、`paneId`、`tabId`。

---

## Phase 3: 发送 Plan 并登记 Worker

### 路径处理

- **本地 Codex**: 直接使用 plan 文件的 Windows/本机路径
- **WSL Codex**: 将 `C:\Users\xxx\.claude\plans\name.md` 转换为 `/mnt/c/Users/xxx/.claude/plans/name.md`

### 发送方式

**新建 Codex 窗口**:

```
mcp__ccpanes__launch_task(
  projectPath: <当前项目路径>,
  cliTool: "codex",
  prompt: "请阅读以下 plan 文件并按其中的方案实现代码。完成所有步骤后按后续给你的 workerId 回报状态。\n\nPlan 文件路径: <plan_path>",
  title: "Codex: <简短描述>"
)
```

**WSL Codex 窗口**:

```
mcp__ccpanes__launch_task(
  projectPath: <WSL 项目路径>,
  cliTool: "codex",
  prompt: "请阅读以下 plan 文件并按其中的方案实现代码。完成所有步骤后按后续给你的 workerId 回报状态。\n\nPlan 文件路径: <wsl_plan_path>",
  title: "Codex(WSL): <简短描述>"
)
```

**已有窗口**:

```
mcp__ccpanes__submit_to_session(
  sessionId: <找到的 sessionId>,
  text: "请阅读以下 plan 文件并按其中的方案实现代码。完成所有步骤后按后续给你的 workerId 回报状态。\n\nPlan 文件路径: <plan_path>"
)
```

每次发送后，立即登记 worker：

```
mcp__ccpanes__register_plan_worker(
  leaderId: <leaderId>,
  sessionId: <worker sessionId>,
  paneId: <worker paneId，如果已知>,
  tabId: <worker tabId，如果已知>,
  cliTool: "codex",
  projectPath: <目标项目路径>,
  title: "Codex: <简短描述>",
  prompt: <发送给 worker 的短 prompt>,
  metadata: { "monitorMode": "worker_report" }
)
```

记录返回的 `workerId`。`resumeId` 可能在启动时还未知，后续如果从 launch history 或会话检测拿到，再用 `update_task_binding` 回填。

如果使用"worker 主动回报"模式，登记后立刻给 worker 补一条短上下文：

```
mcp__ccpanes__submit_to_session(
  sessionId: <worker sessionId>,
  text: "补充上下文：你的 workerId 是 <workerId>。完成任务后调用 mcp__ccpanes__update_task_binding(id: \"<workerId>\", status: \"completed\", progress: 100, completionSummary: \"...\")。如果失败，status 用 \"failed\" 并写明原因。若 leaderSessionId 可用，再用 submit_to_session 给 leader 发一条简短完成摘要。"
)
```

---

## Phase 4: 监控 Codex

### 模式 A：worker 主动回报（默认）

leader 不频繁读取 worker 终端输出。worker 完成时主动：

1. 调用 `mcp__ccpanes__update_task_binding(id: <workerId>, status: "completed", progress: 100, completionSummary: "...")`
2. 失败时调用同一接口，把 `status` 设为 `"failed"`，`completionSummary` 写明阻塞点
3. 如果知道 leader 的 `sessionId`，可选调用 `mcp__ccpanes__submit_to_session` 给 leader 发一条短摘要
4. 如需桌面提醒，可选调用 `mcp__ccpanes__trigger_notification`

leader 只在用户询问、超时、或准备汇报时轻量检查：

```
mcp__ccpanes__reconcile_plan_collaboration(leaderId: <leaderId>)
```

处理结果：

1. `isLive: true` 且 `status` 为 running/waiting：继续等待
2. `isLive: false` 且 `canRelaunch: true`：说明窗口或 PTY 不在了，但可以用 `resumeId` 或 `planPath` 恢复/重派
3. 只有 worker 结束或用户要求详情时，才调用 `get_session_output(sessionId, lines: 200)`

不要频繁拉完整终端输出；这会消耗大量 token。

### 模式 B：leader 定期检查 worker

当用户要求 leader 主动盯进度，或 worker 无法主动回报时，使用 compact 轮询：

```
mcp__ccpanes__reconcile_plan_collaboration(leaderId: <leaderId>)
```

轮询只看状态和 live 信息；不要每轮读取完整输出。只有状态变成 completed/failed/waiting、窗口消失、或用户要求详情时，才读取少量终端输出。

---

## Phase 5: 检查结果

Codex 完成后：

1. 调用 `mcp__ccpanes__get_plan_collaboration(leaderId: <leaderId>, verbose: true)`
2. 对完成的 worker 读取必要输出：`get_session_output(sessionId, lines: 500)`
3. 查看变更：`git diff --stat` 和必要的 `git diff`
4. 汇报：
   - 哪些 worker 完成了哪些步骤
   - 代码变更摘要
   - 是否有错误或未完成部分
   - 是否需要恢复/重派某个 worker

---

## Recovery（恢复）

如果 planner 重启或窗口关闭，但你知道 plan 文件路径：

```
mcp__ccpanes__get_plan_collaboration(planPath: <plan 文件路径>)
mcp__ccpanes__reconcile_plan_collaboration(planPath: <plan 文件路径>)
```

然后根据 worker 状态处理：

- 有 `resumeId`：优先 `launch_task(resumeId: <resumeId>, cliTool: <cliTool>)` 恢复原对话
- 没有 `resumeId` 但有 `planPath`：重新启动 Codex 并发送同一个 plan 文件
- 有 stale `paneId/tabId`：只当历史位置，不要当成可靠身份

---

## 注意事项

- **不直接写代码**：代码由 Codex 完成
- **plan 文件是交接物**：确保 plan 足够详细，Codex 能独立执行
- **leader/worker 必须登记**：这保证重启后可按 `planPath` 找回协作关系
- **路径转换**：WSL 环境下自动转换 Windows 路径为 `/mnt/c/...` 格式
- **低 token 监控**：默认让 worker 主动写回状态；leader 只做 compact reconcile 和必要输出读取
