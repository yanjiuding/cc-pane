import "@/i18n";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePanesStore, useSelfChatStore, useSettingsStore } from "@/stores";
import { selfChatService, terminalService } from "@/services";
import SelfChatManager from "./SelfChatManager";

interface TerminalViewProps {
  sessionId: string | null;
  projectPath: string;
  cliTool?: string;
  providerId?: string;
  appendSystemPrompt?: string;
  onSessionCreated: (sessionId: string) => void;
  onSessionExited?: (exitCode: number) => void;
}

let terminalViewProps: TerminalViewProps | null = null;

vi.mock("@/components/panes/TerminalView", () => ({
  default: (props: TerminalViewProps) => {
    terminalViewProps = props;
    return <div data-testid="terminal-view" />;
  },
}));

vi.mock("@/services/selfChatService", () => ({
  selfChatService: {
    getAppCwd: vi.fn(),
    collectAppContext: vi.fn(),
    collectOnboardingContext: vi.fn(),
  },
}));

vi.mock("@/services/terminalService", () => ({
  terminalService: {
    killSession: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue(undefined),
  },
}));

const getAppCwd = vi.mocked(selfChatService.getAppCwd);
const collectAppContext = vi.mocked(selfChatService.collectAppContext);
const collectOnboardingContext = vi.mocked(selfChatService.collectOnboardingContext);
const killSession = vi.mocked(terminalService.killSession);
const write = vi.mocked(terminalService.write);

describe("SelfChatManager", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    useSelfChatStore.setState({ activeSession: null, isOnboarding: false });
    useSettingsStore.setState({
      settings: { general: { defaultCliTool: "codex" } },
    } as never);
    usePanesStore.setState({
      rootPane: {
        type: "panel",
        id: "pane-1",
        activeTabId: "tab-1",
        tabs: [{ id: "tab-1", providerId: "provider-9" }],
      },
    } as never);
    getAppCwd.mockResolvedValue("/app/cwd");
    collectAppContext.mockResolvedValue("app context prompt");
    collectOnboardingContext.mockReturnValue("onboarding prompt" as never);
  });

  afterEach(() => {
    terminalViewProps = null;
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("auto-starts a session with the collected app context", async () => {
    render(<SelfChatManager />);

    await waitFor(() => expect(useSelfChatStore.getState().activeSession).not.toBeNull());
    const session = useSelfChatStore.getState().activeSession!;
    expect(session.appCwd).toBe("/app/cwd");
    expect(session.systemPrompt).toBe("app context prompt");
    expect(collectAppContext).toHaveBeenCalled();
    expect(collectOnboardingContext).not.toHaveBeenCalled();
  });

  it("collects the onboarding context instead when onboarding is active", async () => {
    useSelfChatStore.setState({ isOnboarding: true });
    render(<SelfChatManager />);

    await waitFor(() => expect(useSelfChatStore.getState().activeSession).not.toBeNull());
    expect(collectOnboardingContext).toHaveBeenCalledWith("zh-CN");
    expect(collectAppContext).not.toHaveBeenCalled();
    expect(useSelfChatStore.getState().activeSession?.systemPrompt).toBe("onboarding prompt");
  });

  it("renders the terminal for the active session with inherited cli tool and provider", async () => {
    render(<SelfChatManager />);

    expect(await screen.findByTestId("terminal-view")).toBeInTheDocument();
    expect(terminalViewProps?.projectPath).toBe("/app/cwd");
    expect(terminalViewProps?.cliTool).toBe("codex");
    expect(terminalViewProps?.providerId).toBe("provider-9");
    expect(terminalViewProps?.appendSystemPrompt).toBe("app context prompt");
  });

  it("shows the loading state while no session exists", () => {
    getAppCwd.mockReturnValue(new Promise(() => {}) as never);
    render(<SelfChatManager />);

    expect(screen.queryByTestId("terminal-view")).not.toBeInTheDocument();
  });

  it("marks the session running once the PTY is created", async () => {
    render(<SelfChatManager />);
    await screen.findByTestId("terminal-view");

    act(() => terminalViewProps!.onSessionCreated("pty-1"));

    const session = useSelfChatStore.getState().activeSession!;
    expect(session.ptySessionId).toBe("pty-1");
    expect(session.status).toBe("running");
  });

  it("auto-sends the onboarding greeting with a CR after 5 seconds", async () => {
    useSelfChatStore.setState({ isOnboarding: true });
    render(<SelfChatManager />);
    await screen.findByTestId("terminal-view");

    vi.useFakeTimers();
    act(() => terminalViewProps!.onSessionCreated("pty-1"));
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // 终端提交必须以 \r 结尾（Windows PowerShell 只认 CR）
    expect(write).toHaveBeenCalledWith("pty-1", "你好，我是新用户\r");
  });

  it("skips the onboarding greeting when the session changed before the delay", async () => {
    useSelfChatStore.setState({ isOnboarding: true });
    render(<SelfChatManager />);
    await screen.findByTestId("terminal-view");

    vi.useFakeTimers();
    act(() => terminalViewProps!.onSessionCreated("pty-1"));
    act(() => {
      useSelfChatStore.getState().endSession(useSelfChatStore.getState().activeSession!.id);
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(write).not.toHaveBeenCalled();
  });

  it("marks the session exited when the PTY exits", async () => {
    render(<SelfChatManager />);
    await screen.findByTestId("terminal-view");
    act(() => terminalViewProps!.onSessionCreated("pty-1"));

    act(() => terminalViewProps!.onSessionExited?.(1));

    expect(useSelfChatStore.getState().activeSession?.status).toBe("exited");
  });

  it("kills the PTY on end session and auto-starts a fresh session", async () => {
    const user = userEvent.setup();
    render(<SelfChatManager />);
    await screen.findByTestId("terminal-view");
    act(() => terminalViewProps!.onSessionCreated("pty-1"));
    const firstId = useSelfChatStore.getState().activeSession!.id;

    const buttons = screen.getAllByRole("button");
    await user.click(buttons[buttons.length - 1]);

    expect(killSession).toHaveBeenCalledWith("pty-1");
    // 结束后 autoStartedRef 复位，挂载中的组件按现状会自动拉起新会话
    await waitFor(() => {
      const session = useSelfChatStore.getState().activeSession;
      expect(session).not.toBeNull();
      expect(session!.id).not.toBe(firstId);
    });
  });

  it("restart kills the current session and auto-starts a fresh one", async () => {
    const user = userEvent.setup();
    render(<SelfChatManager />);
    await screen.findByTestId("terminal-view");
    act(() => terminalViewProps!.onSessionCreated("pty-1"));
    const firstId = useSelfChatStore.getState().activeSession!.id;

    await user.click(screen.getAllByRole("button")[0]);

    expect(killSession).toHaveBeenCalledWith("pty-1");
    await waitFor(() => {
      const session = useSelfChatStore.getState().activeSession;
      expect(session).not.toBeNull();
      expect(session!.id).not.toBe(firstId);
    });
  });
});
