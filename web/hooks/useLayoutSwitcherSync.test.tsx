import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emitTo, listen } from "@tauri-apps/api/event";
import useLayoutSwitcherSync from "./useLayoutSwitcherSync";
import { usePanesStore } from "@/stores";
import { layoutSwitcherService, type LayoutSwitcherSnapshot } from "@/services/layoutSwitcherService";
import type { Panel } from "@/types";

vi.mock("@/services/layoutSwitcherService", () => ({
  layoutSwitcherService: {
    saveSnapshot: vi.fn(() => Promise.resolve()),
    saveState: vi.fn(() => Promise.resolve()),
    getState: vi.fn(() => Promise.resolve({ windowX: null, windowY: null, pinned: false })),
  },
}));

type EventListener = (event: { payload: Record<string, unknown> }) => void | Promise<void>;

function mockEventListeners() {
  const listeners = new Map<string, EventListener>();
  vi.mocked(listen).mockImplementation(async (eventName, handler) => {
    listeners.set(eventName as string, handler as EventListener);
    return () => listeners.delete(eventName as string);
  });
  return listeners;
}

function makePanel(paneId: string, sessionIds: (string | null)[]): Panel {
  return {
    type: "panel",
    id: paneId,
    tabs: sessionIds.map((sessionId, index) => ({
      id: `${paneId}-tab-${index}`,
      title: `Tab ${index}`,
      contentType: "terminal" as const,
      projectId: "",
      projectPath: "",
      sessionId,
      terminalRootPane: {
        type: "leaf" as const,
        id: `${paneId}-leaf-${index}`,
        sessionId,
      },
      activeTerminalPaneId: `${paneId}-leaf-${index}`,
    })),
    activeTabId: null,
  } as unknown as Panel;
}

const switchLayout = vi.fn();

function resetPanesState() {
  const currentRoot = makePanel("pane-current", ["sess-live"]);
  const otherRoot = makePanel("pane-other", ["sess-other", null]);
  const starredRoot = makePanel("pane-starred", ["sess-starred"]);
  usePanesStore.setState({
    rootPane: currentRoot,
    activePaneId: currentRoot.id,
    currentLayoutId: "layout-1",
    layouts: [
      { id: "layout-1", name: "布局 1", rootPane: makePanel("pane-stale", ["sess-stale"]), activePaneId: "pane-stale" },
      { id: "layout-2", name: "布局 2", rootPane: otherRoot, activePaneId: otherRoot.id },
      { id: "layout-star", name: "收藏", kind: "starred", rootPane: starredRoot, activePaneId: starredRoot.id },
    ],
    switchLayout,
  });
}

function lastEmittedSnapshot(): LayoutSwitcherSnapshot {
  const calls = vi.mocked(emitTo).mock.calls.filter((call) => call[1] === "layout-switcher:state");
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1]![2] as LayoutSwitcherSnapshot;
}

describe("useLayoutSwitcherSync", () => {
  beforeEach(() => {
    vi.mocked(emitTo).mockReset().mockResolvedValue(undefined);
    vi.mocked(listen).mockReset();
    vi.mocked(layoutSwitcherService.saveSnapshot).mockClear();
    vi.mocked(layoutSwitcherService.saveState).mockClear();
    vi.mocked(layoutSwitcherService.getState).mockReset()
      .mockResolvedValue({ windowX: null, windowY: null, pinned: false });
    switchLayout.mockReset();
    resetPanesState();
  });

  it("挂载时发出初始快照：当前布局用实时 rootPane，starred 布局 session 为空", async () => {
    mockEventListeners();
    renderHook(() => useLayoutSwitcherSync());

    const snapshot = lastEmittedSnapshot();
    expect(snapshot.currentLayoutId).toBe("layout-1");
    expect(snapshot.layouts.map((l) => l.id)).toEqual(["layout-1", "layout-2", "layout-star"]);

    // 当前布局取 state.rootPane（实时），而不是 layouts 里的陈旧副本
    expect(snapshot.layouts[0]!.paneSessionIds).toEqual([["sess-live"]]);
    // 非当前布局取各自 rootPane，null sessionId 被过滤
    expect(snapshot.layouts[1]!.paneSessionIds).toEqual([["sess-other"]]);
    // starred 布局不收集 session
    expect(snapshot.layouts[2]!.paneSessionIds).toEqual([]);

    expect(vi.mocked(emitTo).mock.calls[0]![0]).toBe("layout-switcher");
    expect(layoutSwitcherService.saveSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it("request-state 事件触发重新发快照", async () => {
    const listeners = mockEventListeners();
    renderHook(() => useLayoutSwitcherSync());
    await waitFor(() => expect(listeners.has("layout-switcher:request-state")).toBe(true));
    const before = vi.mocked(emitTo).mock.calls.length;

    await act(async () => {
      await listeners.get("layout-switcher:request-state")?.({ payload: {} });
    });

    expect(vi.mocked(emitTo).mock.calls.length).toBeGreaterThan(before);
  });

  it("switch 事件调用 switchLayout；缺 layoutId 时不调用", async () => {
    const listeners = mockEventListeners();
    renderHook(() => useLayoutSwitcherSync());
    await waitFor(() => expect(listeners.has("layout-switcher:switch")).toBe(true));

    await act(async () => {
      await listeners.get("layout-switcher:switch")?.({ payload: { layoutId: "layout-2" } });
    });
    expect(switchLayout).toHaveBeenCalledWith("layout-2");

    switchLayout.mockClear();
    await act(async () => {
      await listeners.get("layout-switcher:switch")?.({ payload: {} });
    });
    expect(switchLayout).not.toHaveBeenCalled();
  });

  it("挂载时若浮窗处于 pinned 状态则重置为未固定", async () => {
    mockEventListeners();
    vi.mocked(layoutSwitcherService.getState)
      .mockResolvedValue({ windowX: 10, windowY: 20, pinned: true });

    renderHook(() => useLayoutSwitcherSync());

    await waitFor(() =>
      expect(layoutSwitcherService.saveState).toHaveBeenCalledWith({
        windowX: 10,
        windowY: 20,
        pinned: false,
      })
    );
  });

  it("pinned=false 时不写回状态", async () => {
    mockEventListeners();
    renderHook(() => useLayoutSwitcherSync());
    await waitFor(() => expect(layoutSwitcherService.getState).toHaveBeenCalled());
    expect(layoutSwitcherService.saveState).not.toHaveBeenCalled();
  });

  it("panes store 变更触发快照同步", async () => {
    mockEventListeners();
    renderHook(() => useLayoutSwitcherSync());
    const before = vi.mocked(emitTo).mock.calls.length;

    act(() => {
      usePanesStore.setState({ currentLayoutId: "layout-2" });
    });

    expect(vi.mocked(emitTo).mock.calls.length).toBeGreaterThan(before);
    expect(lastEmittedSnapshot().currentLayoutId).toBe("layout-2");
  });

  it("卸载后取消 store 订阅与事件监听", async () => {
    const listeners = mockEventListeners();
    const { unmount } = renderHook(() => useLayoutSwitcherSync());
    await waitFor(() => expect(listeners.size).toBe(2));

    unmount();
    expect(listeners.size).toBe(0);

    const before = vi.mocked(emitTo).mock.calls.length;
    act(() => {
      usePanesStore.setState({ currentLayoutId: "layout-2" });
    });
    expect(vi.mocked(emitTo).mock.calls.length).toBe(before);
  });

  it("非 Tauri 运行时完全不订阅", () => {
    const internals = window.__TAURI_INTERNALS__;
    delete window.__TAURI_INTERNALS__;
    try {
      mockEventListeners();
      renderHook(() => useLayoutSwitcherSync());
      expect(emitTo).not.toHaveBeenCalled();
      expect(listen).not.toHaveBeenCalled();
    } finally {
      window.__TAURI_INTERNALS__ = internals;
    }
  });
});
