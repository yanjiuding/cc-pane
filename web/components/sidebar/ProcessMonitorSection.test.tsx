import "@/i18n";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import ProcessMonitorSection from "./ProcessMonitorSection";
import { useProcessMonitorStore } from "@/stores";
import type { ClaudeProcess, ProcessScanResult } from "@/types";

// Radix Tooltip 内部依赖 ResizeObserver，jsdom 不提供，需自行 polyfill
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver ?? (ResizeObserverStub as unknown as typeof ResizeObserver);

function makeProcess(overrides: Partial<ClaudeProcess> = {}): ClaudeProcess {
  return {
    pid: 1000,
    parentPid: null,
    name: "claude",
    command: "claude --resume",
    cwd: "D:/workspace/api",
    memoryBytes: 100 * 1024 * 1024,
    startTime: Math.floor(Date.now() / 1000) - 120,
    processType: "claude_cli",
    ...overrides,
  };
}

function makeScanResult(processes: ClaudeProcess[]): ProcessScanResult {
  return {
    processes,
    totalCount: processes.length,
    totalMemoryBytes: processes.reduce((s, p) => s + p.memoryBytes, 0),
    scannedAt: new Date().toISOString(),
  };
}

const actions = {
  scan: vi.fn(async () => {}),
  killProcess: vi.fn(async () => true),
  killSelected: vi.fn(async () => {}),
  killAll: vi.fn(async () => {}),
  toggleSelect: vi.fn(),
  startAutoRefresh: vi.fn(),
  stopAutoRefresh: vi.fn(),
};

function setStore(partial: Partial<ReturnType<typeof useProcessMonitorStore.getState>>) {
  useProcessMonitorStore.setState({
    scanResult: null,
    scanning: false,
    killing: new Set<number>(),
    selectedPids: new Set<number>(),
    ...actions,
    ...partial,
  });
}

function renderSection() {
  return render(
    <TooltipProvider>
      <ProcessMonitorSection />
    </TooltipProvider>,
  );
}

describe("ProcessMonitorSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStore({});
  });

  it("挂载时启动自动刷新，卸载时停止", () => {
    const { unmount } = renderSection();
    expect(actions.startAutoRefresh).toHaveBeenCalledTimes(1);
    unmount();
    expect(actions.stopAutoRefresh).toHaveBeenCalledTimes(1);
  });

  it("无进程且未扫描时显示空态提示", () => {
    setStore({ scanResult: makeScanResult([]) });
    renderSection();
    expect(screen.getByText("未发现 Claude 进程")).toBeVisible();
  });

  it("无进程且正在扫描时显示扫描中提示", () => {
    setStore({ scanResult: makeScanResult([]), scanning: true });
    renderSection();
    expect(screen.getByText("扫描中…")).toBeVisible();
  });

  it("有进程时按 cwd 分组渲染文件夹名与进程条目", () => {
    setStore({
      scanResult: makeScanResult([
        makeProcess({ pid: 1, name: "claude-one", cwd: "D:/workspace/api" }),
        makeProcess({ pid: 2, name: "claude-two", cwd: "D:/workspace/api" }),
        makeProcess({ pid: 3, name: "node-worker", cwd: "/home/dev/web", processType: "claude_node" }),
      ]),
    });
    renderSection();

    // 分组文件夹名
    expect(screen.getByText("api")).toBeVisible();
    expect(screen.getByText("web")).toBeVisible();
    // 进程名
    expect(screen.getByText("claude-one")).toBeVisible();
    expect(screen.getByText("node-worker")).toBeVisible();
    // 总数标题
    expect(screen.getByText(/\(3 · /)).toBeVisible();
  });

  it("cwd 为空的进程归入 (unknown) 分组", () => {
    setStore({
      scanResult: makeScanResult([makeProcess({ pid: 9, name: "orphan", cwd: null })]),
    });
    renderSection();
    expect(screen.getByText("(unknown)")).toBeVisible();
  });

  it("点击刷新按钮调用 scan", async () => {
    const user = userEvent.setup();
    setStore({ scanResult: makeScanResult([makeProcess()]) });
    renderSection();

    // 标题栏总有刷新按钮；scan 在挂载后按钮点击时应再被调用
    const refreshBtn = document.querySelector("button .lucide-refresh-cw")?.closest("button");
    expect(refreshBtn).toBeTruthy();
    await user.click(refreshBtn as HTMLElement);
    expect(actions.scan).toHaveBeenCalled();
  });

  it("勾选进程复选框调用 toggleSelect", async () => {
    const user = userEvent.setup();
    setStore({ scanResult: makeScanResult([makeProcess({ pid: 77, name: "claude-x" })]) });
    renderSection();

    await user.click(screen.getByRole("checkbox"));
    expect(actions.toggleSelect).toHaveBeenCalledWith(77);
  });

  it("有选中进程时显示批量终止入口并弹出确认框", async () => {
    const user = userEvent.setup();
    setStore({
      scanResult: makeScanResult([makeProcess({ pid: 5 }), makeProcess({ pid: 6 })]),
      selectedPids: new Set<number>([5]),
    });
    renderSection();

    // Trash2 图标按钮：终止选中
    const killSelectedBtn = document.querySelector("button .lucide-trash-2")?.closest("button");
    expect(killSelectedBtn).toBeTruthy();
    await user.click(killSelectedBtn as HTMLElement);

    expect(await screen.findByText(/确定终止 1 个进程？/)).toBeVisible();
  });

  it("确认终止选中进程调用 killSelected", async () => {
    const user = userEvent.setup();
    setStore({
      scanResult: makeScanResult([makeProcess({ pid: 5 })]),
      selectedPids: new Set<number>([5]),
    });
    renderSection();

    const killSelectedBtn = document.querySelector("button .lucide-trash-2")?.closest("button");
    await user.click(killSelectedBtn as HTMLElement);

    const confirmPanel = (await screen.findByText(/确定终止/)).closest("div")?.parentElement as HTMLElement;
    await user.click(within(confirmPanel).getByRole("button", { name: "确认" }));

    await waitFor(() => expect(actions.killSelected).toHaveBeenCalledTimes(1));
  });

  it("确认终止全部进程调用 killAll", async () => {
    const user = userEvent.setup();
    setStore({ scanResult: makeScanResult([makeProcess({ pid: 5 }), makeProcess({ pid: 6 })]) });
    renderSection();

    const killAllBtn = document.querySelector("button .lucide-triangle-alert")?.closest("button");
    expect(killAllBtn).toBeTruthy();
    await user.click(killAllBtn as HTMLElement);

    expect(await screen.findByText(/确定终止 2 个进程？/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "确认" }));
    await waitFor(() => expect(actions.killAll).toHaveBeenCalledTimes(1));
  });

  it("确认框取消按钮关闭确认框且不调用 kill", async () => {
    const user = userEvent.setup();
    setStore({ scanResult: makeScanResult([makeProcess({ pid: 6 })]) });
    renderSection();

    const killAllBtn = document.querySelector("button .lucide-triangle-alert")?.closest("button");
    await user.click(killAllBtn as HTMLElement);
    await screen.findByText(/确定终止/);

    await user.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByText(/确定终止/)).not.toBeInTheDocument());
    expect(actions.killAll).not.toHaveBeenCalled();
  });

  it("按 Escape 关闭确认框", async () => {
    const user = userEvent.setup();
    setStore({ scanResult: makeScanResult([makeProcess({ pid: 6 })]) });
    renderSection();

    const killAllBtn = document.querySelector("button .lucide-triangle-alert")?.closest("button");
    await user.click(killAllBtn as HTMLElement);
    await screen.findByText(/确定终止/);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText(/确定终止/)).not.toBeInTheDocument());
  });

  it("点击进程行的关闭按钮调用 killProcess", async () => {
    const user = userEvent.setup();
    setStore({ scanResult: makeScanResult([makeProcess({ pid: 321, name: "claude-kill" })]) });
    renderSection();

    // 进程行内的 X 按钮（lucide-x），排除标题区
    const xBtn = document.querySelector("button .lucide-x")?.closest("button");
    expect(xBtn).toBeTruthy();
    await user.click(xBtn as HTMLElement);
    expect(actions.killProcess).toHaveBeenCalledWith(321);
  });

  it("折叠区域标题后隐藏进程列表", async () => {
    const user = userEvent.setup();
    setStore({ scanResult: makeScanResult([makeProcess({ pid: 8, name: "claude-collapse" })]) });
    renderSection();

    expect(screen.getByText("claude-collapse")).toBeVisible();
    await user.click(screen.getByText("System Processes"));
    expect(screen.queryByText("claude-collapse")).not.toBeInTheDocument();
  });
});
