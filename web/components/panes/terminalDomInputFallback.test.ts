import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  attachTerminalDomInputFallback,
  getDomTextInputFallbackData,
} from "./terminalDomInputFallback";

function createInputEvent(
  type: "beforeinput" | "input",
  options: InputEventInit,
): InputEvent {
  return new InputEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    ...options,
  });
}

describe("terminal DOM input fallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("accepts only single printable insertText events", () => {
    expect(getDomTextInputFallbackData(createInputEvent("input", {
      inputType: "insertText",
      data: "@",
    }))).toBe("@");
    expect(getDomTextInputFallbackData(createInputEvent("input", {
      inputType: "insertText",
      data: "ab",
    }))).toBeNull();
    expect(getDomTextInputFallbackData(createInputEvent("input", {
      inputType: "deleteContentBackward",
      data: null,
    }))).toBeNull();
    expect(getDomTextInputFallbackData(createInputEvent("input", {
      inputType: "insertText",
      data: "\r",
    }))).toBeNull();
    expect(getDomTextInputFallbackData(createInputEvent("input", {
      inputType: "insertText",
      data: "@",
      isComposing: true,
    }))).toBeNull();
  });

  it("does not fallback when xterm onData arrives before input confirmation", async () => {
    const textarea = document.createElement("textarea");
    const onFallbackData = vi.fn();
    const fallback = attachTerminalDomInputFallback({
      textarea,
      onFallbackData,
      nextTraceId: () => 1,
    });

    textarea.dispatchEvent(createInputEvent("beforeinput", {
      inputType: "insertText",
      data: "@",
    }));
    fallback.recordXtermData("@");
    textarea.dispatchEvent(createInputEvent("input", {
      inputType: "insertText",
      data: "@",
    }));

    await vi.runAllTimersAsync();

    expect(onFallbackData).not.toHaveBeenCalled();
    fallback.dispose();
  });

  it("falls back when DOM input is confirmed but xterm onData is missing", async () => {
    const textarea = document.createElement("textarea");
    const onFallbackData = vi.fn();
    const fallback = attachTerminalDomInputFallback({
      textarea,
      onFallbackData,
      nextTraceId: () => 7,
    });

    textarea.dispatchEvent(createInputEvent("beforeinput", {
      inputType: "insertText",
      data: "@",
    }));
    textarea.dispatchEvent(createInputEvent("input", {
      inputType: "insertText",
      data: "@",
    }));

    await vi.advanceTimersByTimeAsync(32);

    expect(onFallbackData).toHaveBeenCalledWith("@", 7);
    fallback.dispose();
  });

  it("cancels fallback when xterm onData arrives after input confirmation", async () => {
    const textarea = document.createElement("textarea");
    const onFallbackData = vi.fn();
    const fallback = attachTerminalDomInputFallback({
      textarea,
      onFallbackData,
      nextTraceId: () => 8,
    });

    textarea.dispatchEvent(createInputEvent("beforeinput", {
      inputType: "insertText",
      data: "#",
    }));
    textarea.dispatchEvent(createInputEvent("input", {
      inputType: "insertText",
      data: "#",
    }));
    await vi.advanceTimersByTimeAsync(16);
    fallback.recordXtermData("#");
    await vi.runAllTimersAsync();

    expect(onFallbackData).not.toHaveBeenCalled();
    fallback.dispose();
  });

  it("matches batched xterm data to multiple pending DOM inputs", async () => {
    const textarea = document.createElement("textarea");
    const onFallbackData = vi.fn();
    const fallback = attachTerminalDomInputFallback({
      textarea,
      onFallbackData,
      nextTraceId: vi.fn()
        .mockReturnValueOnce(1)
        .mockReturnValueOnce(2),
    });

    textarea.dispatchEvent(createInputEvent("beforeinput", {
      inputType: "insertText",
      data: "a",
    }));
    textarea.dispatchEvent(createInputEvent("beforeinput", {
      inputType: "insertText",
      data: "b",
    }));
    fallback.recordXtermData("ab");
    textarea.dispatchEvent(createInputEvent("input", {
      inputType: "insertText",
      data: "a",
    }));
    textarea.dispatchEvent(createInputEvent("input", {
      inputType: "insertText",
      data: "b",
    }));

    await vi.runAllTimersAsync();

    expect(onFallbackData).not.toHaveBeenCalled();
    fallback.dispose();
  });
});
