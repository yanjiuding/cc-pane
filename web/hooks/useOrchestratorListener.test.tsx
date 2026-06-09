import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { invoke } from "@tauri-apps/api/core";
import { useOrchestratorListener } from "./useOrchestratorListener";
import { useActivityBarStore, usePanesStore } from "@/stores";
import { createPanel } from "@/stores/paneTreeHelpers";
import { mockTauriInvoke, resetTauriInvoke } from "@/test/utils/mockTauriInvoke";

type WebviewListener = (event: { payload: Record<string, unknown> }) => void | Promise<void>;

function resetStores() {
  const rootPane = createPanel();
  usePanesStore.setState({
    rootPane,
    activePaneId: rootPane.id,
    layouts: [{
      id: "layout-1",
      name: "布局 1",
      rootPane,
      activePaneId: rootPane.id,
    }],
    currentLayoutId: "layout-1",
    closedTabs: [],
    poppedOutTabs: new Set<string>(),
  });
  useActivityBarStore.setState({
    activeView: "explorer",
    sidebarVisible: true,
    appViewMode: "home",
    orchestrationOverlayOpen: false,
  });
}

function mockWebviewListeners() {
  const listeners = new Map<string, WebviewListener>();
  vi.mocked(getCurrentWebview().listen).mockImplementation(async (eventName, handler) => {
    listeners.set(eventName, handler as WebviewListener);
    return () => listeners.delete(eventName);
  });
  return listeners;
}

describe("useOrchestratorListener layout placement", () => {
  beforeEach(() => {
    resetTauriInvoke();
    vi.mocked(getCurrentWebview().listen).mockReset();
    mockTauriInvoke({
      exit_fullscreen: undefined,
      respond_orchestrator_query: undefined,
    });
    resetStores();
  });

  it("launch-task 使用 layoutName 自动创建布局并把 tab 放入该布局", async () => {
    const listeners = mockWebviewListeners();
    renderHook(() => useOrchestratorListener());
    await waitFor(() => expect(listeners.has("orchestrator-launch-task")).toBe(true));

    await act(async () => {
      await listeners.get("orchestrator-launch-task")?.({
        payload: {
          taskId: "task-1",
          sessionId: "session-1",
          projectPath: "/tmp/project-a",
          projectId: "project-a",
          layoutName: "MCP 自动任务",
          cliTool: "codex",
        },
      });
    });

    const state = usePanesStore.getState();
    const layout = state.layouts.find((item) => item.name === "MCP 自动任务");
    expect(layout).toBeTruthy();
    expect(state.currentLayoutId).toBe(layout?.id);
    expect(state.rootPane.type).toBe("panel");
    if (state.rootPane.type === "panel") {
      expect(state.rootPane.tabs.some((tab) => tab.sessionId === "session-1")).toBe(true);
    }
    const projectedLayout = state.listLayouts().find((item) => item.id === layout?.id);
    expect(projectedLayout?.rootPane).toBe(state.rootPane);
    expect(useActivityBarStore.getState().appViewMode).toBe("panes");
  });

  it("query-panes 返回当前 panes 兼容字段和 layouts 详情", async () => {
    const listeners = mockWebviewListeners();
    const secondLayoutId = usePanesStore.getState().createLayout("第二布局");
    usePanesStore.getState().switchLayout("layout-1");
    renderHook(() => useOrchestratorListener());
    await waitFor(() => expect(listeners.has("orchestrator-query-panes")).toBe(true));

    await act(async () => {
      await listeners.get("orchestrator-query-panes")?.({
        payload: {
          requestId: "query-1",
        },
      });
    });

    expect(invoke).toHaveBeenCalledWith(
      "respond_orchestrator_query",
      expect.objectContaining({ requestId: "query-1" }),
    );
    const calls = vi.mocked(invoke).mock.calls;
    const [, args] = calls[calls.length - 1]!;
    const data = JSON.parse((args as { data: string }).data) as {
      panes: Array<{ layoutId: string }>;
      layouts: Array<{ id: string; name: string; panes: Array<{ layoutId: string }> }>;
      currentLayoutId: string;
      layoutCount: number;
    };

    expect(data.currentLayoutId).toBe("layout-1");
    expect(data.panes.every((pane) => pane.layoutId === "layout-1")).toBe(true);
    expect(data.layouts.map((layout) => layout.id)).toContain(secondLayoutId);
    expect(data.layouts.find((layout) => layout.id === secondLayoutId)?.name).toBe("第二布局");
    expect(data.layoutCount).toBe(2);
  });
});
