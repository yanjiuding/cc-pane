import "@/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { NotificationSettings } from "@/types";
import NotificationSection from "./NotificationSection";

function createValue(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return {
    enabled: true,
    onExit: false,
    onWaitingInput: true,
    onlyWhenUnfocused: false,
    ...overrides,
  };
}

describe("NotificationSection", () => {
  it("renders four checkboxes reflecting the current value", () => {
    render(<NotificationSection value={createValue()} onChange={vi.fn()} />);

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(4);
    expect(checkboxes[0]).toBeChecked(); // enabled
    expect(checkboxes[1]).not.toBeChecked(); // onExit
    expect(checkboxes[2]).toBeChecked(); // onWaitingInput
    expect(checkboxes[3]).not.toBeChecked(); // onlyWhenUnfocused
  });

  it("emits an immutable update when toggling a sub option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const value = createValue();
    render(<NotificationSection value={value} onChange={onChange} />);

    await user.click(screen.getAllByRole("checkbox")[1]);

    expect(onChange).toHaveBeenCalledWith({ ...value, onExit: true });
    // 原对象不被修改
    expect(value.onExit).toBe(false);
  });

  it("emits enabled=false when the master switch is unchecked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NotificationSection value={createValue()} onChange={onChange} />);

    await user.click(screen.getAllByRole("checkbox")[0]);

    expect(onChange).toHaveBeenCalledWith(createValue({ enabled: false }));
  });

  it("disables sub options when notifications are disabled", () => {
    render(<NotificationSection value={createValue({ enabled: false })} onChange={vi.fn()} />);

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).not.toBeDisabled();
    expect(checkboxes[1]).toBeDisabled();
    expect(checkboxes[2]).toBeDisabled();
    expect(checkboxes[3]).toBeDisabled();
  });
});
