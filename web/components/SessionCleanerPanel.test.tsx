import "@/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SessionCleanerPanel from "./SessionCleanerPanel";
import { claudeService, type BrokenSession, type CleanResult } from "@/services/claudeService";

// jsdom 缺少 ResizeObserver，Radix Dialog(resizable) 依赖它
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver ?? (ResizeObserverStub as unknown as typeof ResizeObserver);

vi.mock("@/services/claudeService", () => ({
  claudeService: {
    scanBrokenSessions: vi.fn(),
    cleanSessionFile: vi.fn(),
    cleanAllBrokenSessions: vi.fn(),
  },
}));

function brokenSession(overrides: Partial<BrokenSession> = {}): BrokenSession {
  return {
    id: "s1",
    file_path: "/home/user/.claude/projects/repo/abc.jsonl",
    project_path: "/home/user/repo",
    thinking_blocks: 3,
    file_size: 2048,
    ...overrides,
  };
}

function cleanResult(overrides: Partial<CleanResult> = {}): CleanResult {
  return {
    file_path: "/home/user/.claude/projects/repo/abc.jsonl",
    removed_blocks: 3,
    success: true,
    error: null,
    ...overrides,
  };
}

const noop = () => {};

describe("SessionCleanerPanel", () => {
  beforeEach(() => {
    vi.mocked(claudeService.scanBrokenSessions).mockReset();
    vi.mocked(claudeService.cleanSessionFile).mockReset();
    vi.mocked(claudeService.cleanAllBrokenSessions).mockReset();
  });

  it("关闭时不渲染对话框内容", () => {
    vi.mocked(claudeService.scanBrokenSessions).mockResolvedValue([]);
    render(<SessionCleanerPanel open={false} onOpenChange={noop} />);
    expect(screen.queryByText(/会话修复/)).not.toBeInTheDocument();
  });

  it("打开时扫描并在无问题时显示提示", async () => {
    vi.mocked(claudeService.scanBrokenSessions).mockResolvedValue([]);
    render(<SessionCleanerPanel open onOpenChange={noop} />);

    expect(await screen.findByText(/未发现含有 thinking 块|No .* found/i)).toBeInTheDocument();
    expect(claudeService.scanBrokenSessions).toHaveBeenCalledWith(undefined);
  });

  it("传入 projectPath 时标题带项目名且扫描携带路径", async () => {
    vi.mocked(claudeService.scanBrokenSessions).mockResolvedValue([]);
    render(<SessionCleanerPanel open onOpenChange={noop} projectPath="/home/user/my-repo" />);

    expect(await screen.findByText(/my-repo/)).toBeInTheDocument();
    expect(claudeService.scanBrokenSessions).toHaveBeenCalledWith("/home/user/my-repo");
  });

  it("扫描到损坏会话时列出文件与数量", async () => {
    vi.mocked(claudeService.scanBrokenSessions).mockResolvedValue([brokenSession()]);
    render(<SessionCleanerPanel open onOpenChange={noop} />);

    expect(await screen.findByText("abc.jsonl")).toBeInTheDocument();
    expect(screen.getByText("/home/user/repo")).toBeInTheDocument();
    expect(screen.getByText(/发现 1 个文件|Found 1/i)).toBeInTheDocument();
  });

  it("点击单个清理调用 cleanSessionFile 并重新扫描", async () => {
    const user = userEvent.setup();
    vi.mocked(claudeService.scanBrokenSessions)
      .mockResolvedValueOnce([brokenSession()])
      .mockResolvedValueOnce([]);
    vi.mocked(claudeService.cleanSessionFile).mockResolvedValue(cleanResult());

    render(<SessionCleanerPanel open onOpenChange={noop} />);
    await screen.findByText("abc.jsonl");

    await user.click(screen.getByRole("button", { name: /^清理$|^Clean$/i }));

    await waitFor(() =>
      expect(claudeService.cleanSessionFile).toHaveBeenCalledWith(
        "/home/user/.claude/projects/repo/abc.jsonl",
      ),
    );
    // 注意：cleanOne 设置结果后立即 await loadSessions()，而 loadSessions 开头会
    // setCleanResults([]) 清空结果，因此清理结果块不会持久展示（当前组件行为）。
    // 清理后重新扫描返回空列表 → 显示无问题提示。
    await waitFor(() => expect(claudeService.scanBrokenSessions).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/未发现含有 thinking 块|No .* found/i)).toBeInTheDocument();
  });

  it("点击全部清理调用 cleanAllBrokenSessions 并重新扫描", async () => {
    const user = userEvent.setup();
    vi.mocked(claudeService.scanBrokenSessions)
      .mockResolvedValueOnce([brokenSession()])
      .mockResolvedValueOnce([]);
    vi.mocked(claudeService.cleanAllBrokenSessions).mockResolvedValue([cleanResult()]);

    render(<SessionCleanerPanel open onOpenChange={noop} />);
    await screen.findByText("abc.jsonl");

    await user.click(screen.getByRole("button", { name: /全部清理|Clean All/i }));

    await waitFor(() =>
      expect(claudeService.cleanAllBrokenSessions).toHaveBeenCalledWith(undefined),
    );
    // 同上：cleanAll 后 await loadSessions() 会清空 cleanResults，结果块不持久展示。
    await waitFor(() => expect(claudeService.scanBrokenSessions).toHaveBeenCalledTimes(2));
  });

  it("扫描失败时静默降级为空列表并显示无问题提示", async () => {
    vi.mocked(claudeService.scanBrokenSessions).mockRejectedValue(new Error("scan failed"));
    render(<SessionCleanerPanel open onOpenChange={noop} />);
    expect(await screen.findByText(/未发现含有 thinking 块|No .* found/i)).toBeInTheDocument();
  });
});
