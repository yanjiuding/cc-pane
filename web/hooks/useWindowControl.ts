import { useState, useCallback, useEffect } from "react";
import { handleErrorSilent } from "@/utils";
import { getCurrentWindowIfTauri, invokeIfTauri, isTauriRuntime } from "@/services/runtime";

export function useWindowControl() {
  const [isPinned, setIsPinned] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindowIfTauri();
    if (!win) return;
    win.isMaximized().then(setIsMaximized).catch((e) => handleErrorSilent(e, "check maximized"));
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const unlisten = win.onResized(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        win.isMaximized().then(setIsMaximized).catch((e) => handleErrorSilent(e, "check maximized"));
      }, 150);
    });
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unlisten.then((fn) => fn());
    };
  }, []);

  const togglePin = useCallback(async () => {
    if (!isTauriRuntime()) return;
    try {
      const result = await invokeIfTauri<boolean>("toggle_always_on_top");
      setIsPinned(Boolean(result));
    } catch (e) {
      handleErrorSilent(e, "toggle pin");
    }
  }, []);

  const closeWindow = useCallback(async () => {
    if (!isTauriRuntime()) return;
    try {
      await invokeIfTauri("close_window");
    } catch (e) {
      handleErrorSilent(e, "close window");
    }
  }, []);

  const minimizeWindow = useCallback(async () => {
    if (!isTauriRuntime()) return;
    try {
      await invokeIfTauri("minimize_window");
    } catch (e) {
      handleErrorSilent(e, "minimize window");
    }
  }, []);

  const maximizeWindow = useCallback(async () => {
    if (!isTauriRuntime()) return;
    try {
      await invokeIfTauri("maximize_window");
    } catch (e) {
      handleErrorSilent(e, "maximize window");
    }
  }, []);

  const toggleFullscreenWindow = useCallback(async () => {
    if (!isTauriRuntime()) return;
    try {
      const isFullscreen = await invokeIfTauri<boolean>("is_fullscreen");
      await invokeIfTauri(isFullscreen ? "exit_fullscreen" : "enter_fullscreen");
    } catch (e) {
      handleErrorSilent(e, "toggle fullscreen");
    }
  }, []);

  const startDrag = useCallback(() => {
    getCurrentWindowIfTauri()?.startDragging().catch((e) => handleErrorSilent(e, "start drag"));
  }, []);

  return {
    isPinned,
    isMaximized,
    togglePin,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    toggleFullscreenWindow,
    startDrag,
  };
}
