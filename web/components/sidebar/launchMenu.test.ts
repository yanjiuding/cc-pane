import { describe, expect, it } from "vitest";
import {
  buildSidebarCliLaunchItems,
  buildSidebarLaunchActions,
  filterSidebarFavoriteLaunchActions,
  getDefaultSidebarFavoriteLaunchActionIds,
  normalizeSidebarFavoriteLaunchActionIds,
} from "./launchMenu";

// Deterministic fake i18n `t`: returns the provided defaultValue when present,
// otherwise the key. Mirrors how the real i18next resolves these strings.
function fakeT(key: string, options?: { defaultValue?: string }): string {
  return options?.defaultValue ?? key;
}

const CLI_TOOLS = ["claude", "codex", "gemini", "kimi", "glm", "opencode", "cursor"];

describe("getDefaultSidebarFavoriteLaunchActionIds", () => {
  it("returns the terminal + claude + codex defaults", () => {
    expect(getDefaultSidebarFavoriteLaunchActionIds()).toEqual([
      "terminal-default",
      "claude-default",
      "codex-default",
    ]);
  });

  it("returns a fresh array each call", () => {
    const a = getDefaultSidebarFavoriteLaunchActionIds();
    const b = getDefaultSidebarFavoriteLaunchActionIds();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe("normalizeSidebarFavoriteLaunchActionIds", () => {
  it("migrates the exact legacy default set to the new defaults", () => {
    expect(
      normalizeSidebarFavoriteLaunchActionIds(["terminal-default", "claude-local", "codex-local"]),
    ).toEqual(["terminal-default", "claude-default", "codex-default"]);
  });

  it("passes through a user-customized favorite list unchanged", () => {
    const custom = ["terminal-wsl", "codex-default"];
    expect(normalizeSidebarFavoriteLaunchActionIds(custom)).toBe(custom);
  });

  it("does not migrate when order differs from the legacy set", () => {
    const reordered = ["claude-local", "terminal-default", "codex-local"];
    expect(normalizeSidebarFavoriteLaunchActionIds(reordered)).toBe(reordered);
  });

  it("does not migrate when length differs", () => {
    const shorter = ["terminal-default", "claude-local"];
    expect(normalizeSidebarFavoriteLaunchActionIds(shorter)).toBe(shorter);
  });

  it("passes through empty list unchanged", () => {
    const empty: string[] = [];
    expect(normalizeSidebarFavoriteLaunchActionIds(empty)).toBe(empty);
  });
});

describe("buildSidebarLaunchActions", () => {
  it("builds base terminal + per-CLI default/local actions without WSL/SSH", () => {
    const actions = buildSidebarLaunchActions(fakeT, false, false);
    const ids = actions.map((a) => a.id);

    expect(ids).toContain("terminal-default");
    expect(ids).toContain("terminal-local");
    expect(ids).not.toContain("terminal-wsl");
    expect(ids).not.toContain("terminal-ssh");

    for (const tool of CLI_TOOLS) {
      expect(ids).toContain(`${tool}-default`);
      expect(ids).toContain(`${tool}-local`);
      expect(ids).not.toContain(`${tool}-wsl`);
      expect(ids).not.toContain(`${tool}-ssh`);
    }
    // 2 terminal + 2 per cli tool
    expect(actions).toHaveLength(2 + CLI_TOOLS.length * 2);
  });

  it("adds WSL variants when includeWslVariant is true", () => {
    const ids = buildSidebarLaunchActions(fakeT, true).map((a) => a.id);
    expect(ids).toContain("terminal-wsl");
    for (const tool of CLI_TOOLS) {
      expect(ids).toContain(`${tool}-wsl`);
    }
  });

  it("adds SSH variants when includeSshVariant is true", () => {
    const ids = buildSidebarLaunchActions(fakeT, false, true).map((a) => a.id);
    expect(ids).toContain("terminal-ssh");
    for (const tool of CLI_TOOLS) {
      expect(ids).toContain(`${tool}-ssh`);
    }
  });

  it("includes both WSL and SSH variants when both enabled", () => {
    const actions = buildSidebarLaunchActions(fakeT, true, true);
    // 3 terminal (default/local/wsl/ssh = 4) + 4 per cli tool
    expect(actions).toHaveLength(4 + CLI_TOOLS.length * 4);
  });

  it("tags terminal actions kind=terminal and cli actions kind=cli with cliTool", () => {
    const actions = buildSidebarLaunchActions(fakeT, true, true);
    const terminalDefault = actions.find((a) => a.id === "terminal-default");
    expect(terminalDefault).toMatchObject({ kind: "terminal" });
    expect(terminalDefault?.cliTool).toBeUndefined();

    const codexWsl = actions.find((a) => a.id === "codex-wsl");
    expect(codexWsl).toMatchObject({ kind: "cli", cliTool: "codex", environment: "wsl" });
  });

  it("sets environment on the *-local action and leaves *-default without one", () => {
    const actions = buildSidebarLaunchActions(fakeT, false);
    expect(actions.find((a) => a.id === "claude-default")?.environment).toBeUndefined();
    expect(actions.find((a) => a.id === "claude-local")?.environment).toBe("local");
  });
});

describe("filterSidebarFavoriteLaunchActions", () => {
  it("returns actions in the favorites order", () => {
    const actions = buildSidebarLaunchActions(fakeT, true, false);
    const result = filterSidebarFavoriteLaunchActions(actions, ["codex-local", "terminal-default"]);
    expect(result.map((a) => a.id)).toEqual(["codex-local", "terminal-default"]);
  });

  it("drops favorite ids that have no matching action", () => {
    const actions = buildSidebarLaunchActions(fakeT, false, false);
    // codex-wsl is not built when WSL variant disabled
    const result = filterSidebarFavoriteLaunchActions(actions, ["codex-wsl", "terminal-default"]);
    expect(result.map((a) => a.id)).toEqual(["terminal-default"]);
  });

  it("applies legacy migration before mapping", () => {
    const actions = buildSidebarLaunchActions(fakeT, false, false);
    const result = filterSidebarFavoriteLaunchActions(actions, [
      "terminal-default",
      "claude-local",
      "codex-local",
    ]);
    expect(result.map((a) => a.id)).toEqual([
      "terminal-default",
      "claude-default",
      "codex-default",
    ]);
  });

  it("returns empty array for empty favorites", () => {
    const actions = buildSidebarLaunchActions(fakeT, false, false);
    expect(filterSidebarFavoriteLaunchActions(actions, [])).toEqual([]);
  });
});

describe("buildSidebarCliLaunchItems", () => {
  it("returns only cli actions with their cliTool and key", () => {
    const items = buildSidebarCliLaunchItems(fakeT, false, false);
    expect(items.every((i) => CLI_TOOLS.includes(i.cliTool))).toBe(true);
    // no terminal-* keys leak in
    expect(items.some((i) => i.key.startsWith("terminal-"))).toBe(false);
    // default + local per tool
    expect(items).toHaveLength(CLI_TOOLS.length * 2);
  });

  it("maps action id to key and carries environment", () => {
    const items = buildSidebarCliLaunchItems(fakeT, true, false);
    const codexWsl = items.find((i) => i.key === "codex-wsl");
    expect(codexWsl).toMatchObject({ cliTool: "codex", environment: "wsl" });
    const claudeDefault = items.find((i) => i.key === "claude-default");
    expect(claudeDefault?.environment).toBeUndefined();
  });
});
