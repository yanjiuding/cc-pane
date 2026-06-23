import { describe, expect, it } from "vitest";
import {
  detectFocusReportMode,
  isXtermFocusReportInput,
  XTERM_FOCUS_IN_REPORT,
  XTERM_FOCUS_OUT_REPORT,
} from "./terminalFocusReport";

describe("terminal focus reports", () => {
  it("detects xterm focus report input sequences", () => {
    expect(isXtermFocusReportInput(XTERM_FOCUS_IN_REPORT)).toBe(true);
    expect(isXtermFocusReportInput(XTERM_FOCUS_OUT_REPORT)).toBe(true);
    expect(isXtermFocusReportInput("\x1b[A")).toBe(false);
    expect(isXtermFocusReportInput("\x1b")).toBe(false);
    expect(isXtermFocusReportInput("@")).toBe(false);
  });

  it("tracks focus reporting mode from backend output", () => {
    expect(detectFocusReportMode("hello", false)).toBe(false);
    expect(detectFocusReportMode("\x1b[?1004h", false)).toBe(true);
    expect(detectFocusReportMode("before\x1b[?1004hafter", false)).toBe(true);
    expect(detectFocusReportMode("\x1b[?1004l", true)).toBe(false);
    expect(detectFocusReportMode("\x1b[?1004h\x1b[?1004l", false)).toBe(false);
  });
});
