import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useWorkspaceWatcher } from "./useWorkspaceWatcher";
import { useWorkspacesStore } from "@/stores";

type WebviewListener = (event: { payload: unknown }) => void | Promise<void>;

function mockWebviewListeners() {
  const listeners = new Map<string, WebviewListener>();
  vi.mocked(getCurrentWebview().listen).mockImplementation(async (eventName, handler) => {
    listeners.set(eventName, handler as WebviewListener);
    return () => listeners.delete(eventName);
  });
  return listeners;
}

describe("useWorkspaceWatcher", () => {
  const load = vi.fn();

  beforeEach(() => {
    load.mockReset();
    vi.mocked(getCurrentWebview().listen).mockReset();
    useWorkspacesStore.setState({ load });
  });

  it("挂载后订阅 workspaces-changed，事件触发时刷新工作空间列表", async () => {
    const listeners = mockWebviewListeners();
    renderHook(() => useWorkspaceWatcher());

    await waitFor(() => expect(listeners.has("workspaces-changed")).toBe(true));
    expect(load).not.toHaveBeenCalled();

    await act(async () => {
      await listeners.get("workspaces-changed")?.({ payload: null });
    });
    expect(load).toHaveBeenCalledTimes(1);

    await act(async () => {
      await listeners.get("workspaces-changed")?.({ payload: null });
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("卸载后取消订阅，后续事件不再触发", async () => {
    const listeners = mockWebviewListeners();
    const { unmount } = renderHook(() => useWorkspaceWatcher());
    await waitFor(() => expect(listeners.has("workspaces-changed")).toBe(true));

    unmount();
    expect(listeners.has("workspaces-changed")).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });
});
