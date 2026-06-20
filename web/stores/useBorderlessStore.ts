import { create } from "zustand";
import { handleErrorSilent } from "@/utils";
import { invokeIfTauri, isTauriRuntime } from "@/services/runtime";

interface BorderlessState {
  isBorderless: boolean;
  toggleBorderless: () => Promise<void>;
  exitBorderless: () => Promise<void>;
}

export const useBorderlessStore = create<BorderlessState>((set, get) => ({
  isBorderless: false,

  toggleBorderless: async () => {
    const next = !get().isBorderless;
    try {
      if (isTauriRuntime()) {
        await invokeIfTauri("set_decorations", { decorations: !next });
      }
      set({ isBorderless: next });
    } catch (e) {
      handleErrorSilent(e, "toggle borderless");
    }
  },

  exitBorderless: async () => {
    if (!get().isBorderless) return;
    try {
      if (isTauriRuntime()) {
        await invokeIfTauri("set_decorations", { decorations: true });
      }
      set({ isBorderless: false });
    } catch (e) {
      handleErrorSilent(e, "exit borderless");
    }
  },
}));
