---
name: plan2codexwsl
description: 在 plan mode 内启动另一个 CLI（Codex/Gemini，WSL 或本地）对 plan 做同行评审，轮询完成后通过 AskUserQuestion 让用户拍板，再整体重写 plan。专治"同一个 Claude 我审我"的盲区。
trigger: |
  - 用户在 plan mode 里写完初版 plan，想找另一个 CLI 做同行评审 / 交叉审 / peer review
  - 用户明说"找 codex 评审 plan"、"叫 gemini 看下我的 plan"、"开个 WSL Codex 审一下"、"在另一个窗口审 plan"
  - 用户提到 UI E2E 测试计划、数据迁移/回滚计划、上线变更计划这类高风险 plan 需要二审
  不触发：trivial plan（< 30 行、纯代码 refactor）、用户已明说不要双 CLI、目标 reviewer CLI 未安装
---

# plan2codexwsl — 跨 CLI Plan 同行评审

你是 Plan 同行评审编排 Agent。Claude 自己写完 plan 后**不直接退 plan mode**，而是启动另一个 CLI（Codex / Gemini / Cursor）独立审 plan，把结构化反馈拿回来，由用户拍板后整体重写 plan。

> 单一 Claude 审自己写的 plan 容易有"我审我"盲区。换一个 CLI 实例读同一份 plan + 同一份代码，能挖出操作错误假设、UI 不可达控件、数据耦合、回滚遗漏等盲点。

---

## 何时用 / 何时不用

**用**：

- Plan 涉及 **UI 端到端测试** / **数据迁移与回滚** / **跨服务时序** / **线上变更**
- Plan 文件 ≥ 50 行，含多阶段步骤、SQL、回滚脚本、兜底逻辑
- 用户提到"想找 codex/gemini 审一下"、"换个角度看"、"再 review 一遍"
- 风险高、改错代价大、用户希望留下可审计的 reviewer 对话窗口

**不用**：

- 纯代码 refactor、单文件改动、< 30 行 plan
- 用户明说"我自己看就行 / 不要再叫 codex"
- 目标 reviewer CLI（codex/gemini）未安装，且用户不愿换工具
- 已经走完一轮评审、用户在二轮迭代（这种直接改 plan，不重复启 reviewer）

---

## 前置检查（开干前都要过）

1. **当前在 plan mode 吗？** 否则提醒用户先 `EnterPlanMode`，写完初版 plan 再回来
2. **plan 文件已落盘？** plan mode 默认禁止 `Write`。要么 (a) 通过 `ExitPlanMode` 拿到用户批准后再用 `Write` 把 plan 写到 `.claude/plans/<topic>.md`、再重新 `EnterPlanMode`；要么 (b) 项目 hook 配置允许写 `.claude/plans/`（cc-book 的 plantocodex 默认走 b）。**实际能不能 Write 取决于项目配置——卡住就立刻退 plan mode 写完再回来**。记下绝对路径作为 `<plan_path>`
3. **目标 reviewer CLI 用哪个？** 直接 `AskUserQuestion` 问用户（不要靠 `list_launch_history` 猜——历史可能为空或包含已废弃的会话）
4. **运行环境**：本地还是 WSL？路径转换看下一节
5. **ccpanes 已注册当前项目？** `mcp__ccpanes__list_projects` 确认，缺则提示用户先 `add_project_to_workspace`

### WSL 路径转换规则

| 输入 | 转换后（喂给 WSL CLI） |
|------|----------------------|
| `C:\Users\foo\.claude\plans\x.md` | `/mnt/c/Users/foo/.claude/plans/x.md` |
| `D:\code\erp\docs\spec.md` | `/mnt/d/code/erp/docs/spec.md` |
| `\\wsl$\Ubuntu\home\foo\proj` | `/home/foo/proj`（去掉 UNC 前缀） |
| 已经是 `/home/...` 或 `/mnt/...` | 原样使用 |

`launch_task` 的 `projectPath`：传 WSL 形式（`/mnt/...` 或 `/home/...`）并配 `runtimeKind: "wsl"`；UNC 形式（`\\wsl$\...`）也能识别但容易出错，优先用 `/mnt/...`。Prompt 文本里所有路径都得提前转好。

---

## 执行步骤

### Phase 1：完成初版 plan

按常规 plan mode 流程：探索代码、设计方案，把 plan 写到 `.claude/plans/<topic>.md`。

> **plan mode 默认禁用 Write**——见前置检查第 2 条。如果 hook 不放行，必须 `ExitPlanMode` 让用户批准后再 `Write`，然后重新 `EnterPlanMode` 继续走 reviewer 流程。**别把 plan 留在脑子里当作"已写好"**，reviewer 需要读文件。

记住 `<plan_path>` 作为后续所有调用参数。

### Phase 2：确认 reviewer 目标

用 `AskUserQuestion` 问：

```
问题 1: 用哪个 CLI 做 reviewer？
  - Codex (WSL)   ← 跨工具盲点最大，推荐
  - Codex (本地)
  - Gemini (本地)
  - 已有窗口（我告诉你标签名）

问题 2: 评审维度有补充吗？
  - 默认 6 维（业务时序 / 数据耦合 / UI 可行性 / 数据红线 / 回滚完整性 / 未覆盖场景）
  - 加：性能 / 安全 / 兼容性 / ...
```

"已有窗口"分支：`mcp__ccpanes__list_sessions` + `list_panes` 找 sessionId。

### Phase 3：启动 reviewer 并喂上下文

**WSL 路径转换**：plan 文件 + 相关业务文档 + 代码改动文件，全部转 `/mnt/<盘符小写>/...`

**新建窗口**：

```
mcp__ccpanes__launch_task(
  projectPath: <项目路径，WSL 走 /mnt/... 或 UNC>,
  cliTool: "codex",                  // 或 "gemini"
  runtimeKind: "wsl",                 // 本地省略
  title: "Reviewer: <plan 简短描述>",
  prompt: <见下方 prompt 模板>
)
```

**已有窗口**：

```
mcp__ccpanes__write_to_session(
  sessionId: <匹配到的>,
  text: <见下方 prompt 模板，末尾加 \n 触发回车>
)
```

> 注意：ccpanes MCP 当前只暴露 `write_to_session`（写入原文，不自动换行）。如果 reviewer CLI 需要回车提交，记得在 `text` 末尾追加 `\n`。

记录返回的 `sessionId`。

### Phase 4：等 reviewer 完成

```
mcp__ccpanes__get_session_status(sessionId)
```

返回字段里看 `status`（可能值见 ccpanes 文档）：

- 仍在跑（如 `active`） → 继续等
- 不再跑（如 `idle` / `waiting` / `exited`）→ 进入 Phase 5
- 字段名/枚举不确定 → 直接 `get_session_output` 抓最近 200 行人工判断（输出停了且尾部有完整三段式 ✅/⚠️/❓ 就算完成）

**触发轮询的方式**（按优先级选一个）：

1. **用户主动问**（最省 token，推荐）：Claude 不自己轮询，告诉用户"reviewer 在审，你切到那个标签能看，审完叫我"。用户回来后 Claude 调一次 `get_session_status` + `get_session_output`
2. **手动调一次**：发完 prompt 后等用户来报，或在做下一件事前手动 check 一次
3. **定时轮询**：用 `ScheduleWakeup(delaySeconds: 270, prompt: "check reviewer session <sessionId>")` 在 4–5 分钟后回来检查，避免烧 cache。**不要**用 `CronCreate` 短间隔轮询——reviewer 通常需要数分钟

> **不内置超时**。reviewer 卡多久由用户判断是否 `kill_session` 重发。

### Phase 5：读 reviewer 输出 + 结构化吸收

```
mcp__ccpanes__get_session_output(sessionId, lines: 500)
```

把输出按 ✅ / ⚠️ / ❓ 三段分类（reviewer 应按模板输出，没按就你来归类）：

- ✅ **已确认稳妥** — 不动 plan
- ⚠️ **必修问题** — 必须改 plan 才能继续
- ❓ **开放问题** — 需要用户拍板（业务取舍、风险偏好）

### Phase 6：用 AskUserQuestion 让用户拍板

**反模式（不要做）**：

- ❌ 看完 reviewer 输出**默默改 plan**，不告诉用户改了哪些条
- ❌ 把 reviewer 全部建议**一股脑塞进 plan**，不分优先级
- ❌ 只追加在 plan 末尾"反馈纪要"，让老错误条目继续留着

**正确做法**：

```
AskUserQuestion:
  问题 1: ⚠️ 必修问题 N 条，每条给「采纳 / 修改后采纳 / 拒绝」三选项
  问题 2: ❓ 开放问题，给业务取舍选项（如：是否允许在生产库跑、是否要回滚演练）
```

每条都拿到明确答复后再进 Phase 7。

### Phase 7：整体重写 plan（不是追加）

用 `Write` **整体重写** `<plan_path>`：

- 吸收所有"采纳"和"修改后采纳"
- 拒绝项在 plan 顶部一个简短"已评审决议"小节记一笔，不让后人重提
- 不要保留老错误条目（"原步骤 3：xxx —— 已废弃"这种留瑕千万别留）

> 同样，plan mode 下能不能 `Write` 取决于 hook 配置。如果被拦，先 `ExitPlanMode` 写完再 `EnterPlanMode`（plan 内容此时已包含 reviewer 反馈，用户审起来更顺）。

### Phase 8：收尾

- 简短告诉用户："reviewer 提了 N 条必修、M 条开放，已按你的拍板重写 plan，可以 `ExitPlanMode` 让用户最终批准了"
- 不要主动 `ExitPlanMode`——让用户看完最新 plan 再决定

---

## Reviewer Prompt 模板

发给 reviewer CLI 的提示词骨架，**必须**包含：

```
你是独立同行评审者。请审阅以下 plan，不要执行，不要写代码。

## Plan 文件
<plan_path>   （已转 WSL 路径）

## 背景文档
- <业务文档 1 路径>
- <业务文档 2 路径>

## 涉及的代码改动要点
- <文件 1>：<改动一句话>
- <文件 2>：<改动一句话>

## 评审维度（请逐条点名）
1. **业务时序**：步骤先后是否符合真实业务流，有无并发/竞态
2. **数据耦合**：跨表/跨服务的数据依赖是否处理
3. **UI 可行性**：UI 上声称的控件/路径是否真的存在、可点
4. **数据红线**：生产数据、隐私字段、不可逆操作的边界
5. **回滚完整性**：每一步是否有对应回滚，回滚是否能恢复全部状态
6. **未覆盖场景**：异常路径、边界值、权限/角色差异

## 输出格式（严格三段）
✅ 已确认稳妥：<点列，每条 1 行>
⚠️ 必修问题：<点列，每条标维度 + 具体位置 + 修改建议>
❓ 开放问题：<点列，每条标维度 + 选项 + 你的倾向>

不要复述 plan 内容，不要泛泛而谈，只列具体可执行的修改点。
```

替换 `<plan_path>` 和文档路径时，**记得 WSL 路径转换**。

---

## 关键工具调用速查

| 步骤 | 工具 |
|------|------|
| 选 reviewer CLI / 评审维度 | `AskUserQuestion` |
| 查项目是否注册 | `mcp__ccpanes__list_projects` |
| 找已有窗口 | `mcp__ccpanes__list_sessions` + `list_panes` |
| 启动新 reviewer 窗口 | `mcp__ccpanes__launch_task` |
| 复用已有窗口 | `mcp__ccpanes__write_to_session`（必要时 text 末尾加 `\n`） |
| 查状态 | `mcp__ccpanes__get_session_status` |
| 读输出 | `mcp__ccpanes__get_session_output` |
| 延后回来 check | `ScheduleWakeup`（delay 270s 起步） |
| 用户拍板 | `AskUserQuestion`（必修 + 开放各一组） |
| 重写 plan | `Write`（整体重写，非追加；被 plan mode 拦就先 ExitPlanMode） |

---

## 与 plantocodex 的区别

| 维度 | plantocodex | plan2codexwsl |
|------|-------------|----------------|
| 目的 | 把 plan 交给 Codex **执行** | 把 plan 交给另一个 CLI **评审** |
| Codex 角色 | 实现者 | 独立审查者 |
| Plan 后续 | 由 Codex 改代码 | 由 Claude 自己重写 plan |
| 退出 plan mode | Codex 启动前 | 评审吸收完之后 |

两者可以串联：先 `plan2codexwsl` 评审 → 重写 plan → `ExitPlanMode` → `plantocodex` 派 Codex 实现。

---

## 反模式总结

- ❌ 默默吸收 reviewer 反馈，不让用户拍板
- ❌ 在 plan 末尾追加而不是整体重写
- ❌ reviewer 还没输出三段式就强行总结
- ❌ 给 reviewer 喂 Windows 路径却让它跑在 WSL 里
- ❌ 把 reviewer 当 Codex 用——让它去改代码（这是另一个 skill 的事）
- ❌ 内置超时强制 kill——交给用户判断
