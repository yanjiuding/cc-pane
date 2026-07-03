import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  layoutSwitcherService,
  type LayoutSwitcherSnapshot,
} from "./layoutSwitcherService";
import {
  mockTauriInvoke,
  resetTauriInvoke,
} from "@/test/utils/mockTauriInvoke";
import type { LayoutSwitcherSettings } from "@/types";

const originalTauriInternals = window.__TAURI_INTERNALS__;

function createSnapshot(): LayoutSwitcherSnapshot {
  return {
    layouts: [
      { id: "l-1", name: "Layout 1", kind: "normal", paneSessionIds: [["s-1"]] },
    ],
    currentLayoutId: "l-1",
  };
}

describe("layoutSwitcherService", () => {
  beforeEach(() => {
    resetTauriInvoke();
    window.__TAURI_INTERNALS__ = originalTauriInternals ?? {};
  });

  afterEach(() => {
    window.__TAURI_INTERNALS__ = originalTauriInternals;
  });

  describe("open / close", () => {
    it("应该调用对应的窗口命令", async () => {
      mockTauriInvoke({
        open_layout_switcher_window: undefined,
        close_layout_switcher_window: undefined,
      });

      await layoutSwitcherService.open();
      await layoutSwitcherService.close();

      expect(invoke).toHaveBeenCalledWith("open_layout_switcher_window");
      expect(invoke).toHaveBeenCalledWith("close_layout_switcher_window");
    });

    it("应该在 Web 运行时不调用命令", async () => {
      delete window.__TAURI_INTERNALS__;

      await layoutSwitcherService.open();
      await layoutSwitcherService.close();

      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe("getSnapshot", () => {
    it("应该解析后端返回的 JSON 快照", async () => {
      const snapshot = createSnapshot();
      mockTauriInvoke({
        get_layout_switcher_snapshot: JSON.stringify(snapshot),
      });

      const result = await layoutSwitcherService.getSnapshot();

      expect(invoke).toHaveBeenCalledWith("get_layout_switcher_snapshot");
      expect(result).toEqual(snapshot);
    });

    it("应该在无快照时返回 null", async () => {
      mockTauriInvoke({ get_layout_switcher_snapshot: null });

      const result = await layoutSwitcherService.getSnapshot();

      expect(result).toBeNull();
    });

    it("应该在 Web 运行时直接返回 null", async () => {
      delete window.__TAURI_INTERNALS__;

      const result = await layoutSwitcherService.getSnapshot();

      expect(result).toBeNull();
      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe("saveSnapshot", () => {
    it("应该将快照序列化为 JSON 后保存", async () => {
      const snapshot = createSnapshot();
      mockTauriInvoke({ save_layout_switcher_snapshot: undefined });

      await layoutSwitcherService.saveSnapshot(snapshot);

      expect(invoke).toHaveBeenCalledWith("save_layout_switcher_snapshot", {
        snapshot: JSON.stringify(snapshot),
      });
    });
  });

  describe("getState", () => {
    it("应该返回后端保存的窗口状态", async () => {
      const state: LayoutSwitcherSettings = {
        windowX: 100,
        windowY: 200,
        pinned: true,
      };
      mockTauriInvoke({ get_layout_switcher_state: state });

      const result = await layoutSwitcherService.getState();

      expect(result).toEqual(state);
    });

    it("应该在后端返回空时使用默认状态", async () => {
      mockTauriInvoke({ get_layout_switcher_state: null });

      const result = await layoutSwitcherService.getState();

      expect(result).toEqual({ windowX: null, windowY: null, pinned: false });
    });

    it("应该在 Web 运行时返回默认状态", async () => {
      delete window.__TAURI_INTERNALS__;

      const result = await layoutSwitcherService.getState();

      expect(result).toEqual({ windowX: null, windowY: null, pinned: false });
      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe("saveState", () => {
    it("应该将状态字段展开为命令参数", async () => {
      mockTauriInvoke({ save_layout_switcher_state: undefined });

      await layoutSwitcherService.saveState({
        windowX: 10,
        windowY: 20,
        pinned: true,
      });

      expect(invoke).toHaveBeenCalledWith("save_layout_switcher_state", {
        x: 10,
        y: 20,
        pinned: true,
      });
    });
  });
});
