import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { error as logError, info as logInfo } from "@tauri-apps/plugin-log";
import {
  isTauriRuntime,
  isWebRuntime,
  invokeIfTauri,
  listenIfTauri,
  getCurrentWindowIfTauri,
  logInfoSafe,
  logErrorSafe,
} from "./runtime";
import {
  mockTauriInvoke,
  resetTauriInvoke,
} from "@/test/utils/mockTauriInvoke";

vi.mock("@tauri-apps/plugin-log", () => ({
  info: vi.fn(() => Promise.resolve()),
  error: vi.fn(() => Promise.resolve()),
}));

const mockWindow = { label: "main" };
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => mockWindow),
}));

const originalTauriInternals = window.__TAURI_INTERNALS__;

describe("runtime", () => {
  beforeEach(() => {
    resetTauriInvoke();
    vi.clearAllMocks();
    window.__TAURI_INTERNALS__ = originalTauriInternals ?? {};
  });

  afterEach(() => {
    window.__TAURI_INTERNALS__ = originalTauriInternals;
  });

  describe("isTauriRuntime / isWebRuntime", () => {
    it("应该在存在 __TAURI_INTERNALS__ 时判定为 Tauri 运行时", () => {
      expect(isTauriRuntime()).toBe(true);
      expect(isWebRuntime()).toBe(false);
    });

    it("应该在缺少 __TAURI_INTERNALS__ 时判定为 Web 运行时", () => {
      delete window.__TAURI_INTERNALS__;

      expect(isTauriRuntime()).toBe(false);
      expect(isWebRuntime()).toBe(true);
    });
  });

  describe("invokeIfTauri", () => {
    it("应该在无参数时不传 args 调用 invoke", async () => {
      mockTauriInvoke({ my_command: "ok" });

      const result = await invokeIfTauri<string>("my_command");

      expect(invoke).toHaveBeenCalledWith("my_command");
      expect(result).toBe("ok");
    });

    it("应该在有参数时透传 args", async () => {
      mockTauriInvoke({ my_command: "ok" });

      await invokeIfTauri("my_command", { key: "value" });

      expect(invoke).toHaveBeenCalledWith("my_command", { key: "value" });
    });

    it("应该在 Web 运行时返回 undefined 且不调用 invoke", async () => {
      delete window.__TAURI_INTERNALS__;

      const result = await invokeIfTauri("my_command");

      expect(result).toBeUndefined();
      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe("listenIfTauri", () => {
    it("应该在 Tauri 运行时注册事件监听", async () => {
      const handler = vi.fn();

      await listenIfTauri("my-event", handler);

      expect(listen).toHaveBeenCalledWith("my-event", handler);
    });

    it("应该在 Web 运行时返回 no-op unlisten", async () => {
      delete window.__TAURI_INTERNALS__;

      const unlisten = await listenIfTauri("my-event", vi.fn());

      expect(listen).not.toHaveBeenCalled();
      expect(() => unlisten()).not.toThrow();
    });
  });

  describe("getCurrentWindowIfTauri", () => {
    it("应该在 Tauri 运行时返回当前窗口", () => {
      expect(getCurrentWindowIfTauri()).toBe(mockWindow);
    });

    it("应该在 Web 运行时返回 null", () => {
      delete window.__TAURI_INTERNALS__;

      expect(getCurrentWindowIfTauri()).toBeNull();
    });
  });

  describe("logInfoSafe / logErrorSafe", () => {
    it("应该在 Tauri 运行时写入插件日志", async () => {
      await logInfoSafe("info message");
      await logErrorSafe("error message");

      expect(logInfo).toHaveBeenCalledWith("info message");
      expect(logError).toHaveBeenCalledWith("error message");
    });

    it("应该在插件日志失败时不抛出错误", async () => {
      (logInfo as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("log backend down"),
      );

      await expect(logInfoSafe("info message")).resolves.toBeUndefined();
    });

    it("应该在 Web 运行时降级为 console 输出", async () => {
      delete window.__TAURI_INTERNALS__;
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await logInfoSafe("info message");
      await logErrorSafe("error message");

      expect(infoSpy).toHaveBeenCalledWith("info message");
      expect(errorSpy).toHaveBeenCalledWith("error message");
      expect(logInfo).not.toHaveBeenCalled();
      expect(logError).not.toHaveBeenCalled();
      infoSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });
});
