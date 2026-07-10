/**
 * 终端服务 - 与后端终端会话交互
 *
 * 使用单例监听器模式：全局仅注册一次 terminal-output / terminal-exit 事件监听，
 * 通过 Map<sessionId, callback> 按 sessionId 分发回调。
 * Map.set 的覆盖语义确保同一 sessionId 永远只有一个回调，杜绝输出翻倍。
 */

import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type {
  CreateSessionRequest,
  ResizeRequest,
  EnvironmentInfo,
  ShellInfo,
  TerminalStatusInfo,
  TerminalSessionOutput,
} from "@/types";
import type { EnvironmentInfoRaw } from "@/types/settings";
import { usageStatsService } from "./usageStatsService";
import { devDebugLog } from "@/utils/devLogger";
import { apiDelete, apiGet, apiJson, invokeOrApi, isTauriRuntime } from "./apiClient";

export interface TerminalReplaySnapshot {
  data: string;
  bufferMode: "normal" | "alternate";
}

export type TerminalWriteSource = "user-keyboard" | "mcp" | "system";

export interface TerminalWriteOptions {
  source?: TerminalWriteSource;
  traceId?: number;
}

function summarizeTerminalInput(data: string): Record<string, unknown> {
  const chars = Array.from(data);
  return {
    text: chars.length > 24 ? `${chars.slice(0, 24).join("")}...` : data,
    length: chars.length,
    utf16Length: data.length,
    codePoints: chars.slice(0, 24).map((char) => char.codePointAt(0)?.toString(16) ?? ""),
    truncated: chars.length > 24,
  };
}

/** 将 Rust 返回的 cliTools 数组规范化为含向后兼容字段的 EnvironmentInfo */
function normalizeEnvironmentInfo(raw: EnvironmentInfoRaw): EnvironmentInfo {
  const findTool = (id: string) => {
    const tool = raw.cliTools?.find((t) => t.id === id);
    return {
      installed: tool?.installed ?? false,
      version: tool?.version ?? null,
    };
  };
  return {
    ...raw,
    cliTools: raw.cliTools ?? [],
    claude: findTool("claude"),
    codex: findTool("codex"),
  };
}

const TERMINAL_SERVICE_DEBUG = import.meta.env.DEV;

function debugTerminalService(event: string, payload: Record<string, unknown>): void {
  if (!TERMINAL_SERVICE_DEBUG) return;
  devDebugLog("terminal-service-debug", event, payload);
}

function countTerminalInputChars(data: string): number {
  const withoutAnsi = data.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  let count = 0;
  for (const char of withoutAnsi) {
    const code = char.codePointAt(0) ?? 0;
    if (char === "\t" || (code >= 0x20 && code !== 0x7f)) {
      count += 1;
    }
  }
  return count;
}

function assertCreateSessionRequest(
  request: CreateSessionRequest | null | undefined,
): asserts request is CreateSessionRequest {
  if (!request || typeof request !== "object") {
    throw new Error("create_terminal_session requires a non-null request");
  }
}

function compactCreateSessionRequest(request: CreateSessionRequest): CreateSessionRequest {
  return Object.fromEntries(
    Object.entries(request).filter(([, value]) => value !== null && value !== undefined),
  ) as CreateSessionRequest;
}

// ── 模块级状态：单例监听器 ──────────────────────────────────

const outputCallbacks = new Map<string, (data: string) => void>();
const exitCallbacks = new Map<string, (exitCode: number) => void>();
const pendingBuffers = new Map<string, string[]>();
const webSockets = new Map<string, WebSocket>();
const inputQueues = new Map<string, TerminalInputQueue>();
/** 已 kill 的 session ID 集合，用于事件监听器跳过已死 session */
export const killedSessions = new Set<string>();
const MAX_PENDING_CHUNKS = 1000;
const INPUT_BATCH_DELAY_MS = 8;
let listenersInitialized = false;
let unlistenOutput: UnlistenFn | null = null;
let unlistenExit: UnlistenFn | null = null;
let unlistenKilled: UnlistenFn | null = null;

interface QueuedTerminalInput {
  data: string;
  traceId?: number;
  resolve: () => void;
  reject: (error: unknown) => void;
}

interface TerminalInputQueue {
  pending: QueuedTerminalInput[];
  timer: ReturnType<typeof setTimeout> | null;
  flushing: boolean;
  idleResolvers: Array<() => void>;
}

function enqueueTerminalInput(sessionId: string, data: string, traceId?: number): Promise<void> {
  if (data.length === 0) return Promise.resolve();

  let queue = inputQueues.get(sessionId);
  if (!queue) {
    queue = {
      pending: [],
      timer: null,
      flushing: false,
      idleResolvers: [],
    };
    inputQueues.set(sessionId, queue);
  }

  const result = new Promise<void>((resolve, reject) => {
    queue.pending.push({ data, traceId, resolve, reject });
    debugTerminalService("input.queue.enqueue", {
      sessionId,
      traceId: traceId ?? null,
      pendingChunks: queue.pending.length,
      flushing: queue.flushing,
      data: summarizeTerminalInput(data),
    });
  });

  if (!queue.timer && !queue.flushing) {
    queue.timer = setTimeout(() => void flushTerminalInputQueue(sessionId), INPUT_BATCH_DELAY_MS);
  }

  return result;
}

async function flushTerminalInputQueue(sessionId: string): Promise<void> {
  const queue = inputQueues.get(sessionId);
  if (!queue) return;
  if (queue.flushing) return;
  queue.timer = null;
  if (queue.pending.length === 0) return;

  const batch = queue.pending.splice(0);
  const data = batch.map((item) => item.data).join("");
  const traceIds = batch.map((item) => item.traceId ?? null);
  queue.flushing = true;
  debugTerminalService("input.queue.flush.begin", {
    sessionId,
    traceIds,
    chunkCount: batch.length,
    data: summarizeTerminalInput(data),
  });
  try {
    await writeTerminalInputNow(sessionId, data);
    debugTerminalService("input.queue.flush.ok", {
      sessionId,
      traceIds,
      data: summarizeTerminalInput(data),
    });
    for (const item of batch) item.resolve();
  } catch (error) {
    debugTerminalService("input.queue.flush.error", {
      sessionId,
      traceIds,
      error: error instanceof Error ? error.message : String(error),
      data: summarizeTerminalInput(data),
    });
    for (const item of batch) item.reject(error);
  } finally {
    const current = inputQueues.get(sessionId);
    if (current !== queue) return;
    queue.flushing = false;
    if (queue.pending.length > 0) {
      queue.timer = setTimeout(() => void flushTerminalInputQueue(sessionId), 0);
    } else {
      const resolvers = queue.idleResolvers.splice(0);
      for (const resolve of resolvers) resolve();
      inputQueues.delete(sessionId);
    }
  }
}

function drainTerminalInputQueue(sessionId: string): Promise<void> {
  const queue = inputQueues.get(sessionId);
  if (!queue) return Promise.resolve();
  if (queue.timer) {
    clearTimeout(queue.timer);
    queue.timer = null;
    void flushTerminalInputQueue(sessionId);
  }
  if (!queue.flushing && queue.pending.length === 0) {
    inputQueues.delete(sessionId);
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    queue.idleResolvers.push(resolve);
  });
}

function clearTerminalInputQueue(sessionId: string): void {
  const queue = inputQueues.get(sessionId);
  if (!queue) return;
  if (queue.timer) {
    clearTimeout(queue.timer);
  }
  for (const item of queue.pending.splice(0)) {
    debugTerminalService("input.queue.clear", {
      sessionId,
      traceId: item.traceId ?? null,
      data: summarizeTerminalInput(item.data),
    });
    item.resolve();
  }
  for (const resolve of queue.idleResolvers.splice(0)) resolve();
  inputQueues.delete(sessionId);
}

function writeTerminalInputNow(sessionId: string, data: string): Promise<void> {
  debugTerminalService("input.ipc.write.begin", {
    sessionId,
    data: summarizeTerminalInput(data),
  });
  return invokeOrApi<void>("write_terminal", { sessionId, data }, () =>
    apiJson<void>(`/api/sessions/${encodeURIComponent(sessionId)}/write`, "POST", { data }),
  );
}

/**
 * 惰性初始化：首次调用时注册两个全局 listener，生命周期与应用一致。
 * 导出供 TerminalView 在 createSession 之前提前调用，缩小事件丢失窗口。
 */
export async function ensureListeners(): Promise<void> {
  if (listenersInitialized) return;
  listenersInitialized = true;
  debugTerminalService("listeners.init", {});

  if (!isTauriRuntime()) return;

  const webviewWindow = getCurrentWebview();

  unlistenOutput = await webviewWindow.listen<{ sessionId: string; data: string }>(
    "terminal-output",
    (event) => {
      const { sessionId, data } = event.payload;
      if (killedSessions.has(sessionId)) return;
      const cb = outputCallbacks.get(sessionId);
      if (cb) {
        cb(data);
      } else {
        // 回调未注册 — 缓冲等待 flush
        debugTerminalService("output.buffered", {
          sessionId,
          dataLength: data.length,
          pendingChunks: pendingBuffers.get(sessionId)?.length ?? 0,
        });
        const buf = pendingBuffers.get(sessionId);
        if (buf) {
          if (buf.length >= MAX_PENDING_CHUNKS) {
            buf.splice(0, buf.length - MAX_PENDING_CHUNKS / 2);
          }
          buf.push(data);
        } else {
          pendingBuffers.set(sessionId, [data]);
        }
      }
    }
  );

  unlistenExit = await webviewWindow.listen<{ sessionId: string; exitCode: number }>(
    "terminal-exit",
    (event) => {
      if (killedSessions.has(event.payload.sessionId)) return;
      const cb = exitCallbacks.get(event.payload.sessionId);
      cb?.(event.payload.exitCode);
    }
  );

  // MCP kill_session 场景：后端主动通知前端关闭标签
  unlistenKilled = await webviewWindow.listen<{ sessionId: string }>(
    "session-killed",
    async (event) => {
      const { sessionId } = event.payload;
      // 前端主动 kill 的已经自己关了标签，跳过
      if (killedSessions.has(sessionId)) return;
      // MCP kill：延迟 import 避免循环依赖
      const { usePanesStore } = await import("@/stores/usePanesStore");
      usePanesStore.getState().closeTabBySessionId(sessionId);
    }
  );
}

// ── HMR 清理（开发模式） ──────────────────────────────────

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unlistenOutput?.();
    unlistenExit?.();
    unlistenKilled?.();
    unlistenOutput = null;
    unlistenExit = null;
    unlistenKilled = null;
    listenersInitialized = false;
    outputCallbacks.clear();
    exitCallbacks.clear();
    pendingBuffers.clear();
    for (const sessionId of Array.from(inputQueues.keys())) clearTerminalInputQueue(sessionId);
    killedSessions.clear();
    for (const socket of webSockets.values()) socket.close();
    webSockets.clear();
  });
}

// ── 测试辅助 ──────────────────────────────────────────────

/** 仅用于测试：重置单例监听器状态 */
export function _resetListenersForTest(): void {
  outputCallbacks.clear();
  exitCallbacks.clear();
  pendingBuffers.clear();
  for (const sessionId of Array.from(inputQueues.keys())) clearTerminalInputQueue(sessionId);
  killedSessions.clear();
  listenersInitialized = false;
  unlistenOutput = null;
  unlistenExit = null;
  for (const socket of webSockets.values()) socket.close();
  webSockets.clear();
}

function ensureWebSocket(sessionId: string): void {
  if (isTauriRuntime() || killedSessions.has(sessionId)) return;
  const existing = webSockets.get(sessionId);
  if (
    existing &&
    (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${window.location.host}/ws/${encodeURIComponent(sessionId)}`;
  const socket = new WebSocket(url);
  webSockets.set(sessionId, socket);

  socket.onmessage = (event) => {
    if (killedSessions.has(sessionId)) return;
    const data = parseWebSocketOutput(event.data);
    if (!data) return;
    const cb = outputCallbacks.get(sessionId);
    if (cb) {
      cb(data);
      return;
    }
    const buf = pendingBuffers.get(sessionId);
    if (buf) {
      if (buf.length >= MAX_PENDING_CHUNKS) {
        buf.splice(0, buf.length - MAX_PENDING_CHUNKS / 2);
      }
      buf.push(data);
    } else {
      pendingBuffers.set(sessionId, [data]);
    }
  };

  socket.onclose = () => {
    webSockets.delete(sessionId);
    if (!killedSessions.has(sessionId)) {
      exitCallbacks.get(sessionId)?.(0);
    }
  };

  socket.onerror = (event) => {
    console.warn("[terminal-websocket] connection failed:", event);
  };
}

function closeWebSocket(sessionId: string): void {
  const socket = webSockets.get(sessionId);
  if (!socket) return;
  socket.close();
  webSockets.delete(sessionId);
}

function parseWebSocketOutput(message: unknown): string {
  if (typeof message !== "string") return "";
  try {
    const parsed = JSON.parse(message) as { type?: string; data?: unknown };
    if (parsed.type === "output" && typeof parsed.data === "string") {
      return parsed.data;
    }
  } catch {
    return message;
  }
  return message;
}

// ── 服务对象 ──────────────────────────────────────────────

export const terminalService = {
  /** 创建终端会话 */
  async createSession(request: CreateSessionRequest | null | undefined): Promise<string> {
    assertCreateSessionRequest(request);
    return invokeOrApi<string>(
      "create_terminal_session",
      { request: compactCreateSessionRequest(request) },
      async () => {
        const response = await apiJson<{ sessionId: string }>(
          "/api/sessions",
          "POST",
          compactCreateSessionRequest(request),
        );
        ensureWebSocket(response.sessionId);
        return response.sessionId;
      },
    );
  },

  /** 向终端写入数据 */
  async write(
    sessionId: string,
    data: string,
    options: TerminalWriteOptions = { source: "user-keyboard" },
  ): Promise<void> {
    const source = options.source ?? "user-keyboard";
    await enqueueTerminalInput(sessionId, data, options.traceId);
    if (source === "user-keyboard") {
      const charCount = countTerminalInputChars(data);
      void usageStatsService.recordInputChars(sessionId, charCount).catch((error) => {
        console.warn("Failed to record terminal input chars:", error);
      });
    }
  },

  /** 调整终端大小 */
  async resize(request: ResizeRequest): Promise<void> {
    return invokeOrApi<void>("resize_terminal", { request }, () =>
      apiJson<void>(`/api/sessions/${encodeURIComponent(request.sessionId)}/resize`, "POST", {
        cols: request.cols,
        rows: request.rows,
      }),
    );
  },

  /** 关闭终端会话 */
  async kill(sessionId: string): Promise<void> {
    return invokeOrApi<void>("kill_terminal", { sessionId }, () =>
      apiDelete(`/api/sessions/${encodeURIComponent(sessionId)}`),
    );
  },

  /** 幂等关闭终端会话：不存在或已退出也视为成功 */
  async killIdempotent(sessionId: string): Promise<void> {
    return invokeOrApi<void>("kill_terminal_idempotent", { sessionId }, async () => {
      await apiDelete(`/api/sessions/${encodeURIComponent(sessionId)}`).catch(() => {});
    });
  },

  /** 向会话提交文本并自动发送 Enter */
  async submitToSession(sessionId: string, text: string): Promise<void> {
    await drainTerminalInputQueue(sessionId);
    return invokeOrApi<void>("submit_to_session", { sessionId, text }, () =>
      apiJson<void>(`/api/sessions/${encodeURIComponent(sessionId)}/submit`, "POST", { text }),
    );
  },

  /** 读取最近 N 行纯文本输出 */
  async getRecentOutput(sessionId: string, lines = 200): Promise<TerminalSessionOutput> {
    return invokeOrApi<TerminalSessionOutput>(
      "get_terminal_recent_output",
      { sessionId, lines },
      () => apiGet<TerminalSessionOutput>(`/api/sessions/${encodeURIComponent(sessionId)}/output`, { lines }),
    );
  },

  async getAllStatus(): Promise<TerminalStatusInfo[]> {
    return invokeOrApi<TerminalStatusInfo[]>("get_all_terminal_status", undefined, () =>
      apiGet<TerminalStatusInfo[]>("/api/sessions"),
    );
  },

  async getReplaySnapshot(sessionId: string): Promise<TerminalReplaySnapshot | null> {
    return invokeOrApi<TerminalReplaySnapshot | null>(
      "get_terminal_replay_snapshot",
      { sessionId },
      async () => {
        try {
          return await apiGet<TerminalReplaySnapshot | null>(
            `/api/sessions/${encodeURIComponent(sessionId)}/snapshot`,
          );
        } catch {
          return null;
        }
      },
    );
  },

  // ── 断连 API（分屏重连用） ──────────────────────────────

  /** 断连：移除输出回调并清理 pendingBuffers，防止内存泄漏 */
  detachOutput(sessionId: string): void {
    debugTerminalService("callback.detach.output", {
      sessionId,
      hadCallback: outputCallbacks.has(sessionId),
      pendingChunks: pendingBuffers.get(sessionId)?.length ?? 0,
    });
    outputCallbacks.delete(sessionId);
    pendingBuffers.delete(sessionId);
    closeWebSocket(sessionId);
  },

  /** 断连：仅移除退出回调 */
  detachExit(sessionId: string): void {
    debugTerminalService("callback.detach.exit", {
      sessionId,
      hadCallback: exitCallbacks.has(sessionId),
    });
    exitCallbacks.delete(sessionId);
  },

  /** 完整终止 session：清除回调 + 缓冲 + 发送 kill IPC */
  async killSession(sessionId: string): Promise<void> {
    debugTerminalService("session.kill", {
      sessionId,
      hadOutputCallback: outputCallbacks.has(sessionId),
      hadExitCallback: exitCallbacks.has(sessionId),
      pendingChunks: pendingBuffers.get(sessionId)?.length ?? 0,
    });
    killedSessions.add(sessionId);
    outputCallbacks.delete(sessionId);
    exitCallbacks.delete(sessionId);
    pendingBuffers.delete(sessionId);
    clearTerminalInputQueue(sessionId);
    // 幂等关闭：reload cleanup 常杀已退/不存在的 session，用 idempotent 命令把
    // NOT_FOUND / already-exited 视为成功，避免 [UNHANDLED REJECTION] Session not found。
    closeWebSocket(sessionId);
    return invokeOrApi<void>("kill_terminal_idempotent", { sessionId }, async () => {
      await apiDelete(`/api/sessions/${encodeURIComponent(sessionId)}`).catch(() => {});
    });
  },

  // ── 单例监听器 API ─────────────────────────────────────

  /** 注册终端输出回调。Map.set 覆盖语义天然防重复。 */
  async registerOutput(
    sessionId: string,
    callback: (data: string) => void
  ): Promise<void> {
    await ensureListeners();
    ensureWebSocket(sessionId);
    debugTerminalService("callback.register.output", {
      sessionId,
      replacedExisting: outputCallbacks.has(sessionId),
      pendingChunks: pendingBuffers.get(sessionId)?.length ?? 0,
    });
    outputCallbacks.set(sessionId, callback);
    // Flush 缓冲的早期输出
    const buf = pendingBuffers.get(sessionId);
    if (buf) {
      debugTerminalService("callback.flush.output", {
        sessionId,
        chunkCount: buf.length,
      });
      pendingBuffers.delete(sessionId);
      for (const data of buf) {
        callback(data);
      }
    }
  },

  /** 注销终端输出回调 */
  unregisterOutput(sessionId: string): void {
    debugTerminalService("callback.unregister.output", {
      sessionId,
      hadCallback: outputCallbacks.has(sessionId),
      pendingChunks: pendingBuffers.get(sessionId)?.length ?? 0,
    });
    outputCallbacks.delete(sessionId);
    pendingBuffers.delete(sessionId);
  },

  /** 注册终端退出回调。Map.set 覆盖语义天然防重复。 */
  async registerExit(
    sessionId: string,
    callback: (exitCode: number) => void
  ): Promise<void> {
    await ensureListeners();
    ensureWebSocket(sessionId);
    debugTerminalService("callback.register.exit", {
      sessionId,
      replacedExisting: exitCallbacks.has(sessionId),
    });
    exitCallbacks.set(sessionId, callback);
  },

  /** 注销终端退出回调 */
  unregisterExit(sessionId: string): void {
    debugTerminalService("callback.unregister.exit", {
      sessionId,
      hadCallback: exitCallbacks.has(sessionId),
    });
    exitCallbacks.delete(sessionId);
  },

  /** 获取 Windows Build Number（用于 xterm.js windowsPty 配置） */
  async getWindowsBuildNumber(): Promise<number> {
    return invokeOrApi<number>("get_windows_build_number", undefined, async () => 0);
  },

  /** 获取本机可用 Shell 列表（Web 运行时无对应接口，返回空列表由 UI 降级为文本输入） */
  async getAvailableShells(): Promise<ShellInfo[]> {
    return invokeOrApi<ShellInfo[]>("get_available_shells", undefined, async () => []);
  },

  /** 检测开发环境（Node.js + CLI 工具） */
  async checkEnvironment(): Promise<EnvironmentInfo> {
    const raw = await invokeOrApi<EnvironmentInfoRaw>("check_environment", undefined, async () => ({
      node: { installed: false, version: null },
      cliTools: [],
    }));
    return normalizeEnvironmentInfo(raw);
  },
};
