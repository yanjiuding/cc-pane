import "@/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LayoutSwitcherWindow from "./LayoutSwitcherWindow";
import { useTerminalStatusStore } from "@/stores";
import type { LayoutSwitcherSnapshot } from "@/services/layoutSwitcherService";

// getCurrentWindow / PhysicalPosition are not mocked globally in setup.ts, so
// the window API must be stubbed here (the component drags/moves the popup window).
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    onMoved: vi.fn(() => Promise.resolve(() => {})),
    scaleFactor: vi.fn(() => Promise.resolve(1)),
    outerPosition: vi.fn(() => Promise.resolve({ x: 0, y: 0 })),
    setPosition: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  })),
  PhysicalPosition: class {
    constructor(public x: number, public y: number) {}
  },
}));

const SWITCH_EVENT = "layout-switcher:switch";

function buildSnapshot(overrides?: Partial<LayoutSwitcherSnapshot>): LayoutSwitcherSnapshot {
  return {
    currentLayoutId: "l1",
    layouts: [
      { id: "l1", name: "布局甲", kind: "normal", paneSessionIds: [["s1"]] },
      { id: "l2", name: "布局乙", kind: "normal", paneSessionIds: [["s2"], ["s3"]] },
      { id: "star", name: "星标布局", kind: "starred", paneSessionIds: [] },
    ],
    ...overrides,
  };
}

/**
 * 配置 invoke，让 getSnapshot / init 等后台调用返回受控数据。
 * snapshot 为 null 表示无持久化快照（空态）。
 */
function mockInvoke(snapshot: LayoutSwitcherSnapshot | null): void {
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    switch (cmd) {
      case "get_layout_switcher_snapshot":
        return Promise.resolve(snapshot ? JSON.stringify(snapshot) : null);
      case "get_layout_switcher_state":
        return Promise.resolve({ windowX: null, windowY: null, pinned: true });
      case "get_all_terminal_status":
        return Promise.resolve([]);
      case "close_layout_switcher_window":
      case "save_layout_switcher_state":
        return Promise.resolve(null);
      default:
        return Promise.resolve(null);
    }
  });
}

describe("LayoutSwitcherWindow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // setup.ts 的 emitTo mock 默认返回 undefined，组件对其结果调用 .catch()，需返回 Promise
    vi.mocked(emitTo).mockResolvedValue(undefined);
    useTerminalStatusStore.setState({ statusMap: new Map(), _initialized: false });
  });

  afterEach(() => {
    useTerminalStatusStore.getState().cleanup();
  });

  it("空快照时只渲染标题和关闭按钮，无布局行", async () => {
    mockInvoke(null);
    render(<LayoutSwitcherWindow />);

    expect(screen.getByText(/布局切换|Layout Switcher/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /关闭布局浮窗|Close Layout Window/i }),
    ).toBeInTheDocument();
    // 无任何布局渲染
    expect(screen.queryByRole("button", { name: "布局甲" })).not.toBeInTheDocument();
  });

  it("从持久化快照加载并渲染全部布局行", async () => {
    mockInvoke(buildSnapshot());
    render(<LayoutSwitcherWindow />);

    expect(await screen.findByRole("button", { name: "布局甲" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "布局乙" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "星标布局" })).toBeInTheDocument();
  });

  it("当前布局显示选中勾选图标", async () => {
    mockInvoke(buildSnapshot({ currentLayoutId: "l1" }));
    const { container } = render(<LayoutSwitcherWindow />);

    const selected = await screen.findByRole("button", { name: "布局甲" });
    // lucide Check 图标渲染为带 lucide-check class 的 svg
    expect(selected.querySelector(".lucide-check")).not.toBeNull();
    // 非选中布局不含勾选
    const other = screen.getByRole("button", { name: "布局乙" });
    expect(other.querySelector(".lucide-check")).toBeNull();
    expect(container).toBeTruthy();
  });

  it("点击布局行通过 emitTo 向 main 发送切换事件", async () => {
    const user = userEvent.setup();
    mockInvoke(buildSnapshot());
    render(<LayoutSwitcherWindow />);

    await user.click(await screen.findByRole("button", { name: "布局乙" }));

    expect(emitTo).toHaveBeenCalledWith("main", SWITCH_EVENT, { layoutId: "l2" });
  });

  it("点击关闭按钮调用后端关闭浮窗命令", async () => {
    const user = userEvent.setup();
    mockInvoke(buildSnapshot());
    render(<LayoutSwitcherWindow />);

    await screen.findByRole("button", { name: "布局甲" });
    await user.click(
      screen.getByRole("button", { name: /关闭布局浮窗|Close Layout Window/i }),
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("close_layout_switcher_window");
    });
  });

  it("getSnapshot 失败时不崩溃且保持空态", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_layout_switcher_snapshot") {
        return Promise.reject(new Error("snapshot boom"));
      }
      if (cmd === "get_all_terminal_status") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    render(<LayoutSwitcherWindow />);

    expect(await screen.findByText(/布局切换|Layout Switcher/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "布局甲" })).not.toBeInTheDocument();
  });
});
