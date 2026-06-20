import { create } from "zustand";
import { handleErrorSilent } from "@/utils";
import { invokeIfTauri, isTauriRuntime } from "@/services/runtime";

interface FullscreenState {
  isFullscreen: boolean;
  fullscreenTabId: string | null;
  fullscreenPaneId: string | null;
  enterFullscreen: (paneId: string, tabId: string) => Promise<void>;
  exitFullscreen: () => Promise<void>;
  toggleFullscreen: (paneId?: string, tabId?: string) => Promise<void>;
  checkFullscreenState: () => Promise<void>;
}

export const useFullscreenStore = create<FullscreenState>((set, get) => ({
  isFullscreen: false,
  fullscreenTabId: null,
  fullscreenPaneId: null,

  enterFullscreen: async (paneId, tabId) => {
    try {
      await invokeIfTauri("enter_fullscreen");
      set({ isFullscreen: true, fullscreenPaneId: paneId, fullscreenTabId: tabId });
    } catch (error) {
      handleErrorSilent(error, "enter fullscreen");
    }
  },

  exitFullscreen: async () => {
    try {
      await invokeIfTauri("exit_fullscreen");
      set({ isFullscreen: false, fullscreenPaneId: null, fullscreenTabId: null });
    } catch (error) {
      handleErrorSilent(error, "exit fullscreen");
    }
  },

  toggleFullscreen: async (paneId?, tabId?) => {
    const { isFullscreen, exitFullscreen, enterFullscreen } = get();
    if (isFullscreen) {
      await exitFullscreen();
    } else if (paneId && tabId) {
      await enterFullscreen(paneId, tabId);
    }
  },

  checkFullscreenState: async () => {
    if (!isTauriRuntime()) return;
    try {
      const state = await invokeIfTauri<boolean>("is_fullscreen");
      if (!state && get().isFullscreen) {
        set({ isFullscreen: false, fullscreenPaneId: null, fullscreenTabId: null });
      }
    } catch {
      // 命令可能尚未注册
    }
  },
}));
