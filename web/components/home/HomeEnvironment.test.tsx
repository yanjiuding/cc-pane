import "@/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { terminalService } from "@/services/terminalService";
import type { EnvironmentInfo } from "@/types";
import HomeEnvironment from "./HomeEnvironment";

const ENV_INFO: EnvironmentInfo = {
  node: { installed: true, version: "v22.1.0" },
  cliTools: [
    {
      id: "claude",
      displayName: "Claude Code",
      installed: true,
      version: "1.0.0",
    },
    {
      id: "codex",
      displayName: "Codex CLI",
      installed: false,
      version: null,
    },
  ] as EnvironmentInfo["cliTools"],
  claude: { installed: true, version: "1.0.0" },
  codex: { installed: false, version: null },
};

// 注意：组件有模块级缓存 cachedEnvInfo，成功一次后跨挂载复用。
// 本文件的用例顺序有意安排为 挂起 → 失败 → 成功 → 缓存复用，
// 前两个用例不会写入缓存，保证相互隔离。
describe("HomeEnvironment", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("检测未返回时渲染骨架屏", () => {
    vi.spyOn(terminalService, "checkEnvironment").mockReturnValue(
      new Promise(() => {}),
    );
    render(<HomeEnvironment />);

    expect(screen.getByText("开发环境")).toBeVisible();
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("检测失败时结束加载且不渲染工具行", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(terminalService, "checkEnvironment").mockRejectedValue(
      new Error("ipc down"),
    );
    render(<HomeEnvironment />);

    await waitFor(() => {
      expect(document.querySelectorAll(".animate-pulse")).toHaveLength(0);
    });
    expect(screen.queryByText("Node.js")).not.toBeInTheDocument();
  });

  it("检测成功后渲染 Node 与各 CLI 工具的安装状态", async () => {
    const spy = vi
      .spyOn(terminalService, "checkEnvironment")
      .mockResolvedValue(ENV_INFO);
    render(<HomeEnvironment />);

    expect(await screen.findByText("Node.js")).toBeVisible();
    expect(screen.getByText("v22.1.0")).toBeVisible();
    expect(screen.getByText("Claude Code")).toBeVisible();
    expect(screen.getByText("1.0.0")).toBeVisible();
    expect(screen.getByText("Codex CLI")).toBeVisible();
    expect(screen.getByText("未安装")).toBeVisible();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("二次挂载复用模块级缓存，不再调用检测", () => {
    const spy = vi.spyOn(terminalService, "checkEnvironment");
    render(<HomeEnvironment />);

    expect(screen.getByText("Node.js")).toBeVisible();
    expect(spy).not.toHaveBeenCalled();
  });
});
