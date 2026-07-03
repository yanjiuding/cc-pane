import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  mockTauriInvoke,
  resetTauriInvoke,
} from "@/test/utils/mockTauriInvoke";
import type { PopupTabData } from "./popupWindowService";

const originalTauriInternals = window.__TAURI_INTERNALS__;

function createTabData(overrides: Partial<PopupTabData> = {}): PopupTabData {
  return {
    tabId: "tab-1",
    paneId: "pane-1",
    sessionId: "session-1",
    projectPath: "/tmp/project",
    title: "Terminal",
    ...overrides,
  };
}

async function importService() {
  return import("./popupWindowService");
}

describe("popupWindowService", () => {
  beforeEach(() => {
    vi.resetModules();
    resetTauriInvoke();
    window.__TAURI_INTERNALS__ = originalTauriInternals ?? {};
  });

  afterEach(() => {
    vi.useRealTimers();
    window.__TAURI_INTERNALS__ = originalTauriInternals;
  });

  describe("popOutTab", () => {
    it("应该调用 create_popup_terminal_window 并记录弹出状态", async () => {
      const service = await importService();
      const data = createTabData();
      mockTauriInvoke({ create_popup_terminal_window: undefined });

      await service.popOutTab(data);

      expect(invoke).toHaveBeenCalledWith("create_popup_terminal_window", {
        tabData: JSON.stringify(data),
        label: "popup-tab-1",
      });
      expect(service.isTabPoppedOut("tab-1")).toBe(true);
      expect(service.getPoppedTabs().get("tab-1")).toBe("popup-tab-1");
    });

    it("应该在 Web 运行时抛出仅桌面可用的错误", async () => {
      const service = await importService();
      delete window.__TAURI_INTERNALS__;

      await expect(service.popOutTab(createTabData())).rejects.toThrow(
        "only available in the desktop app",
      );
      expect(service.isTabPoppedOut("tab-1")).toBe(false);
    });
  });

  describe("markTabReclaimed", () => {
    it("应该移除弹出状态", async () => {
      const service = await importService();
      mockTauriInvoke({ create_popup_terminal_window: undefined });
      await service.popOutTab(createTabData());

      service.markTabReclaimed("tab-1");

      expect(service.isTabPoppedOut("tab-1")).toBe(false);
      expect(service.getPoppedTabs().size).toBe(0);
    });
  });

  describe("getPoppedTabs", () => {
    it("应该返回副本，修改副本不影响内部状态", async () => {
      const service = await importService();
      mockTauriInvoke({ create_popup_terminal_window: undefined });
      await service.popOutTab(createTabData());

      const copy = service.getPoppedTabs();
      copy.delete("tab-1");

      expect(service.isTabPoppedOut("tab-1")).toBe(true);
    });
  });

  describe("getPopupTabData", () => {
    it("应该在首次获取到数据时直接解析返回", async () => {
      const service = await importService();
      const data = createTabData();
      mockTauriInvoke({ get_popup_tab_data: JSON.stringify(data) });

      const result = await service.getPopupTabData();

      expect(result).toEqual(data);
    });

    it("应该在 JSON 解析失败时返回 null", async () => {
      const service = await importService();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockTauriInvoke({ get_popup_tab_data: "{not-json" });

      const result = await service.getPopupTabData();

      expect(result).toBeNull();
      errorSpy.mockRestore();
    });

    it("应该在重试 5 次后仍无数据时返回 null", async () => {
      vi.useFakeTimers();
      const service = await importService();
      mockTauriInvoke({ get_popup_tab_data: null });

      const promise = service.getPopupTabData();
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBeNull();
      expect(invoke).toHaveBeenCalledTimes(5);
    });

    it("应该在后续重试中拿到数据后返回", async () => {
      vi.useFakeTimers();
      const service = await importService();
      const data = createTabData();
      let calls = 0;
      mockTauriInvoke({
        get_popup_tab_data: () => {
          calls += 1;
          return calls < 3 ? null : JSON.stringify(data);
        },
      });

      const promise = service.getPopupTabData();
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual(data);
      expect(calls).toBe(3);
    });

    it("应该在 Web 运行时直接返回 null", async () => {
      const service = await importService();
      delete window.__TAURI_INTERNALS__;

      const result = await service.getPopupTabData();

      expect(result).toBeNull();
      expect(invoke).not.toHaveBeenCalled();
    });
  });
});
