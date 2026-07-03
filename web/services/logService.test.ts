import { describe, it, expect, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { logService } from "./logService";
import {
  mockTauriInvoke,
  mockTauriInvokeError,
  resetTauriInvoke,
} from "@/test/utils/mockTauriInvoke";

describe("logService", () => {
  beforeEach(() => {
    resetTauriInvoke();
  });

  describe("getLogDir", () => {
    it("应该调用 get_log_dir 并返回日志目录", async () => {
      mockTauriInvoke({ get_log_dir: "/home/user/.cc-panes/logs" });

      const result = await logService.getLogDir();

      expect(invoke).toHaveBeenCalledWith("get_log_dir");
      expect(result).toBe("/home/user/.cc-panes/logs");
    });
  });

  describe("openLogDir", () => {
    it("应该先获取日志目录再调用 open_path_in_explorer", async () => {
      mockTauriInvoke({
        get_log_dir: "/home/user/.cc-panes/logs",
        open_path_in_explorer: undefined,
      });

      await logService.openLogDir();

      expect(invoke).toHaveBeenCalledWith("get_log_dir");
      expect(invoke).toHaveBeenCalledWith("open_path_in_explorer", {
        path: "/home/user/.cc-panes/logs",
      });
    });

    it("应该在获取日志目录失败时抛出错误且不打开目录", async () => {
      mockTauriInvokeError("get_log_dir", "no log dir");

      await expect(logService.openLogDir()).rejects.toThrow("no log dir");
      expect(invoke).not.toHaveBeenCalledWith(
        "open_path_in_explorer",
        expect.anything(),
      );
    });
  });
});
