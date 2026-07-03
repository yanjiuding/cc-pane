import "@/i18n";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getVersion } from "@tauri-apps/api/app";
import packageJson from "../../../package.json";
import { historyService } from "@/services/historyService";
import { isTauriRuntime } from "@/services/runtime";
import { useActivityBarStore } from "@/stores/useActivityBarStore";
import type { LaunchRecord } from "@/services";
import HomeDashboard from "./HomeDashboard";

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(),
}));

vi.mock("@/services/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/runtime")>();
  return { ...actual, isTauriRuntime: vi.fn(() => false) };
});

// 子组件均有独立测试，这里桩化以聚焦 Dashboard 的编排逻辑
vi.mock("./HomeHeader", () => ({
  default: ({ version }: { version: string }) => (
    <div data-testid="header">{version}</div>
  ),
}));
vi.mock("./HomeQuickActions", () => ({
  default: ({ onNewTerminal }: { onNewTerminal: () => void }) => (
    <button data-testid="quick-actions" onClick={onNewTerminal} />
  ),
}));
vi.mock("./HomeRecentProjects", () => ({
  default: ({ records }: { records: LaunchRecord[] }) => (
    <div data-testid="recent">{records.length}</div>
  ),
}));
vi.mock("./HomeActiveSessions", () => ({ default: () => null }));
vi.mock("./HomeEnvironment", () => ({ default: () => null }));
vi.mock("./HomeUsageStats", () => ({ default: () => null }));
vi.mock("./HomeShortcuts", () => ({ default: () => null }));

const RECORD = { id: 1 } as unknown as LaunchRecord;

describe("HomeDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isTauriRuntime).mockReturnValue(false);
    vi.spyOn(historyService, "list").mockResolvedValue([RECORD]);
    useActivityBarStore.setState({ appViewMode: "home" });
  });

  it("非 Tauri 环境使用 package.json 版本并加载启动历史", async () => {
    render(<HomeDashboard onOpenTerminal={vi.fn()} />);

    expect(await screen.findByText(packageJson.version)).toBeInTheDocument();
    expect(historyService.list).toHaveBeenCalledWith(20);
    expect((await screen.findByTestId("recent")).textContent).toBe("1");
  });

  it("Tauri 环境从 getVersion 取版本号", async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(true);
    vi.mocked(getVersion).mockResolvedValue("9.9.9");
    render(<HomeDashboard onOpenTerminal={vi.fn()} />);

    expect(await screen.findByText("9.9.9")).toBeInTheDocument();
    expect(historyService.list).toHaveBeenCalledWith(20);
  });

  it("getVersion 失败时保留占位版本但仍加载历史", async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(true);
    vi.mocked(getVersion).mockRejectedValue(new Error("no ipc"));
    render(<HomeDashboard onOpenTerminal={vi.fn()} />);

    expect((await screen.findByTestId("recent")).textContent).toBe("1");
    expect(screen.getByTestId("header").textContent).toBe("...");
  });

  it("history-updated 事件触发重新加载历史", async () => {
    render(<HomeDashboard onOpenTerminal={vi.fn()} />);
    await screen.findByTestId("recent");
    expect(historyService.list).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("cc-panes:history-updated"));
    });

    expect(historyService.list).toHaveBeenCalledTimes(2);
  });

  it("点击进入工作区切换到 panes 视图", async () => {
    render(<HomeDashboard onOpenTerminal={vi.fn()} />);
    await screen.findByTestId("recent");

    fireEvent.click(screen.getByText("进入工作区"));

    expect(useActivityBarStore.getState().appViewMode).toBe("panes");
  });

  it("快速操作的新建终端回调切换到 panes 视图", async () => {
    render(<HomeDashboard onOpenTerminal={vi.fn()} />);
    await screen.findByTestId("recent");

    fireEvent.click(screen.getByTestId("quick-actions"));

    expect(useActivityBarStore.getState().appViewMode).toBe("panes");
  });
});
