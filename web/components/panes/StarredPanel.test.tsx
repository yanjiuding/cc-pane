import "@/i18n";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePanesStore, useTerminalStatusStore } from "@/stores";
import type { LayoutEntry, Panel, Tab, TerminalStatusInfo } from "@/types";
import StarredPanel from "./StarredPanel";

function makeTerminalTab(overrides?: Partial<Tab>): Tab {
  return {
    id: "tab-1",
    title: "Project One",
    contentType: "terminal",
    projectId: "project-1",
    projectPath: "/tmp/project-one",
    sessionId: "session-1",
    terminalRootPane: {
      type: "leaf",
      id: "leaf-1",
      sessionId: "session-1",
    },
    activeTerminalPaneId: "leaf-1",
    ...overrides,
  };
}

function makePanel(tab: Tab, id = "pane-1"): Panel {
  return {
    type: "panel",
    id,
    tabs: [tab],
    activeTabId: tab.id,
  };
}

function makeLayout(id: string, name: string, rootPane: Panel, kind: LayoutEntry["kind"] = "normal"): LayoutEntry {
  return {
    id,
    name,
    kind,
    rootPane,
    activePaneId: rootPane.id,
  };
}

describe("StarredPanel", () => {
  beforeEach(() => {
    const rootPane = makePanel(makeTerminalTab({ starred: true }));
    const starredRootPane = makePanel(makeTerminalTab({ id: "starred-placeholder", title: "Starred Placeholder" }), "pane-starred");
    usePanesStore.setState({
      rootPane,
      activePaneId: rootPane.id,
      layouts: [
        makeLayout("layout-1", "布局 1", rootPane),
        makeLayout("layout-starred", "星标", starredRootPane, "starred"),
      ],
      currentLayoutId: "layout-1",
      closedTabs: [],
      poppedOutTabs: new Set<string>(),
    });

    const status: TerminalStatusInfo = {
      sessionId: "session-1",
      status: "active",
      lastOutputAt: 1,
      updatedAt: 1,
    };
    useTerminalStatusStore.setState({ statusMap: new Map([[status.sessionId, status]]) });
  });

  it("renders starred tabs without resubscribing to a fresh store snapshot", () => {
    render(<StarredPanel />);

    expect(screen.getByText("Project One")).toBeInTheDocument();
    expect(screen.getByText("布局 1")).toBeInTheDocument();
  });
});
