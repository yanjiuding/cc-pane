import "@/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SelfChatPanel from "./SelfChatPanel";

// 隔离 SelfChatManager，只测试 SelfChatPanel 包装层（标题 + 子组件挂载 + open 门控）。
vi.mock("@/components/selfchat", () => ({
  SelfChatManager: () => <div data-testid="selfchat-manager">selfchat-manager-stub</div>,
}));

describe("SelfChatPanel", () => {
  it("open 为 false 时不渲染标题与内容", () => {
    render(<SelfChatPanel open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByText(/CC-Panes 助手|CC-Panes Assistant/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("selfchat-manager")).not.toBeInTheDocument();
  });

  it("open 为 true 时渲染标题并挂载 SelfChatManager", () => {
    render(<SelfChatPanel open onOpenChange={vi.fn()} />);
    expect(screen.getByText(/CC-Panes 助手|CC-Panes Assistant/i)).toBeInTheDocument();
    expect(screen.getByTestId("selfchat-manager")).toBeInTheDocument();
  });

  it("以 dialog 角色呈现，可被辅助技术识别", () => {
    render(<SelfChatPanel open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
