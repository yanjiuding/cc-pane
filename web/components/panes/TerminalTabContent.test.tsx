import "@/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Tab } from "@/types";
import TerminalTabContent from "./TerminalTabContent";

vi.mock("./TerminalView", () => ({
  default: vi.fn(() => <div data-testid="terminal-view" />),
}));

vi.mock("./SplitView", () => ({
  default: ({ children }: { children: React.ReactNode[] }) => <div>{children}</div>,
}));

function createTerminalTab(overrides?: Partial<Tab>): Tab {
  return {
    id: "tab-1",
    title: "project",
    contentType: "terminal",
    projectId: "project-1",
    projectPath: "/tmp/project",
    sessionId: null,
    terminalRootPane: {
      type: "leaf",
      id: "leaf-1",
      sessionId: null,
    },
    activeTerminalPaneId: "leaf-1",
    ...overrides,
  };
}

function renderTerminalTabContent(tab: Tab) {
  render(
    <TooltipProvider>
      <TerminalTabContent
        tab={tab}
        isActive
        onSessionCreated={vi.fn()}
        onSessionExited={vi.fn()}
        onTerminalRef={vi.fn()}
      />
    </TooltipProvider>,
  );
}

describe("TerminalTabContent", () => {
  it("shows launching overlay for a leaf without a session when a project is already selected", () => {
    renderTerminalTabContent(createTerminalTab());

    expect(screen.getByText("正在启动终端")).toBeVisible();
    expect(screen.getByText("请稍候，正在准备终端会话...")).toBeVisible();
    expect(screen.queryByText("从左侧选择一个项目以启动终端")).not.toBeInTheDocument();
  });

  it("hides ready overlay once the leaf has a session", () => {
    renderTerminalTabContent(
      createTerminalTab({
        sessionId: "session-1",
        terminalRootPane: {
          type: "leaf",
          id: "leaf-1",
          sessionId: "session-1",
        },
      }),
    );

    expect(screen.queryByText("准备就绪")).not.toBeInTheDocument();
  });

  it("hides ready overlay while a leaf is restoring", () => {
    renderTerminalTabContent(
      createTerminalTab({
        terminalRootPane: {
          type: "leaf",
          id: "leaf-1",
          sessionId: null,
          restoring: true,
        },
      }),
    );

    expect(screen.queryByText("准备就绪")).not.toBeInTheDocument();
  });

  it("shows the select-project hint only for an empty terminal tab", () => {
    renderTerminalTabContent(
      createTerminalTab({
        projectId: "",
        projectPath: "",
      }),
    );

    expect(screen.getByText("准备就绪")).toBeVisible();
    expect(screen.getByText("从左侧选择一个项目以启动终端")).toBeVisible();
    expect(screen.queryByText("正在启动终端")).not.toBeInTheDocument();
  });
});
