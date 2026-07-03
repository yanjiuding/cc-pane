import "@/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RecentChangesPanel from "./RecentChangesPanel";
import type { RecentChange, WorktreeRecentChange } from "@/services";

function makeChange(overrides?: Partial<RecentChange>): RecentChange {
  return {
    filePath: "/tmp/proj/src/main.rs",
    versionId: "v1",
    timestamp: new Date().toISOString(),
    size: 1024,
    hash: "abc123",
    labelName: null,
    branch: "main",
    ...overrides,
  };
}

const PROJECT = "/tmp/proj";

describe("RecentChangesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("加载中显示 loading 文案", async () => {
    let resolveChanges: (v: RecentChange[]) => void = () => {};
    const pending = new Promise<RecentChange[]>((resolve) => {
      resolveChanges = resolve;
    });
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_recent_changes") return pending;
      return Promise.resolve([]);
    });

    render(
      <RecentChangesPanel
        open
        onOpenChange={vi.fn()}
        projectPath={PROJECT}
        onOpenFileHistory={vi.fn()}
      />,
    );

    expect(await screen.findByText(/加载中|Loading/i)).toBeInTheDocument();
    resolveChanges([]);
    await waitFor(() =>
      expect(screen.getByText(/暂无变更记录|No changes/i)).toBeInTheDocument(),
    );
  });

  it("无变更时显示空态", async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    render(
      <RecentChangesPanel
        open
        onOpenChange={vi.fn()}
        projectPath={PROJECT}
        onOpenFileHistory={vi.fn()}
      />,
    );

    expect(await screen.findByText(/暂无变更记录|No changes/i)).toBeInTheDocument();
  });

  it("渲染变更列表条目（文件名与分支）", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_recent_changes") {
        return Promise.resolve([
          makeChange({ filePath: "/tmp/proj/src/app.tsx", branch: "feature/x" }),
        ]);
      }
      return Promise.resolve([]);
    });

    render(
      <RecentChangesPanel
        open
        onOpenChange={vi.fn()}
        projectPath={PROJECT}
        onOpenFileHistory={vi.fn()}
      />,
    );

    expect(await screen.findByText("app.tsx")).toBeInTheDocument();
    expect(screen.getByText("feature/x")).toBeInTheDocument();
  });

  it("点击条目回调文件历史并关闭面板", async () => {
    const user = userEvent.setup();
    const onOpenFileHistory = vi.fn();
    const onOpenChange = vi.fn();
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_recent_changes") {
        return Promise.resolve([makeChange({ filePath: "/tmp/proj/src/hit.ts" })]);
      }
      return Promise.resolve([]);
    });

    render(
      <RecentChangesPanel
        open
        onOpenChange={onOpenChange}
        projectPath={PROJECT}
        onOpenFileHistory={onOpenFileHistory}
      />,
    );

    await user.click(await screen.findByText("hit.ts"));

    expect(onOpenFileHistory).toHaveBeenCalledWith("/tmp/proj/src/hit.ts");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("点击刷新按钮重新拉取变更", async () => {
    const user = userEvent.setup();
    vi.mocked(invoke).mockResolvedValue([]);
    render(
      <RecentChangesPanel
        open
        onOpenChange={vi.fn()}
        projectPath={PROJECT}
        onOpenFileHistory={vi.fn()}
      />,
    );

    await screen.findByText(/暂无变更记录|No changes/i);
    const before = vi.mocked(invoke).mock.calls.filter((c) => c[0] === "get_recent_changes").length;

    // 刷新按钮含 RefreshCw 图标（.lucide-refresh-cw）
    const refreshBtn = screen
      .getAllByRole("button")
      .find((b) => b.querySelector(".lucide-refresh-cw"));
    expect(refreshBtn).toBeDefined();
    await user.click(refreshBtn!);

    await waitFor(() => {
      const after = vi.mocked(invoke).mock.calls.filter((c) => c[0] === "get_recent_changes").length;
      expect(after).toBeGreaterThan(before);
    });
  });

  it("切换到全部 Worktree 模式后拉取并分组渲染", async () => {
    const user = userEvent.setup();
    const worktreeChanges: WorktreeRecentChange[] = [
      {
        worktreePath: "/tmp/proj",
        worktreeBranch: "main",
        isMain: true,
        change: makeChange({ filePath: "/tmp/proj/src/root.ts" }),
      },
    ];
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_worktree_recent_changes") return Promise.resolve(worktreeChanges);
      return Promise.resolve([]);
    });

    render(
      <RecentChangesPanel
        open
        onOpenChange={vi.fn()}
        projectPath={PROJECT}
        onOpenFileHistory={vi.fn()}
      />,
    );

    // 空态先出现（默认非 worktree 模式）
    await screen.findByText(/暂无变更记录|No changes/i);
    // 切换所有 worktree 的按钮含 FolderGit2 图标（.lucide-folder-git-2）
    const toggleBtn = screen
      .getAllByRole("button")
      .find((b) => b.querySelector(".lucide-folder-git-2"));
    expect(toggleBtn).toBeDefined();
    await user.click(toggleBtn!);

    expect(await screen.findByText("root.ts")).toBeInTheDocument();
    // 精确匹配主仓库徽标，避免命中分支名 "main"
    expect(screen.getByText("主仓库")).toBeInTheDocument();
  });

  it("拉取失败时静默处理并显示空态", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_recent_changes") return Promise.reject(new Error("boom"));
      return Promise.resolve([]);
    });

    render(
      <RecentChangesPanel
        open
        onOpenChange={vi.fn()}
        projectPath={PROJECT}
        onOpenFileHistory={vi.fn()}
      />,
    );

    expect(await screen.findByText(/暂无变更记录|No changes/i)).toBeInTheDocument();
  });
});
