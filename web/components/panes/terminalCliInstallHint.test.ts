import { describe, expect, it } from "vitest";
import { getCliInstallHint } from "./terminalCliInstallHint";

describe("terminal CLI install hints", () => {
  it("uses the npm package name for OpenCode", () => {
    expect(getCliInstallHint("opencode")).toBe("Install OpenCode with: npm install -g opencode-ai");
    expect(getCliInstallHint("OpenCode")).toBe("Install OpenCode with: npm install -g opencode-ai");
  });

  it("returns no hint for generic tools", () => {
    expect(getCliInstallHint("claude")).toBeNull();
  });
});
