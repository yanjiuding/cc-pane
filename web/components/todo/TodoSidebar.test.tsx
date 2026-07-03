import "@/i18n";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TodoSidebar from "./TodoSidebar";

function renderSidebar(overrides: Partial<Parameters<typeof TodoSidebar>[0]> = {}) {
  const props = {
    viewMode: "all" as const,
    activeScope: null,
    onViewModeChange: vi.fn(),
    onScopeChange: vi.fn(),
    ...overrides,
  };
  render(<TodoSidebar {...props} />);
  return props;
}

describe("TodoSidebar", () => {
  it("渲染主视图与作用域两个分区的全部导航项", () => {
    renderSidebar();

    expect(screen.getByText("主视图")).toBeVisible();
    expect(screen.getByText("作用域")).toBeVisible();
    expect(screen.getByText("全部任务")).toBeVisible();
    expect(screen.getByText("我的一天")).toBeVisible();
    expect(screen.getByText("全局")).toBeVisible();
    expect(screen.getByText("工作空间")).toBeVisible();
    expect(screen.getByText("项目")).toBeVisible();
    expect(screen.getByText("外部")).toBeVisible();
    expect(screen.getByText("脚本")).toBeVisible();
  });

  it("全部任务：viewMode=all 且 scope=null 时高亮", () => {
    renderSidebar({ viewMode: "all", activeScope: null });

    const allTasks = screen.getByText("全部任务").closest("button")!;
    expect(allTasks.className).toContain("bg-primary/15");
  });

  it("点击全部任务同时切换 viewMode=all 与 scope=null", () => {
    const props = renderSidebar({ viewMode: "my_day", activeScope: "project" });

    fireEvent.click(screen.getByText("全部任务"));

    expect(props.onViewModeChange).toHaveBeenCalledWith("all");
    expect(props.onScopeChange).toHaveBeenCalledWith(null);
  });

  it("点击我的一天只切换 viewMode，不触碰 scope", () => {
    const props = renderSidebar();

    fireEvent.click(screen.getByText("我的一天"));

    expect(props.onViewModeChange).toHaveBeenCalledWith("my_day");
    expect(props.onScopeChange).not.toHaveBeenCalled();
  });

  it("点击作用域项切回 all 视图并设置对应 scope", () => {
    const props = renderSidebar({ viewMode: "my_day" });

    fireEvent.click(screen.getByText("脚本"));

    expect(props.onViewModeChange).toHaveBeenCalledWith("all");
    expect(props.onScopeChange).toHaveBeenCalledWith("temp_script");
  });

  it("my_day 视图下作用域项不高亮（active 需要 viewMode=all）", () => {
    renderSidebar({ viewMode: "my_day", activeScope: "global" });

    const globalItem = screen.getByText("全局").closest("button")!;
    expect(globalItem.className).not.toContain("bg-primary/15");
    const myDay = screen.getByText("我的一天").closest("button")!;
    expect(myDay.className).toContain("bg-primary/15");
  });
});
