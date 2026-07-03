import { render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Panel, Tab } from "@/types";
import { usePanesStore } from "@/stores";
import DndPaneProvider from "./DndPaneProvider";

interface CapturedDndProps {
  onDragStart: (event: unknown) => void;
  onDragOver: (event: unknown) => void;
  onDragEnd: (event: unknown) => void;
  onDragCancel: () => void;
}

let dndProps: CapturedDndProps | null = null;

vi.mock("@/utils/devLogger", () => ({
  devDebugLog: vi.fn(),
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: (props: CapturedDndProps & { children: React.ReactNode }) => {
    dndProps = props;
    return <div data-testid="dnd-context">{props.children}</div>;
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drag-overlay">{children}</div>
  ),
  PointerSensor: class {},
  useSensor: vi.fn((sensor: unknown, options: unknown) => ({ sensor, options })),
  useSensors: vi.fn((...sensors: unknown[]) => sensors),
}));

function makeTab(id: string, title = id): Tab {
  return {
    id,
    title,
    contentType: "terminal",
    projectId: "proj",
    projectPath: "/tmp/proj",
    sessionId: null,
  } as Tab;
}

function makePanel(id: string, tabs: Tab[]): Panel {
  return { type: "panel", id, tabs, activeTabId: tabs[0]?.id ?? "" };
}

function dragEvent(tab: Tab, fromPaneId: string, over: { id: string; paneId: string } | null) {
  return {
    active: { id: tab.id, data: { current: { type: "tab", tab, paneId: fromPaneId } } },
    over: over
      ? { id: over.id, data: { current: { type: "tab", paneId: over.paneId } } }
      : null,
  };
}

describe("DndPaneProvider", () => {
  afterEach(() => {
    dndProps = null;
    vi.restoreAllMocks();
  });

  it("renders children inside the DnD context", () => {
    render(
      <DndPaneProvider>
        <div data-testid="child" />
      </DndPaneProvider>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("shows the dragged tab title in the overlay on drag start and hides it on cancel", () => {
    render(<DndPaneProvider>{null}</DndPaneProvider>);
    const tab = makeTab("tab-1", "Alpha Tab");

    act(() => {
      dndProps!.onDragStart({ active: { id: tab.id, data: { current: { type: "tab", tab, paneId: "p1" } } } });
    });
    expect(screen.getByText("Alpha Tab")).toBeInTheDocument();

    act(() => {
      dndProps!.onDragCancel();
    });
    expect(screen.queryByText("Alpha Tab")).not.toBeInTheDocument();
  });

  it("reorders tabs when dropping onto another tab in the same pane", () => {
    const tabA = makeTab("tab-a");
    const tabB = makeTab("tab-b");
    const panel = makePanel("pane-1", [tabA, tabB]);
    const reorderTabs = vi.fn();
    const moveTab = vi.fn();
    usePanesStore.setState({ allPanels: () => [panel], reorderTabs, moveTab });

    render(<DndPaneProvider>{null}</DndPaneProvider>);
    act(() => {
      dndProps!.onDragEnd(dragEvent(tabA, "pane-1", { id: "tab-b", paneId: "pane-1" }));
    });

    expect(reorderTabs).toHaveBeenCalledWith("pane-1", 0, 1);
    expect(moveTab).not.toHaveBeenCalled();
  });

  it("does not reorder when dropping a tab onto itself", () => {
    const tabA = makeTab("tab-a");
    const panel = makePanel("pane-1", [tabA, makeTab("tab-b")]);
    const reorderTabs = vi.fn();
    usePanesStore.setState({ allPanels: () => [panel], reorderTabs });

    render(<DndPaneProvider>{null}</DndPaneProvider>);
    act(() => {
      dndProps!.onDragEnd(dragEvent(tabA, "pane-1", { id: "tab-a", paneId: "pane-1" }));
    });

    expect(reorderTabs).not.toHaveBeenCalled();
  });

  it("moves the tab with target index when dropping onto a tab in another pane", () => {
    const tabA = makeTab("tab-a");
    const other = makePanel("pane-2", [makeTab("tab-x"), makeTab("tab-y")]);
    const moveTab = vi.fn();
    usePanesStore.setState({
      allPanels: () => [makePanel("pane-1", [tabA]), other],
      moveTab,
    });

    render(<DndPaneProvider>{null}</DndPaneProvider>);
    act(() => {
      dndProps!.onDragEnd(dragEvent(tabA, "pane-1", { id: "tab-y", paneId: "pane-2" }));
    });

    expect(moveTab).toHaveBeenCalledWith("pane-1", "pane-2", "tab-a", 1);
  });

  it("ignores a drop outside any target and clears the overlay", () => {
    const tab = makeTab("tab-a", "Floating");
    const moveTab = vi.fn();
    const reorderTabs = vi.fn();
    usePanesStore.setState({ allPanels: () => [], moveTab, reorderTabs });

    render(<DndPaneProvider>{null}</DndPaneProvider>);
    act(() => {
      dndProps!.onDragStart({ active: { id: tab.id, data: { current: { type: "tab", tab, paneId: "p1" } } } });
    });
    act(() => {
      dndProps!.onDragEnd(dragEvent(tab, "p1", null));
    });

    expect(moveTab).not.toHaveBeenCalled();
    expect(reorderTabs).not.toHaveBeenCalled();
    expect(screen.queryByText("Floating")).not.toBeInTheDocument();
  });

  it("ignores drags whose active payload is not a tab", () => {
    const moveTab = vi.fn();
    usePanesStore.setState({ allPanels: () => [], moveTab });

    render(<DndPaneProvider>{null}</DndPaneProvider>);
    act(() => {
      dndProps!.onDragEnd({
        active: { id: "x", data: { current: { type: "file" } } },
        over: { id: "tab-b", data: { current: { type: "tab", paneId: "pane-1" } } },
      });
    });

    expect(moveTab).not.toHaveBeenCalled();
  });
});
