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
    // 仅当处于 App 自己的 pane 全屏（双击标签触发）时才退出原生全屏。
    // 否则用户是用 macOS 绿按钮/系统进的全屏（本 store 不追踪，isFullscreen=false），
    // 切换/删除/创建布局时不应把它踢出全屏（见 usePanesStore 的 switchLayout 等）。
    if (!get().isFullscreen) return;
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
