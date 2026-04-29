export const TERMINAL_INPUT_TRACE_STORAGE_KEY = "cc-panes:trace-terminal-input";

type TraceStorage = Pick<Storage, "getItem">;

export type TerminalInputTraceLogger = (
  event: string,
  payload?: Record<string, unknown>,
) => void;

export interface TerminalInputTraceController {
  enabled: boolean;
  dispose: () => void;
  onData: (data: string) => void;
}

interface TerminalInputTraceOptions {
  textarea?: HTMLTextAreaElement | null;
  isDev: boolean;
  isMac: boolean;
  logger: TerminalInputTraceLogger;
  storage?: TraceStorage | null;
}

export function isMacPlatform(platform: string | undefined): boolean {
  return /Mac|iPhone|iPad|iPod/.test(platform ?? "");
}

function getDefaultStorage(): TraceStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isTerminalInputTraceEnabled({
  isDev,
  isMac,
  storage = getDefaultStorage(),
}: {
  isDev: boolean;
  isMac: boolean;
  storage?: TraceStorage | null;
}): boolean {
  if (!isDev || !isMac || !storage) return false;
  try {
    const value = storage.getItem(TERMINAL_INPUT_TRACE_STORAGE_KEY);
    return value === "1" || value === "true";
  } catch {
    return false;
  }
}

export function summarizeTerminalInputData(value: string | null | undefined): Record<string, unknown> {
  if (value == null) {
    return {
      text: null,
      length: 0,
      codePoints: [],
    };
  }

  const chars = Array.from(value);
  return {
    text: chars.length > 16 ? `${chars.slice(0, 16).join("")}...` : value,
    length: chars.length,
    codePoints: chars.slice(0, 16).map((char) => char.codePointAt(0)?.toString(16) ?? ""),
    truncated: chars.length > 16,
  };
}

function keyboardPayload(event: KeyboardEvent, textarea: HTMLTextAreaElement): Record<string, unknown> {
  return {
    type: event.type,
    key: event.key,
    code: event.code,
    keyCode: event.keyCode,
    location: event.location,
    repeat: event.repeat,
    isComposing: event.isComposing,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    defaultPrevented: event.defaultPrevented,
    valueLength: textarea.value.length,
  };
}

function inputPayload(event: InputEvent, textarea: HTMLTextAreaElement): Record<string, unknown> {
  return {
    type: event.type,
    inputType: event.inputType,
    data: summarizeTerminalInputData(event.data),
    isComposing: event.isComposing,
    defaultPrevented: event.defaultPrevented,
    valueLength: textarea.value.length,
  };
}

function compositionPayload(event: CompositionEvent, textarea: HTMLTextAreaElement): Record<string, unknown> {
  return {
    type: event.type,
    data: summarizeTerminalInputData(event.data),
    defaultPrevented: event.defaultPrevented,
    valueLength: textarea.value.length,
  };
}

function noopController(): TerminalInputTraceController {
  return {
    enabled: false,
    dispose: () => {},
    onData: () => {},
  };
}

export function attachTerminalInputTrace(
  options: TerminalInputTraceOptions,
): TerminalInputTraceController {
  const { textarea, logger } = options;
  if (
    !textarea ||
    !isTerminalInputTraceEnabled({
      isDev: options.isDev,
      isMac: options.isMac,
      storage: options.storage,
    })
  ) {
    return noopController();
  }

  const cleanups: Array<() => void> = [];

  const addListener = <K extends keyof HTMLElementEventMap>(
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
  ) => {
    textarea.addEventListener(type, handler as EventListener, true);
    cleanups.push(() => textarea.removeEventListener(type, handler as EventListener, true));
  };

  addListener("keydown", (event) => {
    logger("input-trace.keydown", keyboardPayload(event as KeyboardEvent, textarea));
  });
  addListener("keypress", (event) => {
    logger("input-trace.keypress", keyboardPayload(event as KeyboardEvent, textarea));
  });
  addListener("beforeinput", (event) => {
    logger("input-trace.beforeinput", inputPayload(event as InputEvent, textarea));
  });
  addListener("input", (event) => {
    logger("input-trace.input", inputPayload(event as InputEvent, textarea));
  });
  addListener("compositionstart", (event) => {
    logger("input-trace.compositionstart", compositionPayload(event as CompositionEvent, textarea));
  });
  addListener("compositionupdate", (event) => {
    logger("input-trace.compositionupdate", compositionPayload(event as CompositionEvent, textarea));
  });
  addListener("compositionend", (event) => {
    logger("input-trace.compositionend", compositionPayload(event as CompositionEvent, textarea));
  });

  logger("input-trace.enabled", {
    valueLength: textarea.value.length,
  });

  return {
    enabled: true,
    dispose: () => {
      while (cleanups.length > 0) {
        cleanups.pop()?.();
      }
      logger("input-trace.disposed", {});
    },
    onData: (data: string) => {
      logger("input-trace.onData", {
        data: summarizeTerminalInputData(data),
      });
    },
  };
}
