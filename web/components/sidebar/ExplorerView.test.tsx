import "@/i18n";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ExplorerView from "./ExplorerView";
import type { OpenTerminalOptions } from "@/types";

// Isolate the wrapper from the heavy WorkspaceTree tree (dnd-kit, stores, dialogs).
vi.mock("@/components/sidebar/WorkspaceTree", () => ({
  default: ({ onOpenTerminal }: { onOpenTerminal: (opts: OpenTerminalOptions) => void }) => (
    <button
      type="button"
      onClick={() => onOpenTerminal({ path: "/tmp/from-tree" } as OpenTerminalOptions)}
    >
      workspace-tree-stub
    </button>
  ),
}));

describe("ExplorerView", () => {
  it("renders the EXPLORER header label", () => {
    render(<ExplorerView onOpenTerminal={vi.fn()} />);
    expect(screen.getByText("EXPLORER")).toBeVisible();
  });

  it("renders the WorkspaceTree child", () => {
    render(<ExplorerView onOpenTerminal={vi.fn()} />);
    expect(screen.getByText("workspace-tree-stub")).toBeVisible();
  });

  it("forwards onOpenTerminal to WorkspaceTree", () => {
    const onOpenTerminal = vi.fn();
    render(<ExplorerView onOpenTerminal={onOpenTerminal} />);

    fireEvent.click(screen.getByText("workspace-tree-stub"));

    expect(onOpenTerminal).toHaveBeenCalledWith({ path: "/tmp/from-tree" });
  });
});
