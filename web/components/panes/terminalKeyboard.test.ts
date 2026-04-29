import { describe, expect, it } from "vitest";
import { isTerminalPasteShortcut } from "./terminalKeyboard";

function keyboardEvent(
  overrides: Partial<KeyboardEvent>,
): Pick<KeyboardEvent, "type" | "key" | "ctrlKey" | "metaKey" | "altKey"> {
  return {
    type: "keydown",
    key: "v",
    ctrlKey: false,
    metaKey: false,
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
