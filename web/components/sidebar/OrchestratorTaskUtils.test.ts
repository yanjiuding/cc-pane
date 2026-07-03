import { describe, expect, it } from "vitest";
import type { TaskBinding, TaskBindingNode, Workspace, WorkspaceProject } from "@/types";
import {
  findWorkspaceProject,
  flattenTaskTree,
  getMetadataUi,
  getProjectLabel,
  getProjectName,
} from "./OrchestratorTaskUtils";

function makeBinding(overrides: Partial<TaskBinding> = {}): TaskBinding {
  return {
    id: "b1",
    title: "task",
    role: "task",
    projectPath: "/tmp/proj",
    cliTool: "claude",
    status: "running",
    progress: 0,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeNode(id: string, children: TaskBindingNode[] = []): TaskBindingNode {
  return { ...makeBinding({ id }), children, depth: 0 };
}

function makeWorkspaceProject(overrides: Partial<WorkspaceProject> = {}): WorkspaceProject {
  return { id: `p-${overrides.path ?? "x"}`, path: "/tmp/a", ...overrides };
}

function makeWorkspace(name: string, projects: WorkspaceProject[]): Workspace {
  return {
    id: name,
    name,
    createdAt: "2026-01-01T00:00:00Z",
    projects,
    defaultEnvironment: "local",
  };
}

describe("getMetadataUi", () => {
  it("returns empty object when metadata missing", () => {
    expect(getMetadataUi(makeBinding({ metadata: undefined }))).toEqual({});
  });

  it("returns empty object when metadata is not an object", () => {
    expect(getMetadataUi(makeBinding({ metadata: "string" }))).toEqual({});
    expect(getMetadataUi(makeBinding({ metadata: 42 }))).toEqual({});
    expect(getMetadataUi(makeBinding({ metadata: null }))).toEqual({});
  });

  it("returns empty object when ui key missing or not an object", () => {
    expect(getMetadataUi(makeBinding({ metadata: {} }))).toEqual({});
    expect(getMetadataUi(makeBinding({ metadata: { ui: "nope" } }))).toEqual({});
    expect(getMetadataUi(makeBinding({ metadata: { ui: null } }))).toEqual({});
  });

  it("returns the ui payload when present", () => {
    const ui = { gitBranch: "main", muted: true, startedAt: 123 };
    expect(getMetadataUi(makeBinding({ metadata: { ui } }))).toEqual(ui);
  });
});

describe("getProjectName", () => {
  it("extracts last segment from forward-slash paths", () => {
    expect(getProjectName("/home/dev/repo")).toBe("repo");
  });

  it("extracts last segment from backslash paths", () => {
    expect(getProjectName("D:\\workspace\\my-app")).toBe("my-app");
  });

  it("ignores trailing separators", () => {
    expect(getProjectName("/home/dev/repo/")).toBe("repo");
    expect(getProjectName("D:\\workspace\\app\\\\")).toBe("app");
  });

  it("falls back to the original path when no segments", () => {
    expect(getProjectName("")).toBe("");
    expect(getProjectName("/")).toBe("/");
  });
});

describe("getProjectLabel", () => {
  it("prefers the alias when present", () => {
    expect(getProjectLabel(makeWorkspaceProject({ alias: "Nice Name", path: "/tmp/x" }))).toBe("Nice Name");
  });

  it("falls back to the project name derived from the path", () => {
    expect(getProjectLabel(makeWorkspaceProject({ path: "/tmp/some/repo" }))).toBe("repo");
  });

  it("ignores empty alias", () => {
    expect(getProjectLabel(makeWorkspaceProject({ alias: "", path: "/tmp/some/repo" }))).toBe("repo");
  });
});

describe("findWorkspaceProject", () => {
  const wsA = makeWorkspace("A", [makeWorkspaceProject({ path: "/tmp/a1" }), makeWorkspaceProject({ path: "/tmp/a2" })]);
  const wsB = makeWorkspace("B", [makeWorkspaceProject({ path: "/tmp/b1" })]);

  it("returns null for null path", () => {
    expect(findWorkspaceProject([wsA, wsB], null)).toBeNull();
  });

  it("returns null when no workspace contains the path", () => {
    expect(findWorkspaceProject([wsA, wsB], "/tmp/nope")).toBeNull();
  });

  it("finds the matching workspace/project pair", () => {
    const found = findWorkspaceProject([wsA, wsB], "/tmp/b1");
    expect(found?.workspace.name).toBe("B");
    expect(found?.project.path).toBe("/tmp/b1");
  });

  it("returns the first workspace match in iteration order", () => {
    const found = findWorkspaceProject([wsA, wsB], "/tmp/a2");
    expect(found?.workspace.name).toBe("A");
    expect(found?.project.path).toBe("/tmp/a2");
  });
});

describe("flattenTaskTree", () => {
  it("returns empty array for empty input", () => {
    expect(flattenTaskTree([])).toEqual([]);
  });

  it("flattens a nested tree in depth-first pre-order", () => {
    const tree: TaskBindingNode[] = [
      makeNode("root1", [makeNode("child1a", [makeNode("grandchild")]), makeNode("child1b")]),
      makeNode("root2"),
    ];
    expect(flattenTaskTree(tree).map((n) => n.id)).toEqual([
      "root1",
      "child1a",
      "grandchild",
      "child1b",
      "root2",
    ]);
  });

  it("includes every node exactly once", () => {
    const tree: TaskBindingNode[] = [makeNode("a", [makeNode("b"), makeNode("c", [makeNode("d")])])];
    expect(flattenTaskTree(tree)).toHaveLength(4);
  });
});
