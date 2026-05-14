# Multica Reference Analysis

Date: 2026-05-07

Source:

- Repository: <https://github.com/multica-ai/multica>
- Local clone: `ref/multica`
- Snapshot commit: `c3ddb57`

This note records what CC-Panes can learn from Multica and where the two projects differ. It is based on static repository and documentation review; Multica was not started locally.

## Positioning

Multica is a team-oriented managed agents platform. Its core objects are workspaces, issues, projects, agents, runtimes, skills, comments, inbox events, and scheduled autopilots. Users assign work to agents through issues or chat, and local daemons claim and execute tasks.

CC-Panes is a local desktop agent workbench. Its core objects are panes, terminals, sessions, workspaces, projects, local files, Git operations, providers, MCP config, skills, todos, and local orchestration. Users directly supervise and steer multiple local CLI sessions.

They overlap around agent execution, skills, runtimes, and task tracking, but the product centers are different.

## Multica Architecture

Multica uses a server plus daemon model:

- Web UI: Next.js dashboard for issues, projects, agents, runtimes, inbox, skills, chat, and autopilots.
- Backend: Go server with REST/WebSocket APIs.
- Database: PostgreSQL 17 with pgvector.
- Runtime: local `multica` daemon that detects agent CLIs and executes claimed tasks.
- Desktop: Electron shell that manages/bundles CLI and daemon connectivity.

Important implementation points:

- `server/internal/daemon/daemon.go` runs local runtime registration, heartbeat, workspace sync, queue polling, task wakeup, cancellation polling, and task execution.
- `server/pkg/db/queries/agent.sql` models task claim/start/complete/fail/session recovery using SQL and `FOR UPDATE SKIP LOCKED`.
- `server/internal/daemon/execenv/execenv.go` creates isolated per-task work directories, context files, Codex homes, skills, and GC metadata.
- `server/pkg/agent` abstracts Claude, Codex, Copilot, OpenCode, OpenClaw, Gemini, Cursor, Kimi, Kiro, and others into a unified execution interface.
- `packages/views` contains a rich team dashboard around issues, agents, runtimes, and task transcript surfaces.

## Worth Learning

1. Task lifecycle should be explicit.

Multica has first-class states such as queued, dispatched, running, completed, failed, and cancelled. Claiming is atomic, ordered by priority, guarded by concurrency limits, and tied to runtime availability.

CC-Panes currently has `TaskBinding`, `Todo`, launch history, and PTY state, but no full local execution queue. If CC-Panes adds unattended agent work, the first useful step is to turn TaskBinding into a real local queue.

2. Runtime should be a managed concept.

Multica treats a runtime as a registered execution environment with heartbeat, available CLIs, owner/workspace scope, and active task counts. This gives the UI a stable model for "where can this agent run?".

CC-Panes can use a lighter local version: detect CLI adapters, expose per-runtime status, and route tasks to an available local/WSL/SSH runtime.

3. Preserve structured execution records.

Multica normalizes agent events into messages: text, thinking, tool use, tool result, status, errors, logs, session IDs, and token usage.

CC-Panes already captures terminal streams, but task-level transcript data should become structured if the product wants reliable summaries, reruns, failure diagnosis, and comparisons across CLIs.

4. Isolated per-task environments reduce pollution.

Multica creates a workdir per task, injects context and skills, and preserves workdirs for resume. It also tracks GC metadata so completed task artifacts can be cleaned safely.

CC-Panes should adopt this only for unattended/queued tasks. Interactive panes should keep the current direct-project workflow, because direct manipulation is a core CC-Panes advantage.

5. Skills are attached to agents, not just projects.

Multica's structured skills model is workspace-level and agent-linked. That makes a skill part of an agent's capability profile.

CC-Panes already has project skills and memory work. A next step is an Agent Profile that combines CLI tool, provider/model, MCP policy, skill policy, and prompt profile.

6. Wakeups matter.

Multica does not rely only on polling. It has task wakeups so new work can be claimed promptly.

CC-Panes local orchestration can use the same idea for task queue events, todo reminders, session waiting-input events, and external MCP-triggered launches.

## CC-Panes Strengths

- Stronger local desktop control: Tauri, PTY, xterm.js, split panes, tabs, and direct terminal takeover.
- Better engineer workbench: file tree, Monaco editor, Git/worktree operations, local history, screenshots, provider management, MCP configuration, WSL handling, and project import.
- Lower deployment cost: local SQLite/Tauri app instead of server, Postgres, Docker, daemon, and web stack.
- Better fit for a solo power user who wants to supervise multiple live coding agents.
- More direct observability of raw terminal behavior, which is still important when agents get stuck or need human steering.

## Multica Strengths

- Stronger team collaboration model: users, members, roles, issues, projects, comments, subscribers, inbox, and notifications.
- Stronger autonomous execution model: queue, claim, runtime heartbeat, concurrency, cancellation, recovery, timeout classification, and rerun behavior.
- Better first-class agent abstraction: agents are visible teammates with runtime, skills, env, args, model, status, and activity.
- Better structured task history: run messages, transcript views, usage, failure reasons, and session/workdir resume pointers.
- Better cloud/self-host story for teams and CI-style automated work.

## CC-Panes Weaknesses Compared To Multica

- TaskBinding is still mostly a tracking object, not an execution scheduler.
- No full agent lifecycle: agent identity, assignment, active work, status, failure, rerun, and usage are not unified.
- Terminal output is rich but less queryable than a structured task transcript.
- Multi-user/team collaboration is outside the current product model.
- Launch orchestration still has CLI-specific paths; the adapter layer exists, but not every launch path is fully generalized.

## Multica Weaknesses Compared To CC-Panes

- Heavier operational footprint for self-hosting.
- Less suited to live hands-on steering of multiple local agent terminals.
- More product complexity: issues, server, daemon, auth, database, Docker, desktop wrapper, and web runtime all need to work.
- A team SaaS/control-plane model can be overkill for local-first workflows.

## Recommended Direction For CC-Panes

Do not turn CC-Panes into Multica. Keep the product local-first and operator-first.

Adopt the following pieces in order:

1. Upgrade TaskBinding into a local execution queue.
   Add explicit lifecycle, priority, assigned CLI/agent profile, project path, session ID, workdir, failure reason, progress, usage, and transcript pointer.

2. Add Agent Profiles.
   A profile should bundle CLI tool, provider/model selection, MCP policy, skill policy, env overrides, launch args, and default prompt instructions.

3. Add structured transcript capture alongside PTY.
   Keep terminal streaming, but store normalized task messages where possible. For PTY-only CLIs, store coarse status and selected terminal segments.

4. Add isolated workdir mode for queued/unattended tasks.
   Do not force isolation for ordinary interactive panes. Offer it as a task-run policy.

5. Add local runtime status.
   Start with local/WSL/SSH runtime detection and health. Cloud or team server can remain a later option.

6. Add wakeup-driven orchestration.
   Use internal events to trigger claims instead of sleeping/polling everywhere.

7. Only after the local queue is solid, consider optional remote/team mode.

## Files To Revisit

Multica reference:

- `ref/multica/server/internal/daemon/daemon.go`
- `ref/multica/server/internal/daemon/execenv/execenv.go`
- `ref/multica/server/pkg/agent/agent.go`
- `ref/multica/server/pkg/db/queries/agent.sql`
- `ref/multica/server/internal/service/task.go`
- `ref/multica/packages/views/issues/components/agent-live-card.tsx`
- `ref/multica/packages/views/common/task-transcript/`

CC-Panes candidates:

- `cc-panes-core/src/services/task_binding_service.rs`
- `cc-panes-core/src/services/todo_service.rs`
- `cc-panes-core/src/services/terminal_service.rs`
- `cc-cli-adapters/src/lib.rs`
- `src-tauri/src/services/orchestrator_service.rs`
- `web/components/todo/`
- `web/components/panes/`

## Short Takeaway

Multica is the better reference for autonomous task execution and agent-as-teammate modeling.

CC-Panes should borrow the queue/runtime/transcript ideas, but preserve its main advantage: a fast local desktop workbench where the operator can directly see, split, resume, edit, and control live agent sessions.
