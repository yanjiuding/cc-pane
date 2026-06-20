import type { LayoutSwitcherSettings } from "@/types";
import { invokeIfTauri, isTauriRuntime } from "./runtime";

export interface LayoutSwitcherLayoutSnapshot {
  id: string;
  name: string;
  kind?: "normal" | "starred";
  paneSessionIds: string[][];
}

export interface LayoutSwitcherSnapshot {
  layouts: LayoutSwitcherLayoutSnapshot[];
  currentLayoutId: string;
}

export const layoutSwitcherService = {
  open: async () => {
    if (!isTauriRuntime()) return;
    await invokeIfTauri<void>("open_layout_switcher_window");
  },

  close: async () => {
    if (!isTauriRuntime()) return;
    await invokeIfTauri<void>("close_layout_switcher_window");
  },

  getSnapshot: async () => {
    if (!isTauriRuntime()) return null;
    const snapshot = await invokeIfTauri<string | null>("get_layout_switcher_snapshot");
    return snapshot ? JSON.parse(snapshot) as LayoutSwitcherSnapshot : null;
  },

  saveSnapshot: async (snapshot: LayoutSwitcherSnapshot) => {
    if (!isTauriRuntime()) return;
    await invokeIfTauri<void>("save_layout_switcher_snapshot", {
      snapshot: JSON.stringify(snapshot),
    });
  },

  getState: async () => {
    const fallback: LayoutSwitcherSettings = {
      windowX: null,
      windowY: null,
      pinned: false,
    };
    if (!isTauriRuntime()) return fallback;
    return await invokeIfTauri<LayoutSwitcherSettings>("get_layout_switcher_state") ?? fallback;
  },

  saveState: async (state: LayoutSwitcherSettings) => {
    if (!isTauriRuntime()) return;
    await invokeIfTauri<void>("save_layout_switcher_state", {
      x: state.windowX,
      y: state.windowY,
      pinned: state.pinned,
    });
  },
};
