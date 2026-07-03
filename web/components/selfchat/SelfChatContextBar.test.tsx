import "@/i18n";
import i18n from "i18next";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SelfChatSession } from "@/types";
import SelfChatContextBar from "./SelfChatContextBar";

function makeSession(overrides?: Partial<SelfChatSession>): SelfChatSession {
  return {
    id: "sc-1",
    appCwd: "/tmp/app",
    ptySessionId: "pty-1",
    status: "running",
    systemPrompt: null,
    ...overrides,
  };
}

function renderBar(session: SelfChatSession, handlers?: { onRestart?: () => void; onEndSession?: () => void }) {
  return render(
    <SelfChatContextBar
      session={session}
      onRestart={handlers?.onRestart ?? vi.fn()}
      onEndSession={handlers?.onEndSession ?? vi.fn()}
    />
  );
}

describe("SelfChatContextBar", () => {
  it("shows the injected badge once a system prompt exists, regardless of status", () => {
    renderBar(makeSession({ systemPrompt: "prompt", status: "initializing" }));

    expect(screen.getByText(i18n.t("selfChat.contextInjected"))).toBeInTheDocument();
    expect(screen.queryByText(i18n.t("selfChat.injecting"))).not.toBeInTheDocument();
  });

  it("shows the injecting badge while initializing without a system prompt", () => {
    renderBar(makeSession({ status: "initializing" }));

    expect(screen.getByText(i18n.t("selfChat.injecting"))).toBeInTheDocument();
  });

  it("shows the not-injected badge for a running session without a system prompt", () => {
    renderBar(makeSession());

    expect(screen.getByText(i18n.t("selfChat.notInjected"))).toBeInTheDocument();
  });

  it("invokes restart and end-session callbacks from the action buttons", async () => {
    const user = userEvent.setup();
    const onRestart = vi.fn();
    const onEndSession = vi.fn();
    renderBar(makeSession(), { onRestart, onEndSession });

    await user.click(screen.getByRole("button", { name: i18n.t("selfChat.restart") }));
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(onEndSession).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: i18n.t("selfChat.endSession") }));
    expect(onEndSession).toHaveBeenCalledTimes(1);
  });
});
