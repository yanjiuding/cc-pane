import { listenIfTauri } from "@/services/runtime";
import { readClipboardText } from "@/components/panes/terminalClipboard";
import { devDebugLog } from "@/utils/devLogger";

export const APP_MENU_PASTE_EVENT = "cc-panes://menu-paste";
export const TERMINAL_APP_MENU_PASTE_EVENT = "cc-panes-terminal-menu-paste";

let installed = false;

interface AppMenuPastePayload {
  source?: "menu" | "native-key-monitor" | string;
}

function editableTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest("input, textarea, [contenteditable='true'], [contenteditable='']");
}

function insertTextIntoEditable(target: HTMLElement, text: string): boolean {
  if (!text) return true;

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    target.setRangeText(text, start, end, "end");
    target.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertFromPaste",
      data: text,
    }));
    return true;
  }

  target.focus();
  return document.execCommand("insertText", false, text);
}

export function installAppMenuPasteHandler(): void {
  if (installed) return;
  installed = true;

  void listenIfTauri<AppMenuPastePayload>(APP_MENU_PASTE_EVENT, async (event) => {
    const active = document.activeElement;
    devDebugLog("app-menu", "paste", {
      source: event.payload?.source ?? "unknown",
      activeTag: active instanceof HTMLElement ? active.tagName : null,
      terminalInput: active instanceof HTMLElement
        ? active.getAttribute("data-cc-panes-terminal-input") === "true"
        : false,
    });

    if (
      active instanceof HTMLTextAreaElement &&
      active.getAttribute("data-cc-panes-terminal-input") === "true"
    ) {
      active.dispatchEvent(new CustomEvent(TERMINAL_APP_MENU_PASTE_EVENT, {
        bubbles: true,
        detail: {
          source: event.payload?.source ?? "unknown",
        },
      }));
      return;
    }

    const editable = editableTarget(active);
    if (!editable) return;

    const text = await readClipboardText();
    insertTextIntoEditable(editable, text);
  });
}
