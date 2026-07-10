import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOrphanSessionReconciler } from "./useOrphanSessionReconciler";
import { usePanesStore } from "@/stores/usePanesStore";
import { terminalService } from "@/services/terminalService";
import { runnerService } from "@/services/runnerService";
import { taskBindingService } from "@/services/taskBindingService";
import { notificationService } from "@/services/notificationService";
import { isTauriRuntime } from "@/services/runtime";
import type { TerminalStatusInfo } from "@/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/stores/usePanesStore", () => ({
  usePanesStore: {
    getState: vi.fn(),
  },
}));

vi.mock("@/stores/useSelfChatStore", () => ({
  useSelfChatStore: {
    getState: vi.fn(() => ({ activeSession: null })),
  },
}));

vi.mock("@/services/terminalService", () => ({
  terminalService: {
    getAllStatus: vi.fn(),
    killSession: vi.fn(),
  },
}));

vi.mock("@/services/runnerService", () => ({
  runnerService: {
    listActiveInstances: vi.fn(),
  },
}));

vi.mock("@/services/taskBindingService", () => ({
  taskBindingService: {
    query: vi.fn(),
  },
}));

vi.mock("@/services/notificationService", () => ({
  notificationService: {
    trigger: vi.fn(),
  },
}));

vi.mock("@/services/runtime", () => ({
  isTauriRuntime: vi.fn(),
}));

vi.mock("@/utils", () => ({
  waitForTauri: vi.fn(async () => true),
}));

const FIRST_SWEEP_DELAY_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

function status(sessionId: string, ageMs: number): TerminalStatusInfo {
  const at = Date.now() - ageMs;
  return { sessionId, status: "idle", lastOutputAt: at, updatedAt: at };
}

describe("useOrphanSessionReconciler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(isTauriRuntime).mockReturnValue(true);
    vi.mocked(usePanesStore.getState).mockReturnValue({
      collectReferencedSessionIds: () => new Set<string>(),
    } as unknown as ReturnType<typeof usePanesStore.getState>);
    vi.mocked(terminalService.getAllStatus).mockReset().mockResolvedValue([]);
    vi.mocked(terminalService.killSession).mockReset().mockResolvedValue();
    vi.mocked(runnerService.listActiveInstances).mockReset().mockResolvedValue([]);
    vi.mocked(taskBindingService.query)
      .mockReset()
      .mockResolvedValue({ items: [], total: 0, hasMore: false });
    vi.mocked(notificationService.trigger)
      .mockReset()
      .mockResolvedValue({ sent: true, skipped: false, reason: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing outside the Tauri runtime", async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(false);
    renderHook(() => useOrphanSessionReconciler());

    await vi.advanceTimersByTimeAsync(FIRST_SWEEP_DELAY_MS + SWEEP_INTERVAL_MS);
    expect(terminalService.getAllStatus).not.toHaveBeenCalled();
  });

  it("waits for the first-sweep delay, then sweeps periodically", async () => {
    renderHook(() => useOrphanSessionReconciler());

    await vi.advanceTimersByTimeAsync(FIRST_SWEEP_DELAY_MS - 1);
    expect(terminalService.getAllStatus).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(terminalService.getAllStatus).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS);
    expect(terminalService.getAllStatus).toHaveBeenCalledTimes(2);
  });

  it("kills unreferenced stale sessions and sends one aggregated notification", async () => {
    vi.mocked(terminalService.getAllStatus).mockResolvedValue([
      status("orphan-1", 60 * 60 * 1000),
      status("orphan-2", 30 * 60 * 1000),
    ]);
    renderHook(() => useOrphanSessionReconciler());

    await vi.advanceTimersByTimeAsync(FIRST_SWEEP_DELAY_MS);

    expect(terminalService.killSession).toHaveBeenCalledWith("orphan-1");
    expect(terminalService.killSession).toHaveBeenCalledWith("orphan-2");
    expect(notificationService.trigger).toHaveBeenCalledTimes(1);
  });

  it("skips a session that gets claimed between select and kill (TOCTOU recheck)", async () => {
    vi.mocked(terminalService.getAllStatus).mockResolvedValue([
      status("claimed-later", 60 * 60 * 1000),
    ]);
    // 第一次收集（sweep 快照）为空，kill 前复查时已被 tab 认领
    vi.mocked(usePanesStore.getState)
      .mockReturnValueOnce({
        collectReferencedSessionIds: () => new Set<string>(),
      } as unknown as ReturnType<typeof usePanesStore.getState>)
      .mockReturnValue({
        collectReferencedSessionIds: () => new Set(["claimed-later"]),
      } as unknown as ReturnType<typeof usePanesStore.getState>);

    renderHook(() => useOrphanSessionReconciler());
    await vi.advanceTimersByTimeAsync(FIRST_SWEEP_DELAY_MS);

    expect(terminalService.killSession).not.toHaveBeenCalled();
    expect(notificationService.trigger).not.toHaveBeenCalled();
  });

  it("fails closed when a reference source query throws", async () => {
    vi.mocked(runnerService.listActiveInstances).mockRejectedValue(new Error("ipc down"));
    vi.mocked(terminalService.getAllStatus).mockResolvedValue([
      status("orphan", 60 * 60 * 1000),
    ]);
    renderHook(() => useOrphanSessionReconciler());

    await vi.advanceTimersByTimeAsync(FIRST_SWEEP_DELAY_MS);
    expect(terminalService.killSession).not.toHaveBeenCalled();
  });

  it("treats runner and task-binding sessions as referenced", async () => {
    vi.mocked(runnerService.listActiveInstances).mockResolvedValue([
      { sessionId: "runner-session" } as never,
    ]);
    vi.mocked(taskBindingService.query).mockResolvedValue({
      items: [{ sessionId: "worker-session" } as never],
      total: 1,
      hasMore: false,
    });
    vi.mocked(terminalService.getAllStatus).mockResolvedValue([
      status("runner-session", 60 * 60 * 1000),
      status("worker-session", 60 * 60 * 1000),
    ]);
    renderHook(() => useOrphanSessionReconciler());

    await vi.advanceTimersByTimeAsync(FIRST_SWEEP_DELAY_MS);
    expect(terminalService.killSession).not.toHaveBeenCalled();
  });
});
