import "@/i18n";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSshMachinesStore } from "@/stores";
import type { SshMachine } from "@/types";
import SshMachinesView from "./SshMachinesView";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/services/sshMachineService", () => ({
  checkSshConnectivity: vi.fn(async () => ({
    reachable: true,
    message: "reachable",
    latencyMs: 8,
  })),
}));

// Keep the child dialogs inert so we can test the view in isolation.
vi.mock("./SshMachineDialog", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="ssh-machine-dialog" /> : null,
}));
vi.mock("./WslDiscoverDialog", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="wsl-dialog" /> : null,
}));

// waitForTauri resolves true so the view calls load() on mount.
vi.mock("@/utils", async () => {
  const actual = await vi.importActual<typeof import("@/utils")>("@/utils");
  return {
    ...actual,
    waitForTauri: vi.fn(async () => true),
  };
});

import { toast } from "sonner";
import { checkSshConnectivity } from "@/services/sshMachineService";

const mockCheck = vi.mocked(checkSshConnectivity);

function createMachine(overrides: Partial<SshMachine> = {}): SshMachine {
  return {
    id: "m-1",
    name: "devbox",
    host: "devbox.local",
    port: 2222,
    user: "dev",
    authMethod: "key",
    identityFile: "~/.ssh/id_devbox",
    description: "prod box",
    defaultPath: "/srv/app",
    tags: ["prod"],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderView(machines: SshMachine[] = []) {
  const onOpenTerminal = vi.fn();
  const loadMock = vi.fn(async () => undefined);
  const removeMock = vi.fn(async () => undefined);
  useSshMachinesStore.setState({
    machines,
    load: loadMock as never,
    remove: removeMock as never,
  });
  render(
    <TooltipProvider>
      <SshMachinesView onOpenTerminal={onOpenTerminal} />
    </TooltipProvider>,
  );
  return { onOpenTerminal, loadMock, removeMock };
}

describe("SshMachinesView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSshMachinesStore.setState({ machines: [] });
    mockCheck.mockResolvedValue({
      reachable: true,
      message: "reachable",
      latencyMs: 8,
    });
    Object.defineProperty(window.navigator, "platform", {
      value: "Win32",
      configurable: true,
    });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => undefined) },
      configurable: true,
    });
  });

  it("loads machines on mount", async () => {
    const { loadMock } = renderView([]);
    await waitFor(() => expect(loadMock).toHaveBeenCalled());
  });

  it("shows the empty state when there are no machines", () => {
    renderView([]);
    expect(screen.getByText(/No SSH machines|没有|无/i)).toBeVisible();
  });

  it("renders a machine row with its connection and tags", () => {
    renderView([createMachine()]);
    expect(screen.getByText("devbox")).toBeVisible();
    expect(screen.getByText("dev@devbox.local:2222")).toBeVisible();
    expect(screen.getByText("prod")).toBeVisible();
    expect(screen.getByText("prod box")).toBeVisible();
  });

  it("opens the add dialog from the header button", async () => {
    const user = userEvent.setup();
    renderView([]);

    // header add button is icon-only (Plus icon)
    const plusBtn = document
      .querySelector("svg.lucide-plus")
      ?.closest("button");
    expect(plusBtn).toBeTruthy();
    await user.click(plusBtn as HTMLButtonElement);

    expect(screen.getByTestId("ssh-machine-dialog")).toBeInTheDocument();
  });

  it("opens the add dialog from the empty-state CTA", async () => {
    const user = userEvent.setup();
    renderView([]);

    await user.click(
      screen.getByText(/Add your first machine|添加.*第一/i),
    );

    expect(screen.getByTestId("ssh-machine-dialog")).toBeInTheDocument();
  });

  it("connects on double-click", () => {
    const { onOpenTerminal } = renderView([createMachine()]);

    fireEvent.doubleClick(screen.getByText("devbox"));

    expect(onOpenTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "ssh://dev@devbox.local:2222//srv/app",
        machineName: "devbox",
        ssh: expect.objectContaining({
          host: "devbox.local",
          port: 2222,
          user: "dev",
          remotePath: "/srv/app",
          machineId: "m-1",
          authMethod: "key",
        }),
      }),
    );
  });

  it("copies connection info via the context menu", async () => {
    renderView([createMachine()]);

    fireEvent.contextMenu(screen.getByText("devbox"));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /Copy Connection|复制/i }),
    );

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "dev@devbox.local:2222",
      ),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("deletes a machine after confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { removeMock } = renderView([createMachine()]);

    fireEvent.contextMenu(screen.getByText("devbox"));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /Delete|删除/i }),
    );

    await waitFor(() => expect(removeMock).toHaveBeenCalledWith("m-1"));
    expect(toast.success).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("does not delete when confirmation is cancelled", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { removeMock } = renderView([createMachine()]);

    fireEvent.contextMenu(screen.getByText("devbox"));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /Delete|删除/i }),
    );

    expect(removeMock).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("checks connectivity for a single machine from the context menu", async () => {
    renderView([createMachine()]);

    fireEvent.contextMenu(screen.getByText("devbox"));
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: /Check Connectivity|检测连通|连通性/i,
      }),
    );

    await waitFor(() => expect(mockCheck).toHaveBeenCalledWith("m-1"));
  });

  it("connects from the context menu", async () => {
    const { onOpenTerminal } = renderView([createMachine()]);

    fireEvent.contextMenu(screen.getByText("devbox"));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /^Connect$|^连接$/i }),
    );

    expect(onOpenTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ machineName: "devbox" }),
    );
  });
});
