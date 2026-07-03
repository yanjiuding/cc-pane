import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Panel, SplitPane } from "@/types";
import PaneContainer from "./PaneContainer";

vi.mock("./Panel", () => ({
  default: ({ pane }: { pane: Panel }) => <div data-testid="panel" data-pane-id={pane.id} />,
}));

vi.mock("./SplitContainer", () => ({
  default: ({ pane }: { pane: SplitPane }) => (
    <div data-testid="split-container" data-pane-id={pane.id} />
  ),
}));

function makePanel(id: string): Panel {
  return { type: "panel", id, tabs: [], activeTabId: "" };
}

describe("PaneContainer", () => {
  it("renders Panel for a panel node", () => {
    render(<PaneContainer pane={makePanel("pane-1")} />);

    expect(screen.getByTestId("panel")).toHaveAttribute("data-pane-id", "pane-1");
    expect(screen.queryByTestId("split-container")).not.toBeInTheDocument();
  });

  it("renders SplitContainer for a split node", () => {
    const split: SplitPane = {
      type: "split",
      id: "split-1",
      direction: "horizontal",
      children: [makePanel("a"), makePanel("b")],
      sizes: [50, 50],
    };

    render(<PaneContainer pane={split} />);

    expect(screen.getByTestId("split-container")).toHaveAttribute("data-pane-id", "split-1");
    expect(screen.queryByTestId("panel")).not.toBeInTheDocument();
  });
});
