type TerminalKeyboardEvent = Pick<
  KeyboardEvent,
  "type" | "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey"
>;

export const TERMINAL_ALT_ENTER_SEQUENCE = "\x1b\r";

export function isTerminalPasteShortcut(
  event: TerminalKeyboardEvent,
  isMac: boolean,
): boolean {
  if (event.type !== "keydown") return false;
  if (event.altKey) return false;
  if (event.key !== "v" && event.key !== "V") return false;

  if (isMac) {
    return event.metaKey && !event.ctrlKey;
  }

  return event.ctrlKey && !event.metaKey;
}

export function isTerminalShiftEnterShortcut(event: TerminalKeyboardEvent): boolean {
  return (
    event.type === "keydown" &&
    event.key === "Enter" &&
    event.shiftKey === true &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  );
}
