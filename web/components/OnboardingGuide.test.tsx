import "@/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingGuide from "./OnboardingGuide";
import {
  useDialogStore,
  useSettingsStore,
  useActivityBarStore,
  useSelfChatStore,
} from "@/stores";
import { terminalService } from "@/services";
import { createTestSettings } from "@/test/utils/testData";
import { mockTauriInvoke } from "@/test/utils/mockTauriInvoke";
import type { EnvironmentInfo } from "@/types";

function makeEnv(claudeInstalled: boolean, nodeInstalled = true): EnvironmentInfo {
  return {
    node: { installed: nodeInstalled, version: nodeInstalled ? "v20.0.0" : null },
    cliTools: [
      {
        id: "claude",
        displayName: "Claude Code",
        executable: "claude",
        versionArgs: ["--version"],
        installed: claudeInstalled,
        version: claudeInstalled ? "1.0.0" : null,
        path: claudeInstalled ? "/usr/bin/claude" : null,
      },
      {
        id: "codex",
        displayName: "Codex CLI",
        executable: "codex",
        versionArgs: ["--version"],
        installed: false,
        version: null,
        path: null,
      },
    ],
    claude: { installed: claudeInstalled, version: null },
    codex: { installed: false, version: null },
  };
}

function setupEnv(env: EnvironmentInfo) {
  return vi.spyOn(terminalService, "checkEnvironment").mockResolvedValue(env);
}

describe("OnboardingGuide", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTauriInvoke({ update_settings: null });
    useDialogStore.setState({ onboardingOpen: true });
    useSettingsStore.setState({ settings: createTestSettings() });
    useSelfChatStore.setState({ activeSession: null, isOnboarding: false });
    useActivityBarStore.setState({ appViewMode: "panes" });
  });

  it("未打开时不渲染对话框", () => {
    setupEnv(makeEnv(true));
    useDialogStore.setState({ onboardingOpen: false });
    render(<OnboardingGuide />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("打开后进行环境检测并展示 Node/CLI 状态", async () => {
    setupEnv(makeEnv(true));
    render(<OnboardingGuide />);

    expect(await screen.findByText(/环境检测|Environment Check/)).toBeInTheDocument();
    expect(screen.getByText("Node.js")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    // 检测完成后至少出现一个"已安装"标记
    await waitFor(() => expect(screen.getAllByText(/已安装|Installed/).length).toBeGreaterThan(0));
  });

  it("Node 与所选 CLI 均安装时显示环境就绪提示", async () => {
    setupEnv(makeEnv(true));
    render(<OnboardingGuide />);
    expect(await screen.findByText(/环境就绪|Environment ready/)).toBeInTheDocument();
  });

  it("缺少所选 CLI 时显示环境未就绪提示", async () => {
    setupEnv(makeEnv(false));
    render(<OnboardingGuide />);
    expect(await screen.findByText(/请先安装|Please install the missing/)).toBeInTheDocument();
  });

  it("可从环境检测经 CLI 选择走到欢迎页并返回", async () => {
    const user = userEvent.setup();
    setupEnv(makeEnv(true));
    render(<OnboardingGuide />);

    // 等检测完成，Next 可用
    const next = await screen.findByRole("button", { name: /下一步|Next/ });
    await waitFor(() => expect(next).toBeEnabled());
    await user.click(next);

    // CLI 选择步骤
    expect(await screen.findByText(/选择你的 AI 编程工具|Choose Your AI Coding Tool/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /下一步|Next/ }));

    // 欢迎步骤
    expect(await screen.findByText(/欢迎使用|Welcome to CC-Panes/)).toBeInTheDocument();

    // 返回到 CLI 选择
    await user.click(screen.getByRole("button", { name: /上一步|Back/ }));
    expect(await screen.findByText(/选择你的 AI 编程工具|Choose Your AI Coding Tool/)).toBeInTheDocument();
  });

  it("跳过时标记 onboarding 完成并关闭对话框", async () => {
    const user = userEvent.setup();
    setupEnv(makeEnv(true));
    render(<OnboardingGuide />);

    await screen.findByRole("button", { name: /下一步|Next/ });
    await user.click(screen.getByRole("button", { name: /跳过|Skip/ }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "update_settings",
        expect.objectContaining({
          settings: expect.objectContaining({
            general: expect.objectContaining({ onboardingCompleted: true }),
          }),
        }),
      ),
    );
    expect(useDialogStore.getState().onboardingOpen).toBe(false);
  });

  it("环境就绪时开始 AI 引导会保存 CLI 选择并切换到 SelfChat", async () => {
    const user = userEvent.setup();
    setupEnv(makeEnv(true));
    render(<OnboardingGuide />);

    await waitFor(async () => {
      const nextBtn = await screen.findByRole("button", { name: /下一步|Next/ });
      expect(nextBtn).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: /下一步|Next/ }));
    await user.click(await screen.findByRole("button", { name: /下一步|Next/ }));

    const startBtn = await screen.findByRole("button", { name: /开始 AI 引导|Start AI Guide/ });
    expect(startBtn).toBeEnabled();
    await user.click(startBtn);

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "update_settings",
        expect.objectContaining({
          settings: expect.objectContaining({
            general: expect.objectContaining({
              onboardingCompleted: true,
              defaultCliTool: "claude",
            }),
          }),
        }),
      ),
    );
    expect(useDialogStore.getState().onboardingOpen).toBe(false);
    expect(useSelfChatStore.getState().isOnboarding).toBe(true);
    expect(useActivityBarStore.getState().appViewMode).toBe("selfchat");
  });

  it("环境未就绪时开始 AI 引导按钮禁用", async () => {
    const user = userEvent.setup();
    setupEnv(makeEnv(false));
    render(<OnboardingGuide />);

    await user.click(await screen.findByRole("button", { name: /下一步|Next/ }));
    await user.click(await screen.findByRole("button", { name: /下一步|Next/ }));

    const startBtn = await screen.findByRole("button", { name: /开始 AI 引导|Start AI Guide/ });
    expect(startBtn).toBeDisabled();
  });
});
