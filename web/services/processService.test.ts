import { describe, it, expect, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { processService } from "./processService";
import {
  mockTauriInvoke,
  resetTauriInvoke,
} from "@/test/utils/mockTauriInvoke";

describe("processService", () => {
  beforeEach(() => {
    resetTauriInvoke();
  });

  describe("scan", () => {
    it("应该调用 scan_claude_processes 并返回扫描结果", async () => {
      const scanResult = { processes: [], totalCount: 0 };
      mockTauriInvoke({ scan_claude_processes: scanResult });

      const result = await processService.scan();

      expect(invoke).toHaveBeenCalledWith("scan_claude_processes");
      expect(result).toEqual(scanResult);
    });
  });

  describe("killProcess", () => {
    it("应该调用 kill_claude_process 并传递 pid", async () => {
      mockTauriInvoke({ kill_claude_process: true });

      const result = await processService.killProcess(1234);

      expect(invoke).toHaveBeenCalledWith("kill_claude_process", { pid: 1234 });
      expect(result).toBe(true);
    });

    it("应该在终止失败时返回 false", async () => {
      mockTauriInvoke({ kill_claude_process: false });

      const result = await processService.killProcess(9999);

      expect(result).toBe(false);
    });
  });

  describe("killProcesses", () => {
    it("应该调用 kill_claude_processes 并返回每个 pid 的结果", async () => {
      const results: [number, boolean][] = [
        [1234, true],
        [5678, false],
      ];
      mockTauriInvoke({ kill_claude_processes: results });

      const result = await processService.killProcesses([1234, 5678]);

      expect(invoke).toHaveBeenCalledWith("kill_claude_processes", {
        pids: [1234, 5678],
      });
      expect(result).toEqual(results);
    });
  });
});
