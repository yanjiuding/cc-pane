import { invoke } from "@tauri-apps/api/core";
import type { LayoutSwitcherSettings } from "@/types";

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
  open: () => invoke<void>("open_layout_switcher_window"),

  close: () => invoke<void>("close_layout_switcher_window"),

  getSnapshot: async () => {
    const snapshot = await invoke<string | null>("get_layout_switcher_snapshot");
    return snapshot ? JSON.parse(snapshot) as LayoutSwitcherSnapshot : null;
  },

  saveSnapshot: (snapshot: LayoutSwitcherSnapshot) =>
    invoke<void>("save_layout_switcher_snapshot", {
      snapshot: JSON.stringify(snapshot),
    }),

  getState: () => invoke<LayoutSwitcherSettings>("get_layout_switcher_state"),

  saveState: (state: LayoutSwitcherSettings) =>
    invoke<void>("save_layout_switcher_state", {
      x: state.windowX,
      y: state.windowY,
      pinned: state.pinned,
    }),
};
