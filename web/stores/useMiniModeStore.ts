import { create } from "zustand";
import { handleErrorSilent } from "@/utils";
import { getCurrentWindowIfTauri, invokeIfTauri, isTauriRuntime } from "@/services/runtime";

interface MiniModeState {
  isMiniMode: boolean;
  isTransitioning: boolean;
  savedWidth: number;
  savedHeight: number;
  enterMiniMode: () => Promise<void>;
  exitMiniMode: () => Promise<void>;
  toggleMiniMode: () => void;
}

export const useMiniModeStore = create<MiniModeState>((set, get) => ({
  isMiniMode: false,
  isTransitioning: false,
  savedWidth: 1200,
  savedHeight: 800,

  enterMiniMode: async () => {
    if (get().isMiniMode || get().isTransitioning) return;
    let switchedView = false;
    try {
      set({ isTransitioning: true });
      const win = getCurrentWindowIfTauri();
      if (!win) return;
      const factor = await win.scaleFactor();
      const physicalSize = await win.innerSize();
      set({
        savedWidth: physicalSize.width / factor,
        savedHeight: physicalSize.height / factor,
      });

      set({ isMiniMode: true });
      switchedView = true;
      await invokeIfTauri("enter_mini_mode");
    } catch (e) {
      if (switchedView) set({ isMiniMode: false });
      handleErrorSilent(e, "enter mini mode");
    } finally {
      set({ isTransitioning: false });
    }
  },

  exitMiniMode: async () => {
    if (!get().isMiniMode || get().isTransitioning) return;
    try {
      set({ isTransitioning: true });
      const { savedWidth, savedHeight } = get();
      if (!isTauriRuntime()) {
        set({ isMiniMode: false });
        return;
      }
      await invokeIfTauri("exit_mini_mode", {
        width: savedWidth,
        height: savedHeight,
      });
      set({ isMiniMode: false });
    } catch (e) {
      handleErrorSilent(e, "exit mini mode");
    } finally {
      set({ isTransitioning: false });
    }
  },

  toggleMiniMode: () => {
    const { isMiniMode, enterMiniMode, exitMiniMode } = get();
    if (isMiniMode) {
      exitMiniMode();
    } else {
      enterMiniMode();
    }
  },
}));
