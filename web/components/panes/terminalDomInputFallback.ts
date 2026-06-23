import { summarizeTerminalInputData, type TerminalInputTraceLogger } from "./terminalInputTrace";

const DEFAULT_FALLBACK_DELAY_MS = 32;
const DEFAULT_PENDING_TTL_MS = 250;
const DEFAULT_RECENT_XTERM_TTL_MS = 80;

interface PendingDomInput {
  id: number;
  data: string;
  confirmed: boolean;
  sawXtermData: boolean;
  fallbackTimer: ReturnType<typeof setTimeout> | null;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

interface RecentXtermData {
  data: string;
  expiresAt: number;
}

export interface TerminalDomInputFallbackOptions {
  textarea: HTMLTextAreaElement;
  onFallbackData: (data: string, traceId: number) => void;
  logger?: TerminalInputTraceLogger;
  nextTraceId?: () => number;
  now?: () => number;
  fallbackDelayMs?: number;
  pendingTtlMs?: number;
  recentXtermTtlMs?: number;
}

export interface TerminalDomInputFallbackController {
  dispose: () => void;
  recordXtermData: (data: string) => void;
}

function isPrintableSingleCodePoint(data: string): boolean {
  const chars = Array.from(data);
  if (chars.length !== 1) return false;
  const codePoint = chars[0].codePointAt(0) ?? 0;
  return codePoint >= 0x20 && codePoint !== 0x7f;
}

export function getDomTextInputFallbackData(event: InputEvent): string | null {
  if (
    event.inputType !== "insertText" ||
    event.isComposing ||
    typeof event.data !== "string" ||
    !isPrintableSingleCodePoint(event.data)
  ) {
    return null;
  }

  return event.data;
}

function consumePrefix(data: string, prefix: string): string | null {
  return data.startsWith(prefix) ? data.slice(prefix.length) : null;
}

export function attachTerminalDomInputFallback(
  options: TerminalDomInputFallbackOptions,
): TerminalDomInputFallbackController {
  const {
    textarea,
    onFallbackData,
    logger,
    nextTraceId = (() => 0),
    now = (() => performance.now()),
    fallbackDelayMs = DEFAULT_FALLBACK_DELAY_MS,
    pendingTtlMs = DEFAULT_PENDING_TTL_MS,
    recentXtermTtlMs = DEFAULT_RECENT_XTERM_TTL_MS,
  } = options;

  const pending: PendingDomInput[] = [];
  const recentXtermData: RecentXtermData[] = [];
  const log = (event: string, payload: Record<string, unknown> = {}) => {
    logger?.(`input.dom-fallback.${event}`, payload);
  };

  const clearPendingTimers = (item: PendingDomInput) => {
    if (item.fallbackTimer) {
      clearTimeout(item.fallbackTimer);
      item.fallbackTimer = null;
    }
    if (item.cleanupTimer) {
      clearTimeout(item.cleanupTimer);
      item.cleanupTimer = null;
    }
  };

  const removePending = (item: PendingDomInput) => {
    clearPendingTimers(item);
    const index = pending.indexOf(item);
    if (index >= 0) pending.splice(index, 1);
  };

  const pruneRecentXtermData = () => {
    const current = now();
    for (let i = recentXtermData.length - 1; i >= 0; i -= 1) {
      if (recentXtermData[i].expiresAt <= current) {
        recentXtermData.splice(i, 1);
      }
    }
  };

  const hasRecentXtermData = (data: string): boolean => {
    pruneRecentXtermData();
    const index = recentXtermData.findIndex((item) => item.data === data);
    if (index < 0) return false;
    recentXtermData.splice(index, 1);
    return true;
  };

  const markSeenByXterm = (item: PendingDomInput, source: "recent" | "onData") => {
    item.sawXtermData = true;
    if (item.confirmed) {
      log("skip.xterm-data", {
        fallbackId: item.id,
        source,
        data: summarizeTerminalInputData(item.data),
      });
      removePending(item);
    }
  };

  const scheduleCleanup = (item: PendingDomInput) => {
    if (item.cleanupTimer) clearTimeout(item.cleanupTimer);
    item.cleanupTimer = setTimeout(() => {
      log(item.confirmed ? "drop.confirmed-timeout" : "drop.unconfirmed", {
        fallbackId: item.id,
        data: summarizeTerminalInputData(item.data),
        sawXtermData: item.sawXtermData,
      });
      removePending(item);
    }, pendingTtlMs);
  };

  const scheduleFallback = (item: PendingDomInput) => {
    item.confirmed = true;
    if (item.sawXtermData) {
      log("skip.confirmed-after-xterm", {
        fallbackId: item.id,
        data: summarizeTerminalInputData(item.data),
      });
      removePending(item);
      return;
    }

    if (item.fallbackTimer) clearTimeout(item.fallbackTimer);
    item.fallbackTimer = setTimeout(() => {
      log("forward", {
        fallbackId: item.id,
        data: summarizeTerminalInputData(item.data),
      });
      onFallbackData(item.data, item.id);
      removePending(item);
    }, fallbackDelayMs);
  };

  const createPending = (data: string, confirmed: boolean, source: "beforeinput" | "input") => {
    const item: PendingDomInput = {
      id: nextTraceId(),
      data,
      confirmed: false,
      sawXtermData: false,
      fallbackTimer: null,
      cleanupTimer: null,
    };
    pending.push(item);
    log("candidate", {
      fallbackId: item.id,
      source,
      data: summarizeTerminalInputData(data),
    });

    if (hasRecentXtermData(data)) {
      markSeenByXterm(item, "recent");
    }

    if (confirmed) {
      scheduleFallback(item);
    } else {
      scheduleCleanup(item);
    }
    return item;
  };

  const findPending = (data: string): PendingDomInput | null => {
    return pending.find((item) => item.data === data && !item.confirmed) ?? null;
  };

  const handleBeforeInput = (event: Event) => {
    if (event.target !== textarea) return;
    const data = getDomTextInputFallbackData(event as InputEvent);
    if (!data) return;
    createPending(data, false, "beforeinput");
  };

  const handleInput = (event: Event) => {
    if (event.target !== textarea) return;
    const data = getDomTextInputFallbackData(event as InputEvent);
    if (!data) return;

    const item = findPending(data);
    if (item) {
      scheduleFallback(item);
      return;
    }

    createPending(data, true, "input");
  };

  textarea.addEventListener("beforeinput", handleBeforeInput, true);
  textarea.addEventListener("input", handleInput, true);

  return {
    dispose: () => {
      textarea.removeEventListener("beforeinput", handleBeforeInput, true);
      textarea.removeEventListener("input", handleInput, true);
      while (pending.length > 0) {
        removePending(pending[0]);
      }
      recentXtermData.splice(0);
      log("disposed", {});
    },
    recordXtermData: (data: string) => {
      pruneRecentXtermData();
      recentXtermData.push({
        data,
        expiresAt: now() + recentXtermTtlMs,
      });

      let remaining = data;
      for (const item of [...pending]) {
        const next = consumePrefix(remaining, item.data);
        if (next === null) continue;
        remaining = next;
        markSeenByXterm(item, "onData");
      }
    },
  };
}
