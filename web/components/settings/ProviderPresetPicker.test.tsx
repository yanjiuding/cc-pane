import "@/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PRESET_CATEGORIES, PROVIDER_PRESETS } from "@/constants/providerPresets";
import ProviderPresetPicker from "./ProviderPresetPicker";

describe("ProviderPresetPicker", () => {
  it("renders one button per preset", () => {
    render(<ProviderPresetPicker onSelect={vi.fn()} />);

    expect(screen.getAllByRole("button")).toHaveLength(PROVIDER_PRESETS.length);
  });

  it("only renders categories that have presets", () => {
    render(<ProviderPresetPicker onSelect={vi.fn()} />);

    const nonEmptyCategories = PRESET_CATEGORIES.filter((cat) =>
      PROVIDER_PRESETS.some((p) => p.category === cat.key),
    );
    // 每个非空分类有一个标题节点（uppercase tracking-wide 的分组标签）
    const groupLabels = document.querySelectorAll(".uppercase");
    expect(groupLabels).toHaveLength(nonEmptyCategories.length);
  });

  it("calls onSelect with the clicked preset", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ProviderPresetPicker onSelect={onSelect} />);

    await user.click(screen.getAllByRole("button")[0]);

    expect(onSelect).toHaveBeenCalledTimes(1);
    // 第一个分类的第一个 preset
    const firstCategory = PRESET_CATEGORIES.find((cat) =>
      PROVIDER_PRESETS.some((p) => p.category === cat.key),
    )!;
    const firstPreset = PROVIDER_PRESETS.filter((p) => p.category === firstCategory.key)[0];
    expect(onSelect).toHaveBeenCalledWith(firstPreset);
  });

  it("hides the custom chip unless both showCustom and onCustom are provided", () => {
    const { rerender } = render(<ProviderPresetPicker onSelect={vi.fn()} showCustom />);
    expect(screen.getAllByRole("button")).toHaveLength(PROVIDER_PRESETS.length);

    rerender(<ProviderPresetPicker onSelect={vi.fn()} onCustom={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(PROVIDER_PRESETS.length);
  });

  it("calls onCustom when the custom chip is clicked", async () => {
    const user = userEvent.setup();
    const onCustom = vi.fn();
    render(<ProviderPresetPicker onSelect={vi.fn()} showCustom onCustom={onCustom} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(PROVIDER_PRESETS.length + 1);
    await user.click(buttons[buttons.length - 1]);

    expect(onCustom).toHaveBeenCalledTimes(1);
  });
});
