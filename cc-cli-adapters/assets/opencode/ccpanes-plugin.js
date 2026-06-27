// CC-Panes opencode 插件 — 由 CC-Panes 自动安装/移除，请勿手动编辑。
//
// 在 opencode 会话生命周期事件里回调 CC-Panes orchestrator，使 opencode worker
// 参与 leader/worker 自动反馈（与 codex/claude 的 native hooks 等价）。
// 读取 PTY 注入的 CC_PANES_* 环境变量；非 CC-Panes 编排启动（缺 token/sessionId）
// 时静默跳过，不影响 opencode 正常使用。所有回调 best-effort，失败不影响会话。

const env = (k) => process.env[k] || undefined;

function apiBase() {
  const explicit = env("CC_PANES_API_BASE_URL");
  if (explicit) return explicit;
  const port = env("CC_PANES_API_PORT");
  return port ? `http://127.0.0.1:${port}` : undefined;
}

async function post(path, body) {
  const base = apiBase();
  const token = env("CC_PANES_API_TOKEN");
  if (!base || !token) return;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
  } catch {
    // best-effort：回调失败不影响会话
  }
}

function hookEvent(ccPaneEvent, payload) {
  const ptySessionId = env("CC_PANES_PTY_SESSION_ID");
  if (!ptySessionId) return;
  return post("/api/hook-event", {
    ccPaneEvent,
    ptySessionId,
    taskBindingId: env("CC_PANES_TASK_BINDING_ID"),
    payload: payload || {},
  });
}

async function reportSessionStarted(sessionId, directory) {
  const launchId = env("CC_PANES_LAUNCH_ID");
  const ptySessionId = env("CC_PANES_PTY_SESSION_ID");
  // session-started 各字段必填（resumeSessionId 用于回收 opencode 会话 id）
  if (!launchId || !ptySessionId || !sessionId) return;
  await post("/api/terminal/session-started", {
    launchId,
    ptySessionId,
    resumeSessionId: sessionId,
    cliTool: env("CC_PANES_CLI_TOOL") || "opencode",
    runtimeKind: env("CC_PANES_RUNTIME_KIND") || "local",
    wslDistro: env("CC_PANES_WSL_DISTRO"),
    cwd: directory,
  });
}

export const ccpanes = async ({ directory }) => {
  return {
    event: async ({ event }) => {
      const type = event && event.type;
      if (type === "session.created") {
        const props = event.properties || {};
        const sessionId = (props.info && props.info.id) || props.sessionID;
        await reportSessionStarted(sessionId, directory);
        await hookEvent("session-init");
      } else if (type === "session.idle") {
        await hookEvent("turn-end");
      } else if (type === "session.error") {
        await hookEvent("error");
      } else if (type === "session.deleted") {
        await hookEvent("session-end");
      }
    },
    "chat.message": async () => {
      await hookEvent("prompt-before");
    },
    "tool.execute.before": async (input) => {
      await hookEvent("tool-before", { tool: input && input.tool });
    },
    "tool.execute.after": async (input) => {
      await hookEvent("tool-after", { tool: input && input.tool });
    },
  };
};
