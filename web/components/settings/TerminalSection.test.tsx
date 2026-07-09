import "@/i18n";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TerminalSettings } from "@/types";
import TerminalSection from "./TerminalSection";

function createValue(overrides: Partial<TerminalSettings> = {}): TerminalSettings {
  return {
    fontSize: 15,
    fontFamily: "Consolas",
    cursorStyle: "block",
    cursorBlink: true,
    scrollback: 5000,
    themeMode: "followApp",
    rendererMode: "auto",
    shell: null,
    disableConptySanitize: null,
    resumeIdBackfillEnabled: null,
    daemonEnabled: false,
    daemonOrphanTtlMinutes: 0,
    ...overrides,
  };
}

describe("TerminalSection", () => {
  it("emits fontSize changes as numbers", () => {
    const onChange = vi.fn();
    render(<TerminalSection value={createValue()} onChange={onChange} />);

    const fontSizeInput = screen.getByDisplayValue("15");
    fireEvent.change(fontSizeInput, { target: { value: "18" } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ fontSize: 18 }));
  });

  it("clamps fontSize into [10, 32] on blur", () => {
    const onChange = vi.fn();
    const { rerender } = render(<TerminalSection value={createValue({ fontSize: 99 })} onChange={onChange} />);

    fireEvent.blur(screen.getByDisplayValue("99"), { target: { value: "99" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ fontSize: 32 }));

    rerender(<TerminalSection value={createValue({ fontSize: 2 })} onChange={onChange} />);
    fireEvent.blur(screen.getByDisplayValue("2"), { target: { value: "2" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ fontSize: 10 }));
  });

  it("falls back to 15 when the blurred fontSize is not a number", () => {
    const onChange = vi.fn();
    render(<TerminalSection value={createValue({ fontSize: 20 })} onChange={onChange} />);

    fireEvent.blur(screen.getByDisplayValue("20"), { target: { value: "" } });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ fontSize: 15 }));
  });

  it("does not emit on blur when the clamped value equals the current one", () => {
    const onChange = vi.fn();
    render(<TerminalSection value={createValue({ fontSize: 16 })} onChange={onChange} />);

    fireEvent.blur(screen.getByDisplayValue("16"), { target: { value: "16" } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("emits theme, cursor style and renderer select changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TerminalSection value={createValue()} onChange={onChange} />);

    const selects = screen.getAllByRole("combobox");
    // 顺序：themeMode → cursorStyle → rendererMode
    await user.selectOptions(selects[0], "dark");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ themeMode: "dark" }));

    await user.selectOptions(selects[1], "bar");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ cursorStyle: "bar" }));

    await user.selectOptions(selects[2], "webgl");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ rendererMode: "webgl" }));
  });

  it("emits null when the shell input is cleared", () => {
    const onChange = vi.fn();
    render(<TerminalSection value={createValue({ shell: "pwsh" })} onChange={onChange} />);

    fireEvent.change(screen.getByDisplayValue("pwsh"), { target: { value: "" } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ shell: null }));
  });

  it("treats a null resumeIdBackfillEnabled as unchecked and toggles it on", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TerminalSection value={createValue()} onChange={onChange} />);

    const checkboxes = screen.getAllByRole("checkbox");
    // 顺序：cursorBlink → resumeIdBackfillEnabled
    expect(checkboxes[1]).not.toBeChecked();
    await user.click(checkboxes[1]);

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ resumeIdBackfillEnabled: true }));
  });
});
