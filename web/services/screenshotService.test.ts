import { describe, it, expect, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { screenshotService } from "./screenshotService";
import {
  mockTauriInvoke,
  resetTauriInvoke,
} from "@/test/utils/mockTauriInvoke";

describe("screenshotService", () => {
  beforeEach(() => {
    resetTauriInvoke();
  });

  describe("updateShortcut", () => {
    it("应该调用 screenshot_update_shortcut 并传递新旧快捷键", async () => {
      mockTauriInvoke({ screenshot_update_shortcut: undefined });

      await screenshotService.updateShortcut("Ctrl+Shift+S", "Ctrl+Alt+S");

      expect(invoke).toHaveBeenCalledWith("screenshot_update_shortcut", {
        oldShortcut: "Ctrl+Shift+S",
        newShortcut: "Ctrl+Alt+S",
      });
    });
  });

  describe("saveClipboardImage", () => {
    it("应该调用 screenshot_save_clipboard_image 并返回截图结果", async () => {
      const screenshot = { filePath: "/tmp/shot.png", width: 800, height: 600 };
      mockTauriInvoke({ screenshot_save_clipboard_image: screenshot });

      const result = await screenshotService.saveClipboardImage();

      expect(invoke).toHaveBeenCalledWith("screenshot_save_clipboard_image");
      expect(result).toEqual(screenshot);
    });

    it("应该在剪贴板无图片时返回 null", async () => {
      mockTauriInvoke({ screenshot_save_clipboard_image: null });

      const result = await screenshotService.saveClipboardImage();

      expect(result).toBeNull();
    });
  });
});
