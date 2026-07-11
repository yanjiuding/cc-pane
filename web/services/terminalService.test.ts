import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { _resetListenersForTest, terminalService } from "./terminalService";
import { mockTauriInvoke, resetTauriInvoke } from "@/test/utils/mockTauriInvoke";

describe("terminalService", () => {
  beforeEach(() => {
    resetTauriInvoke();
    _resetListenersForTest();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    _resetListenersForTest();
  });

  describe("session-killed reason 分流", () => {
    type KilledHandler = (event: {
      payload: { sessionId: string; reason?: string };
    }) => Promise<void> | void;

    async function registerKilledListenerAndSession(sessionId: string) {
      mockTauriInvoke({});
      const exitCallback = vi.fn();
      await terminalService.registerExit(sessionId, exitCallback);
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      const listenMock = vi.mocked(getCurrentWebview().listen);
      const killedEntry = listenMock.mock.calls.find(([event]) => event === "session-killed");
      expect(killedEntry).toBeDefined();
      return { handler: killedEntry![1] as unknown as KilledHandler, exitCallback };
    }

    it("closes the tab for mcp / legacy no-reason kills", async () => {
      const { handler } = await registerKilledListenerAndSession("s-mcp");
      const closeTabBySessionId = vi.fn();
      const { usePanesStore } = await import("@/stores/usePanesStore");
      const getStateSpy = vi
        .spyOn(usePanesStore, "getState")
        .mockReturnValue({ closeTabBySessionId } as never);

      await handler({ payload: { sessionId: "s-mcp", reason: "mcp" } });
      await handler({ payload: { sessionId: "s-mcp" } });

      expect(closeTabBySessionId).toHaveBeenCalledTimes(2);
      getStateSpy.mockRestore();
    });

    it("keeps the tab and drives the exit callback for reclaim kills", async () => {
      const { handler, exitCallback } = await registerKilledListenerAndSession("s-reclaim");
      const closeTabBySessionId = vi.fn();
      const { usePanesStore } = await import("@/stores/usePanesStore");
      const getStateSpy = vi
        .spyOn(usePanesStore, "getState")
        .mockReturnValue({ closeTabBySessionId } as never);

      await handler({ payload: { sessionId: "s-reclaim", reason: "orphan-reclaim" } });
      await handler({ payload: { sessionId: "s-reclaim", reason: "daemon-reaper" } });

      expect(closeTabBySessionId).not.toHaveBeenCalled();
      expect(exitCallback).toHaveBeenCalledTimes(2);
      expect(exitCallback).toHaveBeenCalledWith(-1);
      getStateSpy.mockRestore();
    });

    it("still suppresses kills the frontend initiated itself", async () => {
      const { handler } = await registerKilledListenerAndSession("s-self");
      mockTauriInvoke({ kill_terminal_idempotent: undefined });
      await terminalService.killSession("s-self", "orphan-reclaim");

      const closeTabBySessionId = vi.fn();
      const { usePanesStore } = await import("@/stores/usePanesStore");
      const getStateSpy = vi
        .spyOn(usePanesStore, "getState")
        .mockReturnValue({ closeTabBySessionId } as never);

      await handler({ payload: { sessionId: "s-self", reason: "mcp" } });

      expect(closeTabBySessionId).not.toHaveBeenCalled();
      expect(invoke).toHaveBeenCalledWith("kill_terminal_idempotent", {
        sessionId: "s-self",
        reason: "orphan-reclaim",
      });
      getStateSpy.mockRestore();
    });
  });

  describe("createSession", () => {
    it("calls create_terminal_session with a request object", async () => {
      mockTauriInvoke({ create_terminal_session: "session-1" });

      const result = await terminalService.createSession({
        projectPath: "/tmp/project",
        cols: 80,
        rows: 24,
        cliTool: "claude",
      });

      expect(invoke).toHaveBeenCalledWith("create_terminal_session", {
        request: {
          projectPath: "/tmp/project",
          cols: 80,
          rows: 24,
          cliTool: "claude",
        },
      });
      expect(result).toBe("session-1");
    });

    it("omits null optional fields before invoking Tauri", async () => {
      mockTauriInvoke({ create_terminal_session: "session-1" });

      await terminalService.createSession({
        projectPath: "/tmp/project",
        cols: 80,
        rows: 24,
        providerSelection: null,
        resumeId: null,
      } as never);

      expect(invoke).toHaveBeenCalledWith("create_terminal_session", {
        request: {
          projectPath: "/tmp/project",
          cols: 80,
          rows: 24,
        },
      });
    });

    it("rejects a null request before invoking Tauri", async () => {
      await expect(
        terminalService.createSession(null),
      ).rejects.toThrow("create_terminal_session requires a non-null request");

      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe("write", () => {
    it("batches rapid terminal input for the same session", async () => {
      vi.useFakeTimers();
      mockTauriInvoke({ write_terminal: undefined, record_terminal_input: undefined });

      const first = terminalService.write("session-1", "a");
      const second = terminalService.write("session-1", "b");
      const third = terminalService.write("session-1", "c");

      await vi.advanceTimersByTimeAsync(8);
      await Promise.all([first, second, third]);

      expect(invoke).toHaveBeenCalledWith("write_terminal", {
        sessionId: "session-1",
        data: "abc",
      });
      expect((invoke as ReturnType<typeof vi.fn>).mock.calls.filter(([cmd]) => cmd === "write_terminal")).toHaveLength(1);
    });

    it("preserves per-session input order across flushes", async () => {
      vi.useFakeTimers();
      const writes: string[] = [];
      const resolvers: Array<() => void> = [];
      const invokeMock = invoke as ReturnType<typeof vi.fn>;
      invokeMock.mockImplementation((cmd: string, args?: { data?: string }) => {
        if (cmd === "record_terminal_input") return Promise.resolve();
        if (cmd !== "write_terminal") {
          return Promise.reject(new Error(`Unhandled invoke command: ${cmd}`));
        }
        writes.push(args?.data ?? "");
        return new Promise<void>((resolve) => {
          resolvers.push(resolve);
        });
      });

      const first = terminalService.write("session-1", "a");
      await vi.advanceTimersByTimeAsync(8);
      expect(writes).toEqual(["a"]);

      const second = terminalService.write("session-1", "b");
      const third = terminalService.write("session-1", "c");
      await vi.advanceTimersByTimeAsync(8);
      expect(writes).toEqual(["a"]);

      resolvers.shift()?.();
      await first;
      await vi.runOnlyPendingTimersAsync();
      expect(writes).toEqual(["a", "bc"]);

      resolvers.shift()?.();
      await Promise.all([second, third]);
    });

    it("drains queued keyboard input before submitToSession", async () => {
      vi.useFakeTimers();
      const calls: string[] = [];
      const writeResolvers: Array<() => void> = [];
      const invokeMock = invoke as ReturnType<typeof vi.fn>;
      invokeMock.mockImplementation((cmd: string) => {
        if (cmd === "record_terminal_input") return Promise.resolve();
        if (cmd === "write_terminal") {
          calls.push("write");
          return new Promise<void>((resolve) => writeResolvers.push(resolve));
        }
        if (cmd === "submit_to_session") {
          calls.push("submit");
          return Promise.resolve();
        }
        return Promise.reject(new Error(`Unhandled invoke command: ${cmd}`));
      });

      const write = terminalService.write("session-1", "a");
      const submit = terminalService.submitToSession("session-1", "prompt");
      await vi.runOnlyPendingTimersAsync();

      expect(calls).toEqual(["write"]);
      writeResolvers.shift()?.();
      await write;
      await submit;
      expect(calls).toEqual(["write", "submit"]);
    });
  });

  describe("getReplaySnapshot", () => {
    it("calls get_terminal_replay_snapshot and returns the snapshot", async () => {
      const snapshot = {
        data: "\x1b[?1049hhello",
        bufferMode: "alternate" as const,
      };
      mockTauriInvoke({ get_terminal_replay_snapshot: snapshot });

      const result = await terminalService.getReplaySnapshot("session-1");

      expect(invoke).toHaveBeenCalledWith("get_terminal_replay_snapshot", {
        sessionId: "session-1",
      });
      expect(result).toEqual(snapshot);
    });

    it("supports sessions without a replay snapshot", async () => {
      mockTauriInvoke({ get_terminal_replay_snapshot: null });

      const result = await terminalService.getReplaySnapshot("session-2");

      expect(result).toBeNull();
    });
  });
});
