import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Panel, SplitPane } from "@/types";
import { usePanesStore } from "@/stores";
import SplitContainer from "./SplitContainer";

interface MockSplitViewProps {
  vertical: boolean;
  sizes: number[];
  onDragEnd: (sizes: number[]) => void;
  keys: string[];
  children: React.ReactNode[];
}

let lastSplitViewProps: MockSplitViewProps | null = null;

vi.mock("./SplitView", () => ({
  default: (props: MockSplitViewProps) => {
    lastSplitViewProps = props;
    return <div data-testid="split-view">{props.children}</div>;
  },
}));

vi.mock("./PaneContainer", () => ({
  default: ({ pane }: { pane: Panel }) => <div data-testid={`child-${pane.id}`} />,
}));

function makePanel(id: string): Panel {
  return { type: "panel", id, tabs: [], activeTabId: "" };
}

function makeSplit(overrides?: Partial<SplitPane>): SplitPane {
  return {
    type: "split",
    id: "split-1",
    direction: "horizontal",
    children: [makePanel("a"), makePanel("b")],
    sizes: [50, 50],
    ...overrides,
  };
}

describe("SplitContainer", () => {
  afterEach(() => {
    lastSplitViewProps = null;
    vi.restoreAllMocks();
  });

  it("renders each child through SplitView with stable keys", () => {
    render(<SplitContainer pane={makeSplit()} />);

    expect(screen.getByTestId("child-a")).toBeInTheDocument();
    expect(screen.getByTestId("child-b")).toBeInTheDocument();
    expect(lastSplitViewProps?.keys).toEqual(["a", "b"]);
    expect(lastSplitViewProps?.vertical).toBe(false);
    expect(lastSplitViewProps?.sizes).toEqual([50, 50]);
  });

  it("maps vertical direction to a vertical SplitView", () => {
    render(<SplitContainer pane={makeSplit({ direction: "vertical" })} />);

    expect(lastSplitViewProps?.vertical).toBe(true);
  });

  it("normalizes drag sizes to percentages summing to exactly 100", () => {
    const resizePanes = vi.fn();
    usePanesStore.setState({ resizePanes });

    render(<SplitContainer pane={makeSplit()} />);
    lastSplitViewProps?.onDragEnd([33.333, 66.667]);

    expect(resizePanes).toHaveBeenCalledTimes(1);
    const [paneId, sizes] = resizePanes.mock.calls[0];
    expect(paneId).toBe("split-1");
    expect(sizes.reduce((a: number, b: number) => a + b, 0)).toBe(100);
    expect(sizes[0]).toBeCloseTo(33.3, 5);
    expect(sizes[1]).toBeCloseTo(66.7, 5);
  });

  it("ignores drag results whose total is zero", () => {
    const resizePanes = vi.fn();
    usePanesStore.setState({ resizePanes });

    render(<SplitContainer pane={makeSplit()} />);
    lastSplitViewProps?.onDragEnd([0, 0]);

    expect(resizePanes).not.toHaveBeenCalled();
  });
});
