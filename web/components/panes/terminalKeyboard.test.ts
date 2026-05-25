import { describe, expect, it } from "vitest";
import {
  TERMINAL_ALT_ENTER_SEQUENCE,
  isTerminalPasteShortcut,
  isTerminalShiftEnterShortcut,
} from "./terminalKeyboard";

function keyboardEvent(
  overrides: Partial<KeyboardEvent>,
): Pick<KeyboardEvent, "type" | "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey"> {
  return {
    type: "keydown",
    key: "v",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  } as KeyboardEvent;
}

describe("isTerminalPasteShortcut", () => {
  it("handles Ctrl+V on non-mac platforms", () => {
    expect(isTerminalPasteShortcut(keyboardEvent({ ctrlKey: true }), false)).toBe(true);
  });

  it("handles Ctrl+Shift+V on non-mac platforms", () => {
    expect(
      isTerminalPasteShortcut(
        keyboardEvent({ ctrlKey: true, shiftKey: true }),
        false,
      ),
    ).toBe(true);
  });

  it("handles Cmd+V on macOS", () => {
    expect(isTerminalPasteShortcut(keyboardEvent({ metaKey: true }), true)).toBe(true);
  });

  it("does not handle Ctrl+V on macOS", () => {
    expect(isTerminalPasteShortcut(keyboardEvent({ ctrlKey: true }), true)).toBe(false);
  });

  it("does not handle Alt+V", () => {
    expect(
      isTerminalPasteShortcut(
        keyboardEvent({ ctrlKey: true, altKey: true }),
        false,
      ),
    ).toBe(false);
  });

  it("ignores keyup events", () => {
    expect(
      isTerminalPasteShortcut(
        keyboardEvent({ type: "keyup", ctrlKey: true }),
        false,
      ),
    ).toBe(false);
  });
});

describe("isTerminalShiftEnterShortcut", () => {
  it("handles Shift+Enter", () => {
    expect(
      isTerminalShiftEnterShortcut(
        keyboardEvent({ key: "Enter", shiftKey: true }),
      ),
    ).toBe(true);
  });

  it("uses the same input sequence as xterm Alt+Enter", () => {
    expect(TERMINAL_ALT_ENTER_SEQUENCE).toBe("\x1b\r");
  });

  it("ignores plain Enter", () => {
    expect(isTerminalShiftEnterShortcut(keyboardEvent({ key: "Enter" }))).toBe(false);
  });

  it("ignores Shift+Enter with additional modifiers", () => {
    expect(
      isTerminalShiftEnterShortcut(
        keyboardEvent({ key: "Enter", shiftKey: true, ctrlKey: true }),
      ),
    ).toBe(false);
    expect(
      isTerminalShiftEnterShortcut(
        keyboardEvent({ key: "Enter", shiftKey: true, altKey: true }),
      ),
    ).toBe(false);
  });

  it("ignores keyup events", () => {
    expect(
      isTerminalShiftEnterShortcut(
        keyboardEvent({ type: "keyup", key: "Enter", shiftKey: true }),
      ),
    ).toBe(false);
  });
});
