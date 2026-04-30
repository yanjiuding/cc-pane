import { describe, expect, it } from "vitest";
import { findPaneFocusTarget, type PaneFocusRect } from "./paneFocus";

function pane(paneId: string, left: number, top: number, width: number, height: number): PaneFocusRect {
  return {
    paneId,
    rect: {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    },
  };
}

describe("paneFocus", () => {
  const grid = [
    pane("top-left", 0, 0, 100, 100),
    pane("top-right", 100, 0, 100, 100),
    pane("bottom-left", 0, 100, 100, 100),
    pane("bottom-right", 100, 100, 100, 100),
  ];
  const order = grid.map((item) => item.paneId);

  it("selects the spatial neighbor in each direction", () => {
    expect(findPaneFocusTarget({
      activePaneId: "top-left",
      direction: "right",
      paneOrder: order,
      paneRects: grid,
    })).toBe("top-right");

    expect(findPaneFocusTarget({
      activePaneId: "top-left",
      direction: "down",
      paneOrder: order,
      paneRects: grid,
    })).toBe("bottom-left");
  });

  it("prefers overlapping candidates over diagonal candidates", () => {
    const panes = [
      pane("active", 100, 100, 100, 100),
      pane("left-overlap", 0, 125, 90, 50),
      pane("left-diagonal", 80, 0, 10, 50),
    ];

    expect(findPaneFocusTarget({
      activePaneId: "active",
      direction: "left",
      paneOrder: panes.map((item) => item.paneId),
      paneRects: panes,
    })).toBe("left-overlap");
  });

  it("uses the closest axis gap when there is no overlap", () => {
    const panes = [
      pane("active", 100, 100, 100, 100),
      pane("near-above", 0, 70, 80, 20),
      pane("far-above", 0, 0, 80, 20),
    ];

    expect(findPaneFocusTarget({
      activePaneId: "active",
      direction: "left",
      paneOrder: panes.map((item) => item.paneId),
      paneRects: panes,
    })).toBe("near-above");
  });

  it("falls back to layout order when no pane is in the requested direction", () => {
    expect(findPaneFocusTarget({
      activePaneId: "top-left",
      direction: "left",
      paneOrder: order,
      paneRects: grid,
    })).toBe("bottom-right");
  });

  it("returns null for a single pane", () => {
    expect(findPaneFocusTarget({
      activePaneId: "only",
      direction: "right",
      paneOrder: ["only"],
      paneRects: [pane("only", 0, 0, 100, 100)],
    })).toBeNull();
  });
});
