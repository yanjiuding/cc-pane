# ccpanes MCP startup token analysis

## Context

This note records the investigation around the Codex warning:

```text
MCP client for `ccpanes` failed to start:
MCP startup failed: Environment variable CC_PANES_API_TOKEN for MCP server 'ccpanes' is not set
```

The issue was analyzed against the `v0.10.8..HEAD` code path, with special attention to the daemon rollout, orchestrator endpoint persistence, Codex MCP injection, Claude MCP injection, and hook fallback behavior.

## Version Chain

### v0.10.8

Terminal daemon mode became enabled by default. This widened the blast radius of daemon and orchestrator lifecycle problems because desktop, web, and mobile terminal sessions all started depending on the standalone daemon path by default.

Important effect:

- Existing sessions can outlive the app process.
- App updates and restarts can leave sessions with stale API endpoint assumptions.
- Any missing or stale `CC_PANES_API_*` injection becomes more visible.

### v0.10.9

The daemon stopped translating `--data-dir` into a WSL path when the daemon itself is running as a native Windows process.

This fixed one WSL launch class:

- Native Windows daemon previously normalized `C:\...` into `/mnt/c/...`.
- That produced mixed path forms in daemon-side WSL launch preparation.
- WSL Codex/Claude could fail before MCP injection even had a chance to work.

### v0.10.10

The updater now stops `cc-panes-web` and `cc-panes-daemon` before installing updates.

This fixed the file-lock problem on Windows, where running helper binaries could prevent the installer from replacing:

- `cc-panes-web.exe`
- `cc-panes-daemon.exe`

It does not by itself solve stale MCP config; it only makes daemon-side fixes more likely to actually land after update.

### v0.10.11

The orchestrator now reuses the previous port and bearer token by reading `mcp-orchestrator.json` during startup, and rewrites that file after the server starts.

The session-start hook also gained a fallback that reads `mcp-orchestrator.json` when `CC_PANES_API_*` env vars are missing.

This is directionally correct, but it is incomplete:

- It helps hook REST calls recover when env vars are missing.
- It does not prevent Codex's own MCP client from reading stale global MCP config.
- It does not cover all hook paths yet.

## Root Cause

There are two independent root causes. Root cause 1 (daemon-side injection gap) explains sessions that get **no MCP injection at all** — Claude and Codex alike, with empty `CC_PANES_API_*` env. Root cause 2 (stale Codex config) explains Codex startup failures **even when injection works**. Fixing only one still leaves the other failure mode live.

### Root cause 1: daemon-side injection never happens (primary for "no MCP at all")

With daemon mode enabled by default (v0.10.8), sessions are spawned by the daemon process's own `TerminalService`. But the orchestrator port+token is only ever injected into the Tauri process's instance:

- The only `set_orchestrator_info` call in the repo is `src-tauri/src/lib.rs:1663` (Tauri process).
- The daemon constructs its `TerminalService` in `cc-panes-daemon/src/main.rs:290-304` and never sets orchestrator info, nor reads `mcp-orchestrator.json`.
- So `healthy_orchestrator_info()` (`cc-panes-core/src/services/terminal_service.rs:2956`) always returns `None` inside the daemon.

Downstream effects, all silent (warn-level logs only):

- Local sessions get no `CC_PANES_API_PORT/TOKEN/BASE_URL` env (`terminal_service.rs:1447-1454`).
- Claude adapter skips `--mcp-config` entirely — `generate_mcp_config` short-circuits on `ctx.orchestrator_port?` (`cc-cli-adapters/src/claude.rs:158-159`), and `build_command` only warns (`:806-824`).
- The WSL branch skips MCP because it reads the same missing env (`terminal_service.rs:1588-1623`).

Reproduced live: a Claude session launched by CC-Panes had no ccpanes MCP and empty `CC_PANES_API_*` env. Stale Codex config cannot explain either symptom (wrong CLI, and stale config does not erase env vars).

Fix direction (tracked in plan `ccpane-mcp-warm-kahan`, peer-reviewed by WSL Codex): `healthy_orchestrator_info()` lazily reads `data_dir/mcp-orchestrator.json` — manifest-first over the in-memory cache (immune to same-port-new-token and port-reuse-by-stranger), probe reachability, backfill cache on success, skip (never delete the manifest) on failure. The daemon's `TerminalService` already holds the correct `app_paths` because Tauri passes `--data-dir` at daemon startup, so dev/release isolation aligns for free. The manifest parsing currently private to `src-tauri/src/services/orchestrator_service.rs:551-576` moves to a shared `cc-panes-core` module so the writer and both readers share one implementation.

### Root cause 1b: orchestrator is blind to daemon sessions

Related but distinct: the orchestrator (MCP/REST, running in the Tauri process) still holds a direct `Arc<TerminalService>` (`state.terminal_service`), which only sees in-process sessions. The Tauri command layer already routes through `TerminalBackendState` to the daemon; the orchestrator does not.

Observed live against a running instance (v0.10.11, daemon mode):

- MCP `list_panes` showed 3 sessions (it reads frontend UI state).
- MCP `list_sessions` returned empty; `get_session_status` returned "session does not exist" for those same session IDs.
- Consequently `launch_task` monitoring, `submit_to_session`, `kill_session`, and the leader/worker `report_to_leader` PTY push-back chain are all broken for daemon-hosted sessions.

Fix direction (same plan): `AppState` holds `Arc<TerminalBackendState>` and resolves the current backend per call; a `local_terminal_service` remains only for `cli_registry()`, the launch-id fast path, and hook status application. `CreateSessionRequest` needs an `extra_env` field so the runner path can go through the backend too.

### Root cause 2: stale user-level Codex config

The direct trigger is stale user-level Codex config.

Codex now uses the real `~/.codex` instead of an isolated `CODEX_HOME`. That fixed resume behavior, but it also means any old global MCP config in `~/.codex/config.toml` is loaded on every Codex launch.

A stale config shaped like this is enough to reproduce the warning:

```toml
[mcp_servers.ccpanes]
url = "http://127.0.0.1:PORT/mcp?token=REDACTED"
bearer_token_env_var = "CC_PANES_API_TOKEN"
```

If the current Codex process does not have `CC_PANES_API_TOKEN`, Codex fails MCP startup before the ccpanes MCP endpoint can be used.

This can happen even when CC-Panes passes a new per-launch URL with `-c mcp_servers.ccpanes.url=...`, because Codex merges dotted config overrides with the existing global table. The old `bearer_token_env_var` field remains effective unless it is explicitly removed or overridden.

## Code Evidence

### Codex adapter

The local Codex adapter injects ccpanes MCP by per-launch CLI config:

- `cc-cli-adapters/src/codex.rs`
- `push_mcp_overrides`
- `mcp_servers.ccpanes.url`
- `mcp_servers.ccpanes.bearer_token_env_var`
- `mcp_servers.ccpanes.enabled`

The key problem is that existing global fields under `mcp_servers.ccpanes` can still merge with per-launch overrides.

### WSL Codex path

The WSL Codex launcher also injects:

- rewritten Windows-host URL
- `mcp_servers.ccpanes.bearer_token_env_var = "CC_PANES_API_TOKEN"`
- `mcp_servers.ccpanes.enabled = true`

It additionally exports `CC_PANES_API_TOKEN` into the WSL launch script when available. That helps normal CC-Panes-managed WSL sessions, but does not solve stale global config for external or old sessions.

### Claude adapter

Claude uses a different path:

- writes a per-session MCP JSON file
- puts token in `headers.Authorization`
- also puts token in URL query as a fallback
- passes the file via `--mcp-config`

Claude is less exposed to `CC_PANES_API_TOKEN` specifically, but it can still miss auto-injection if launched outside the CC-Panes adapter path or if user-level Claude MCP config has stale ccpanes entries.

### Orchestrator

The orchestrator writes:

```json
{
  "mcpServers": {
    "ccpanes": {
      "type": "http",
      "url": "http://127.0.0.1:PORT/mcp?token=REDACTED",
      "headers": {
        "Authorization": "Bearer REDACTED"
      }
    }
  }
}
```

It accepts both:

- `Authorization: Bearer ...`
- `?token=...`

That means Codex does not strictly need `bearer_token_env_var` if the URL already includes the token.

### Hook fallback gap

`cc-panes-cli-hook/src/session_start.rs` uses the new `common::orchestrator::resolve_api_endpoint()` fallback.

But these paths still depend directly on env vars:

- `cc-panes-cli-hook/src/events/dispatch.rs`
- `cc-panes-cli-hook/src/common/http.rs`
- `cc-panes-cli-hook/src/plan_archive.rs`

So session-start is improved, but hook API endpoint recovery is not yet uniform.

## Recommended Fix Plan

### P0: Migrate stale Codex global ccpanes MCP config

Add a one-time or best-effort migration before Codex launch.

Target:

- `CODEX_HOME/config.toml` if `CODEX_HOME` is set
- otherwise `~/.codex/config.toml`

Only remove `mcp_servers.ccpanes` when it clearly matches CC-Panes' old self-injected config.

Suggested signature:

- `url` points to local loopback or localhost
- path starts with `/mcp`
- query contains `token=`
- or `bearer_token_env_var == "CC_PANES_API_TOKEN"`

Do not remove arbitrary user MCP servers named `ccpanes` unless they match the signature.

Implementation notes:

- Prefer `toml_edit` so comments and formatting survive.
- Write a backup before changing the file.
- Use same-directory temp file plus rename.
- Log the migration without printing tokens.

### P0: Stop injecting bearer_token_env_var for ccpanes

For ccpanes only, inject token through the URL query and set the server enabled flag.

Preferred Codex per-launch config:

```text
-c mcp_servers.ccpanes.url="http://HOST:PORT/mcp?token=REDACTED&launchId=..."
-c mcp_servers.ccpanes.enabled=true
```

Avoid:

```text
-c mcp_servers.ccpanes.bearer_token_env_var="CC_PANES_API_TOKEN"
```

This reduces dependence on env propagation and avoids the observed startup error.

Important: this does not fix existing users unless paired with the migration above, because old global `bearer_token_env_var` can still merge in.

### P1: Make hook API endpoint fallback shared

Move the fallback logic into `ApiEndpoint`.

Recommended shape:

- `ApiEndpoint::from_env()` can remain if strict env behavior is needed.
- Add `ApiEndpoint::resolve()` or change `from_env()` to call `common::orchestrator::resolve_api_endpoint()`.
- Use it from `events/dispatch.rs`, `notify.rs`, and `plan_archive.rs`.

That makes all hook REST calls behave like session-start.

### P1: Improve manifest selection

Current fallback scans known data dirs in fixed order.

Better behavior:

1. Use `CC_PANES_DATA_DIR` if set.
2. Otherwise inspect both `.cc-panes` and `.cc-panes-dev`.
3. Prefer a manifest whose endpoint is reachable.
4. If none are reachable, prefer the newest manifest by mtime.

This avoids picking an old release/dev manifest when both exist.

### P1: WSL host rewrite for fallback paths

Formal WSL launches already rewrite the MCP URL to a Windows host that WSL can reach.

Fallback paths that read `mcp-orchestrator.json` directly may get `127.0.0.1`, which is only correct for WSL mirrored networking. In WSL NAT mode, that can point back to the WSL VM instead of the Windows host.

The fallback should either:

- use the existing WSL host resolution logic when running inside WSL, or
- avoid claiming fallback success when it cannot produce a reachable endpoint.

### P2: Review daemon session reaper before release

The current dirty worktree includes a daemon orphan-session reaper. If enabled with a default TTL, it can kill sessions that are still doing useful work but have no active viewer.

Before release, make it conservative:

- default disabled, or
- consider `SessionStatusInfo.last_output_at`
- exempt active/tool-running/compacting sessions
- treat viewer activity and terminal output activity separately

This is not the direct cause of the MCP startup error, but it affects long-running worker reliability.

## Implementation Plan (CC-Panes P0)

This section is the concrete implementation plan adopted from the analysis above. Scope this
change to the two P0 items plus a secondary Claude cleanup; P1/P2 are tracked as follow-ups.

### Confirmed on maintainer machine

`~/.codex/config.toml` contained the exact stale shape (port already dead, orchestrator had
since moved to a new port):

```toml
[mcp_servers.ccpanes]
bearer_token_env_var = "CC_PANES_API_TOKEN"
url = "http://127.0.0.1:<stale-port>/mcp?token=<redacted>"
```

CC-Panes injects `-c mcp_servers.ccpanes.url=<current>` per launch, but Codex's dotted `-c`
override only replaces `.url` — the pre-existing `.bearer_token_env_var` survives the merge, so
Codex still requires `CC_PANES_API_TOKEN` and fails startup when it is not set. The orchestrator
already accepts the `?token=` query param (`orchestrator_service.rs` auth middleware), so
`bearer_token_env_var` is both redundant and the failure trigger.

### P0a — Migrate stale global Codex ccpanes config (`cc-cli-adapters/src/codex.rs`)

- Before Codex launch, open `CODEX_HOME/config.toml` when `CODEX_HOME` is set, else
  `~/.codex/config.toml` (reuse `real_codex_home()`).
- Remove `[mcp_servers.ccpanes]` **only when it matches the CC-Panes signature**:
  - `url` host is loopback / `localhost`, path starts with `/mcp`, query contains `token=`; **or**
  - `bearer_token_env_var == "CC_PANES_API_TOKEN"`.
- Never remove a user-authored `ccpanes` server that does not match the signature.
- Use `toml_edit` (new dependency) for a surgical removal that preserves comments and formatting;
  write a `.bak` backup first; write via same-directory temp file + rename; log the migration
  without printing tokens.
- Invoke it from the Codex pre-launch config step (next to where the adapter already reads/writes
  project `config.toml`).

### P0b — Stop injecting `bearer_token_env_var` for ccpanes

- In `cc-cli-adapters/src/codex.rs` `push_mcp_overrides` and the WSL path
  `cc-panes-core/src/services/terminal_service/wsl_codex.rs`, drop the
  `mcp_servers.ccpanes.bearer_token_env_var` override. Keep `.url` (which carries `?token=`) and
  `.enabled=true`.
- P0b alone does not rescue existing users because the old global `bearer_token_env_var` still
  merges in — it must ship together with P0a.

### Secondary — Claude global cleanup (`cc-cli-adapters/src/claude.rs`)

- In `generate_mcp_config`, when merging `~/.claude.json` mcpServers, skip `name == "ccpanes"`
  (CC-Panes writes its own, which would override) and legacy `ccpanes-fixed` / any entry whose
  command references `ccpanes-proxy` (a dead stdio proxy: the `.mjs` file does not exist and no
  CC-Panes version ever generated it). Also actively strip that legacy entry from `~/.claude.json`
  (mirroring `cleanup_legacy_python_scripts`), removing only the clearly-legacy shape.

### Follow-ups (not in this change)

P1 hook-endpoint fallback unification (`events/dispatch.rs`, `common/http.rs`, `plan_archive.rs`),
P1 manifest selection by reachability + newest mtime, P1 WSL host rewrite for fallback paths, and
P2 conservative daemon orphan-session reaper defaults — as described in Recommended Fix Plan.

Root cause 1 (daemon-side `healthy_orchestrator_info` manifest fallback), root cause 1b
(orchestrator → `TerminalBackendState` migration), and the P1 items are specified in the next
section and land through this document as well.

### Immediate manual recovery

Delete `[mcp_servers.ccpanes]` from `~/.codex/config.toml` and `ccpanes-fixed` from
`~/.claude.json`, restart CC-Panes, then open a fresh Codex/Claude session (do not resume a
session whose MCP client already failed at startup).

## Implementation Plan (Daemon injection + orchestrator backend + P1)

This section covers root cause 1, root cause 1b, and the P1 follow-ups. It was peer-reviewed by an
independent WSL Codex instance (gpt-5.5, read-only) against the actual code; review resolutions:
manifest-first over cache confirmed, dead endpoints are skipped but the manifest is never deleted,
opencode is not part of acceptance (it benefits automatically via the same convergence point), and
the four reviewer-mandated regression tests below are all adopted.

### Fix 1 — daemon-side lazy manifest read (`healthy_orchestrator_info`)

All three injection paths (local env, Claude `--mcp-config`, WSL env) converge on the single
`healthy_orchestrator_info()` call at `terminal_service.rs:1443`; fixing that one function fixes
all of them, for every CLI adapter.

1. **New shared parser** — `cc-panes-core/src/utils/orchestrator_manifest.rs`:
   `read_endpoint(data_dir) -> Option<(u16, String)>` and `parse_endpoint(content)`. The parsing
   logic moves from `src-tauri/src/services/orchestrator_service.rs:551-576`, and the existing
   malformed/url/Authorization unit tests move with it. Export from `utils/mod.rs`. The core crate
   reading this file does not break layering: the file lives under `data_dir`, has a stable format,
   and already has an out-of-process reader (cli-hook).
2. **Rewrite `healthy_orchestrator_info`** (`terminal_service.rs:2956-2975`): candidate order is
   manifest (from `self.app_paths.data_dir()`) then in-memory cache (deduped); probe each with
   `local_orchestrator_endpoint_reachable`; first success is backfilled into the cache and returned
   (log `source=manifest|cache`); if none are reachable, clear the cache and return `None` — never
   delete the manifest file (it carries the orchestrator's port-reuse-across-restarts semantics).
   Manifest-first (not cache-first) is deliberate: it is immune to same-port-token-rotation and to
   a dead port being reused by an unrelated process.
3. **src-tauri dedup** — `orchestrator_service.rs` drops its private parsing functions and calls
   the core module (both at startup port-reuse and anywhere else), so writer and readers cannot
   drift. Keep the `set_orchestrator_info` fast path at `lib.rs:1662`.
4. **Daemon: zero changes** — the daemon's `TerminalService` already holds the right `app_paths`
   (Tauri passes `--data-dir`), so it picks the fix up automatically.
5. **Tests** (using the `terminal_service_for_test` pattern near `terminal_service.rs:3320`):
   - `falls_back_to_manifest`: no `set_orchestrator_info`, manifest points at a live
     `TcpListener` → returns `Some`, cache backfilled.
   - `prefers_fresh_manifest_over_stale_cache`: cache → dead port, manifest → live port.
   - Same-port token rotation: cache has old token, manifest has new token, port reachable →
     asserts the manifest token wins (reviewer-mandated).
   - WSL regression (`terminal_service/wsl_codex.rs` level): manifest-only scenario asserts
     `CC_PANES_API_PORT/TOKEN/BASE_URL` reach the WSL MCP config / launch script
     (reviewer-mandated).
   - Codex adapter regression (`cc-cli-adapters/src/codex.rs` level): manifest-only endpoint
     asserts launch args contain the `mcp_servers.ccpanes.url` override — aligned with P0b's
     no-`bearer_token_env_var` shape (reviewer-mandated).

### Fix 1b — orchestrator goes through `TerminalBackend`

The `TerminalBackend` trait (`cc-panes-core/src/services/terminal_backend.rs:16`) already covers
create/write/submit/resize/kill/get_all_status/get_session_status/get_session_output/snapshot with
three implementations (in-process, `InProcessTerminalBackend`, `DaemonTerminalBackend` over
blocking HTTP). The Tauri command layer already routes through `TerminalBackendState`; the
orchestrator is the remaining direct `Arc<TerminalService>` consumer.

1. **Trait gap: `extra_env`** — `CreateSessionRequest` (`cc-panes-core/src/models/terminal.rs:50`)
   gains `#[serde(default, skip_serializing_if = "Option::is_none")] pub extra_env:
   Option<HashMap<String, String>>`; the `TerminalService` impl passes it through
   (`terminal_backend.rs:75`); daemon `PartialCreateSessionRequest`/normalize
   (`cc-panes-daemon/src/server.rs:208/:361`) forwards it. Serde default keeps the wire protocol
   backward compatible.
2. **`AppState` evolution** (`orchestrator_service.rs:361`): add
   `terminal_backend: Arc<TerminalBackendState>` — resolve `.backend()` per call so runtime
   daemon/in-process switching keeps working; **rename** `terminal_service` to
   `local_terminal_service` so the compiler surfaces all 30+ old usages for explicit triage. The
   local service remains only for `cli_registry()`, the `find_session_id_by_launch_id` fast path
   (miss falls back to launch history, which already works in daemon mode), and the hook status
   listener. `OrchestratorService::start` (`:669`) gains the parameter; `lib.rs:1634` passes
   `app.state::<Arc<TerminalBackendState>>()`.
3. **Session-level calls switch to the backend**: MCP tools (launch_task create `:3111`, write
   `:4217`, submit `:4256`, status `:4281`, list `:4299`, kill `:4321`, output `:4377`), REST
   handlers (`:6030/:6427/:6471/:6525/:6586/:6628`), `collect_plan_live_sessions` (`:5331`),
   `refresh_task_status` (`:7338`, takes `&dyn TerminalBackend`). Async boundary: keep existing
   `spawn_blocking` for write/submit, wrap `create_session`, add a small `backend_call` helper for
   short queries; the trait stays sync.
4. **Leader/worker report chain**: leader-busy gating (`:7714`, `enqueue_and_recheck` `:7612`)
   reads `state.session_state_machine.snapshot()` first (hook truth lives in the Tauri process),
   falling back to backend `get_session_status`; `:7818` submits via the backend helper.
5. **`RunnerTerminal` stays** (it is a deliberately narrow test seam; `FakeTerminal` and all runner
   coordinator tests are untouched): drop `impl RunnerTerminal for Arc<TerminalService>` (`:5143`),
   add `impl RunnerTerminal for TerminalBackendState` whose `create_shell_session` builds
   `CreateSessionRequest { extra_env: Some(profile.env), skip_mcp: true, .. }`; `:5214` passes the
   backend state.
6. **Phase 2 (may ship separately)**: trait gains a default no-op `apply_hook_status` plus a daemon
   `POST /api/sessions/:id/hook-status` endpoint; the listener double-writes so daemon-side session
   status agrees with hooks. Optionally move `find_session_id_by_launch_id` into the trait.

### P1 items (as specified in Recommended Fix Plan, now in scope)

- **Hook endpoint fallback unification**: `ApiEndpoint::resolve()` wraps
  `common::orchestrator::resolve_api_endpoint()`; used by `events/dispatch.rs`,
  `common/http.rs`, `notify.rs`, `plan_archive.rs`.
- **Manifest selection**: `CC_PANES_DATA_DIR` first; else inspect both `.cc-panes` and
  `.cc-panes-dev`; prefer reachable; else newest mtime. Reuse the Fix 1 core parser if cli-hook can
  depend on cc-panes-core; otherwise keep a format-aligned local copy.
- **WSL host rewrite for fallback paths**: reuse the formal WSL launch host-resolution logic when
  running inside WSL; fail explicitly when no reachable endpoint can be produced.

### Verification (this section's scope)

1. `cargo test --workspace`, `cargo clippy --workspace -- -D warnings`, `cargo fmt --all -- --check`.
2. Fix 1: daemon-mode Claude session's process command line contains
   `--mcp-config .../mcp-<session>.json`; `/mcp` inside the session lists ccpanes; WSL session has
   all three `CC_PANES_API_*` vars; kill Tauri (daemon survives) → restart Tauri (endpoint may
   change) → new session injects the new endpoint.
3. Fix 1b: with 3 UI sessions open, MCP `list_sessions` matches `list_panes`;
   `get_session_status/submit/kill/get_session_output` work against daemon sessions; a
   `launch_task` worker's `report_to_leader` produces the `[worker-report]` line in the leader PTY
   (queued + redelivered when the leader is busy); a RunnerProfile with env vars reaches the daemon
   session (extra_env regression); toggling daemon mode off does not regress in-process mode, and a
   live `try_enable_daemon` switch is picked up immediately (per-call backend resolution).
4. P1: with env removed and only a valid manifest present, `session_start`, `events/dispatch`,
   `notify`, and `plan_archive` resolve the same endpoint; with both dev and release manifests
   present, the reachable one wins.

### Out of scope

- opencode acceptance testing (benefits automatically via the shared convergence point).
- A daemon running inside WSL probing `127.0.0.1`: pre-existing limitation, unchanged here.
- The uncommitted daemon orphan-session reaper: review its defaults per P2 while touching these
  files, but its changes are not part of this plan.

## Verification Checklist

### Codex config migration

- Global stale `mcp_servers.ccpanes` is removed when it matches CC-Panes signature.
- Non-CC-Panes user MCP config is preserved.
- Comments and unrelated config survive.
- Tokens are not logged.
- A backup is written.

### Codex launch

- With stale global config present, a CC-Panes-managed Codex launch does not report missing `CC_PANES_API_TOKEN`.
- `codex mcp get ccpanes` in a temporary `CODEX_HOME` does not show inherited `bearer_token_env_var` after migration.
- Local and WSL Codex both receive the correct ccpanes URL.

### Hook fallback

- `session_start`, `events/dispatch`, `notify`, and `plan_archive` all resolve the same endpoint source.
- Missing env with valid `mcp-orchestrator.json` succeeds.
- Missing env with no valid manifest fails fast and logs a useful non-secret error.

### Orchestrator endpoint

- Restart reuses persisted port/token when available.
- If the persisted port is occupied, fallback to a dynamic port updates `mcp-orchestrator.json`.
- Dev and release manifests do not confuse hook fallback.

## Short-Term Manual Recovery

Until the migration lands, the practical recovery is:

1. Remove or disable `[mcp_servers.ccpanes]` from `~/.codex/config.toml`.
2. Restart CC-Panes.
3. Open a fresh Codex session from CC-Panes.

Do not try to salvage a session whose MCP client already failed during startup; Codex initializes MCP clients at session start.

---

## 代码审阅与修复（2026-07 未提交实现的复审）

对 docs/18 未提交实现（P0 + Fix 1/1b + P1/P2）做了 3 路并行 code-review（correctness / cleanup / conventions），去重+验证后 10 条发现。已修复的：

| # | 位置 | 问题 | 修复 |
|---|------|------|------|
| 1 | `cc-cli-adapters/src/claude.rs` cleanup | 非原子 `fs::write` 重写 `~/.claude.json`（存 Claude 全部全局态），无备份，崩溃/断电即截断 | 改前写 `.ccpanes.bak` 备份 + 走新 `fs_atomic::write_atomic`（temp+fsync+带重试 rename） |
| 3 | `cc-panes-core/.../terminal_service.rs` `local_orchestrator_endpoint_reachable` | 可达性只做裸 TCP connect；orchestrator 端口被无关进程回收后会误判可达，把真实 token 注入陌生进程 | 改为对 `/api/health` 发最小 HTTP 请求，校验返回体是本 orchestrator 独有的 `{"status":"ok"}` |
| 4 | `cc-panes-core/src/utils/atomic_file.rs` | `write_atomic` 只 write+rename，不 fsync；断电后目标可能 0 字节 → 设置回落默认 | rename 前 `File::sync_all()` 落盘 |
| 6 | `cc-panes-cli-hook/src/common/orchestrator.rs` `resolve_api_endpoint` | env 端点优先且不探活 → 老会话 stale env 压过 live manifest；WSL 下 env 里 127.0.0.1 不可达（host 改写只在 manifest 路径） | env 先经 `adapt_candidate_for_current_host` + `endpoint_reachable` 探活，不可达再回退 manifest，最后才退回原始 env |
| 8 | `cc-cli-adapters/src/codex.rs` `write_file_via_temp_rename` | Windows remove-then-rename 第二步失败则 `config.toml` 消失，无自动恢复；且与 atomic_file 重复实现 | 下沉到共享 `fs_atomic::write_atomic`（带重试缩短窗口），消除重复 |
| 10 | `cc-panes-daemon/src/session_reaper.rs` | select 快照与 kill 之间会话被重新附着仍被杀（TOCTOU） | kill 前用实时 `has_active_subscriber` + 最新活动时间复检 |
| **2** | `orchestrator_service.rs:3246`/`:762`（Fix 1b 回归） | daemon 模式下 `find_session_id_by_launch_id`/`apply_hook_status` 查/写空的 `local_terminal_service`，会话建在 daemon → 父子链错挂、hook 细分状态回写落空 | **扩 daemon 协议**：`TerminalBackend` trait 加 `find_session_id_by_launch_id`/`apply_hook_status`（默认 None/no-op，真实后端覆盖）；daemon 新增 `GET /api/sessions-by-launch/{launch_id}` + `POST /api/sessions/{id}/hook-status`；`TerminalDaemonClient` 加对应方法（404 容忍）；orchestrator 两处调用点改走 `terminal_backend.backend()`。状态回写打到 daemon 后经 `TerminalDaemonEventBridge.poll_status`（轮询 `get_session_status`）自动冒泡到桌面前端，无需改 daemon WsEmitter |

新增共享模块 `cc-cli-adapters/src/fs_atomic.rs`（claude/codex 共用）；给 `terminal_service.rs` 的 4 个 reachability 单测补了 `/api/health` 测试监听器；给 `daemon_client.rs`/`server.rs` 补了新端点单测。`cargo test`（cc-panes 169 + core 652 + daemon + web 86）/`clippy -D warnings`/`fmt` 全绿。

**审阅认定无需改动的：** `unwrap_or(true)`（`self_check.rs:72`）是故障安全方向——查询出错时宁可多留一个 daemon 30s（下轮自愈）也不误杀活会话，改成 `false` 反而危险。

**WSL NAT 可达性（后续补齐，让四场景全通）：**
`resolve_reachable_wsl_windows_host`（`wsl_codex.rs`）原是返回 `127.0.0.1` 的桩——mirrored 网络可用，但 WSL2 默认的 NAT 网络下 WSL 内 127.0.0.1 够不到宿主，注入的 MCP URL 不可达。现改为**从 WSL 内部探活**：候选 `127.0.0.1`（mirrored）→ 默认网关 `ip route show default`（NAT 即宿主 vEthernet IP）→ `/etc/resolv.conf` nameserver，逐个对 orchestrator `/api/health` 发最小 HTTP 请求（`timeout 1` 逐候选兜底），命中本 orchestrator 独有的 `{"status":"ok"}` 即选该 host 重写注入 URL + `CC_PANES_API_BASE_URL`。探活脚本 base64 编码后经 `echo <b64> | base64 -d | bash -s <port>` 下发，规避 wsl.exe→bash 引号问题；探不到则回退 127.0.0.1（不比原来更坏）。结果：**Windows/Mac 本地 codex、WSL mirrored、WSL NAT 四种场景 ccpanes MCP 均可注入并连通**。

**遗留（未动）：**
- **#7**：P0a stale 配置迁移只清 Windows `~/.codex`，WSL Linux `~/.codex/config.toml` 的残留 `bearer_token_env_var` 未清——宜在 WSL 启动脚本内就地清理。
- **#9**：hook manifest 兜底在 `[.cc-panes, .cc-panes-dev]` 里取第一个可达，dev/release 并存且无 `CC_PANES_DATA_DIR` 时可能串味；缺可靠区分信号，暂接受。
