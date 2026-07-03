import "@/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ScanImportDialog from "./ScanImportDialog";
import type { ScannedRepo } from "@/services/workspaceService";

const REPOS: ScannedRepo[] = [
  {
    mainPath: "C:/repos/alpha",
    mainBranch: "main",
    worktrees: [{ path: "C:/repos/alpha-wt", branch: "feature" }],
  },
  {
    mainPath: "C:/repos/beta",
    mainBranch: "dev",
    worktrees: [],
  },
];
// totalPaths = (1 主 + 1 worktree) + (1 主 + 0) = 3

interface RenderOpts {
  repos?: ScannedRepo[];
  open?: boolean;
}

function renderDialog(opts: RenderOpts = {}) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ScanImportDialog
      open={opts.open ?? true}
      onOpenChange={onOpenChange}
      repos={opts.repos ?? REPOS}
      onConfirm={onConfirm}
    />,
  );
  return { onConfirm, onOpenChange };
}

function importButton() {
  return screen.getByRole("button", { name: /导入|Import/i });
}

describe("ScanImportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("open=false 时不渲染标题", () => {
    renderDialog({ open: false });
    expect(screen.queryByText(/扫描结果|Scan Results/i)).not.toBeInTheDocument();
  });

  it("渲染扫描汇总（仓库数与总项目数）", () => {
    renderDialog();
    expect(screen.getByText(/发现 2 .*3|2 repositor.*3/i)).toBeInTheDocument();
  });

  it("打开时默认全选并展开所有仓库", () => {
    renderDialog();
    // 计数徽标 3/3
    expect(screen.getByText("3/3")).toBeInTheDocument();
    // 展开时 worktree 可见
    expect(screen.getByText("alpha-wt")).toBeInTheDocument();
    // 导入按钮显示选中数量且可用
    expect(importButton()).toBeEnabled();
    expect(importButton()).toHaveTextContent(/3/);
  });

  it("点击全选行可取消全选，导入按钮禁用", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText(/取消全选|Deselect All/i));
    expect(screen.getByText("0/3")).toBeInTheDocument();
    expect(importButton()).toBeDisabled();
  });

  it("确认导入以全部选中路径回调并关闭", async () => {
    const user = userEvent.setup();
    const { onConfirm, onOpenChange } = renderDialog();
    await user.click(importButton());

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const paths = onConfirm.mock.calls[0][0] as string[];
    expect(paths).toHaveLength(3);
    expect(paths).toEqual(
      expect.arrayContaining(["C:/repos/alpha", "C:/repos/alpha-wt", "C:/repos/beta"]),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("取消勾选单个 worktree 后导入统计减少且不含该路径", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    // 点击 worktree 行切换选中态
    await user.click(screen.getByText("alpha-wt"));
    expect(screen.getByText("2/3")).toBeInTheDocument();

    await user.click(importButton());
    const paths = onConfirm.mock.calls[0][0] as string[];
    expect(paths).toHaveLength(2);
    expect(paths).not.toContain("C:/repos/alpha-wt");
  });

  it("折叠仓库后其 worktree 从列表隐藏", async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(screen.getByText("alpha-wt")).toBeInTheDocument();
    // 点击带 worktree 数量的徽标（属于仓库头部，触发折叠）
    await user.click(screen.getByText(/\+1 wt/));
    expect(screen.queryByText("alpha-wt")).not.toBeInTheDocument();
  });

  it("仓库头部复选框可整仓取消勾选", async () => {
    const user = userEvent.setup();
    renderDialog();
    // 第一个仓库头部复选框：索引 1（索引 0 为全选框）
    const checkboxes = screen.getAllByRole("checkbox");
    // 取消 alpha 整仓（main + worktree 两条）
    await user.click(checkboxes[1]);
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("点击取消按钮触发 onOpenChange(false)", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    await user.click(screen.getByRole("button", { name: /取消|Cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("空扫描结果时导入按钮禁用且汇总为 0", () => {
    renderDialog({ repos: [] });
    expect(screen.getByText("0/0")).toBeInTheDocument();
    expect(importButton()).toBeDisabled();
  });
});
