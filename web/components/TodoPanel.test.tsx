import "@/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TodoPanel from "./TodoPanel";

// 隔离子组件 TodoManager，只测试 TodoPanel 包装层自身逻辑
// （标题、scope Badge 文案、子组件是否挂载 + 收到正确 props）。
vi.mock("@/components/todo/TodoManager", () => ({
  default: ({ scope, scopeRef }: { scope: string; scopeRef: string }) => (
    <div data-testid="todo-manager" data-scope={scope} data-scope-ref={scopeRef}>
      todo-manager-stub
    </div>
  ),
}));

describe("TodoPanel", () => {
  it("open 为 false 时不渲染标题与内容", () => {
    render(<TodoPanel open={false} onOpenChange={vi.fn()} scope="workspace" scopeRef="ws-1" />);
    expect(screen.queryByText(/TodoList/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("todo-manager")).not.toBeInTheDocument();
  });

  it("open 为 true 时渲染标题并挂载 TodoManager，透传 scope/scopeRef", () => {
    render(<TodoPanel open onOpenChange={vi.fn()} scope="workspace" scopeRef="ws-1" />);
    expect(screen.getByText(/TodoList/i)).toBeInTheDocument();
    const manager = screen.getByTestId("todo-manager");
    expect(manager).toHaveAttribute("data-scope", "workspace");
    expect(manager).toHaveAttribute("data-scope-ref", "ws-1");
  });

  it("scope + scopeRef 同时存在时渲染 scope Badge（workspace → 工作空间|Workspace）", () => {
    render(<TodoPanel open onOpenChange={vi.fn()} scope="workspace" scopeRef="my-ws" />);
    expect(screen.getByText(/(工作空间|Workspace):\s*my-ws/i)).toBeInTheDocument();
  });

  it("scope 为空时不渲染 Badge", () => {
    render(<TodoPanel open onOpenChange={vi.fn()} scope="" scopeRef="" />);
    // 没有 "xxx: ref" 形式的 Badge
    expect(screen.queryByText(/:\s*my-ws/)).not.toBeInTheDocument();
    expect(screen.getByTestId("todo-manager")).toBeInTheDocument();
  });

  it("未知 scope 直接回落显示 scope 原文", () => {
    render(<TodoPanel open onOpenChange={vi.fn()} scope="custom_scope" scopeRef="ref-x" />);
    expect(screen.getByText(/custom_scope:\s*ref-x/)).toBeInTheDocument();
  });
});
