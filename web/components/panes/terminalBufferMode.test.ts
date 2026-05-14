import { describe, expect, it } from "vitest";
import {
  detectAlternateBufferTransitions,
  shouldKeepCliOutputInNormalBuffer,
  stripAlternateBufferSequences,
} from "./terminalBufferMode";

describe("terminalBufferMode", () => {
  it("detects alternate buffer enter and exit sequences", () => {
    expect(detectAlternateBufferTransitions("\x1b[?1049hbody\x1b[?1049l")).toEqual([
      { mode: "1049", action: "enter" },
      { mode: "1049", action: "exit" },
    ]);
  });

  it("strips alternate buffer sequences without changing content", () => {
    expect(stripAlternateBufferSequences("a\x1b[?1049hb\x1b[?1049lc")).toBe("abc");
  });

  it("keeps Codex output in the normal buffer", () => {
    expect(shouldKeepCliOutputInNormalBuffer("codex")).toBe(true);
    expect(shouldKeepCliOutputInNormalBuffer("claude")).toBe(false);
    expect(shouldKeepCliOutputInNormalBuffer("none")).toBe(false);
  });
});
