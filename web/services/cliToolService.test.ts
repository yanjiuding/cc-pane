import { describe, it, expect, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listCliTools } from "./cliToolService";
import {
  mockTauriInvoke,
  mockTauriInvokeError,
  resetTauriInvoke,
} from "@/test/utils/mockTauriInvoke";

describe("cliToolService", () => {
  beforeEach(() => {
    resetTauriInvoke();
  });

  describe("listCliTools", () => {
    it("应该调用 list_cli_tools 命令并返回工具列表", async () => {
      const tools = [
        { id: "claude", name: "Claude Code", installed: true },
        { id: "codex", name: "Codex", installed: false },
      ];
      mockTauriInvoke({ list_cli_tools: tools });

      const result = await listCliTools();

      expect(invoke).toHaveBeenCalledWith("list_cli_tools");
      expect(result).toEqual(tools);
    });

    it("应该在空列表时返回空数组", async () => {
      mockTauriInvoke({ list_cli_tools: [] });

      const result = await listCliTools();

      expect(result).toEqual([]);
    });

    it("应该在命令失败时抛出错误", async () => {
      mockTauriInvokeError("list_cli_tools", "detect failed");

      await expect(listCliTools()).rejects.toThrow("detect failed");
    });
  });
});
