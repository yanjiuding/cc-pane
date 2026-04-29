type TerminalKeyboardEvent = Pick<
  KeyboardEvent,
  "type" | "key" | "ctrlKey" | "metaKey" | "altKey"
>;

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
