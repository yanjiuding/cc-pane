import { describe, it, expect, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { codexService, type CodexSession } from "./codexService";
import {
  mockTauriInvoke,
  resetTauriInvoke,
} from "@/test/utils/mockTauriInvoke";

function createSession(overrides: Partial<CodexSession> = {}): CodexSession {
  return {
    id: "session-1",
    project_path: "/tmp/project",
    modified_at: 1700000000,
    file_path: "/home/user/.codex/sessions/session-1.jsonl",
    description: "test session",
    ...overrides,
  };
}

describe("codexService", () => {
  beforeEach(() => {
    resetTauriInvoke();
  });

  describe("listSessions", () => {
    it("应该调用 list_codex_sessions 命令并传递项目路径", async () => {
      const sessions = [createSession()];
      mockTauriInvoke({ list_codex_sessions: sessions });

      const result = await codexService.listSessions("/tmp/project");

      expect(invoke).toHaveBeenCalledWith("list_codex_sessions", {
        projectPath: "/tmp/project",
        runtimeKind: undefined,
        wslDistro: undefined,
      });
      expect(result).toEqual(sessions);
    });

    it("应该透传 runtimeKind 和 wslDistro 参数", async () => {
      mockTauriInvoke({ list_codex_sessions: [] });

      await codexService.listSessions("/tmp/project", "wsl", "Ubuntu");

      expect(invoke).toHaveBeenCalledWith("list_codex_sessions", {
        projectPath: "/tmp/project",
        runtimeKind: "wsl",
        wslDistro: "Ubuntu",
      });
    });

    it("应该在无会话时返回空数组", async () => {
      mockTauriInvoke({ list_codex_sessions: [] });

      const result = await codexService.listSessions("/tmp/project");

      expect(result).toEqual([]);
    });
  });
});
