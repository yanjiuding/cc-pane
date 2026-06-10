import { error as logError } from "@tauri-apps/plugin-log";
import { logService } from "@/services/logService";
import { errorToString } from "./errorUtils";

interface FrontendCrashLogInput {
  source: string;
  error: unknown;
  componentStack?: string;
  extra?: Record<string, unknown>;
}

export interface FrontendCrashLogResult {
  logDir: string | null;
  loggedAt: string;
  written: boolean;
}

function getRuntimeContext() {
  if (typeof window === "undefined") {
    return {
      url: "unknown",
      userAgent: "unknown",
    };
  }

  return {
    url: window.location.href,
    userAgent: window.navigator.userAgent,
  };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatFrontendCrashLog(input: FrontendCrashLogInput, loggedAt: string): string {
  const runtime = getRuntimeContext();
  const lines = [
    `[frontend-crash] ${input.source}`,
    `time=${loggedAt}`,
    `url=${runtime.url}`,
    `userAgent=${runtime.userAgent}`,
    `error=${errorToString(input.error)}`,
  ];

  if (input.componentStack?.trim()) {
    lines.push(`componentStack=${input.componentStack.trim()}`);
  }

  if (input.extra) {
    lines.push(`extra=${safeStringify(input.extra)}`);
  }

  return lines.join("\n");
}

export async function recordFrontendCrash(
  input: FrontendCrashLogInput,
): Promise<FrontendCrashLogResult> {
  const loggedAt = new Date().toISOString();
  const message = formatFrontendCrashLog(input, loggedAt);
  let written = true;

  try {
    await logError(message);
  } catch (error) {
    written = false;
    console.error("[frontend-crash] Failed to write crash log:", error);
  }

  let logDir: string | null = null;
  try {
    const resolvedLogDir = await logService.getLogDir();
    if (typeof resolvedLogDir === "string" && resolvedLogDir.trim()) {
      logDir = resolvedLogDir;
    }
  } catch (error) {
    console.error("[frontend-crash] Failed to resolve log dir:", error);
  }

  return { logDir, loggedAt, written };
}
