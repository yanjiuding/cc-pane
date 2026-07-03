import "@/i18n";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "@/stores";
import type { AppSettings } from "@/types";
import HomeShortcuts from "./HomeShortcuts";

function settingsWithBindings(bindings: Record<string, string>): AppSettings {
  return { shortcuts: { bindings } } as unknown as AppSettings;
}

describe("HomeShortcuts", () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: null });
  });

  it("settings 为 null 时只渲染标题，无任何快捷键行", () => {
    render(<HomeShortcuts />);

    expect(screen.getByText("快捷键速查")).toBeVisible();
    expect(document.querySelectorAll("kbd")).toHaveLength(0);
  });

  it("按 bindings 渲染快捷键行，组合键拆成多个 kbd", () => {
    useSettingsStore.setState({
      settings: settingsWithBindings({
        "toggle-sidebar": "Ctrl+B",
        "new-tab": "Ctrl+Shift+T",
      }),
    });
    render(<HomeShortcuts />);

    expect(screen.getByText("折叠/展开侧边栏")).toBeVisible();
    expect(screen.getByText("新建标签")).toBeVisible();
    // Ctrl+B → 2 个 kbd；Ctrl+Shift+T → 3 个 kbd
    expect(document.querySelectorAll("kbd")).toHaveLength(5);
    expect(screen.getByText("B")).toBeVisible();
    expect(screen.getByText("Shift")).toBeVisible();
  });

  it("缺少绑定的快捷键项被跳过", () => {
    useSettingsStore.setState({
      settings: settingsWithBindings({ settings: "Ctrl+," }),
    });
    render(<HomeShortcuts />);

    expect(screen.getByText("打开设置")).toBeVisible();
    expect(screen.queryByText("关闭标签")).not.toBeInTheDocument();
    expect(screen.queryByText("切换全屏")).not.toBeInTheDocument();
  });

  it("不在展示清单内的绑定 id 不渲染", () => {
    useSettingsStore.setState({
      settings: settingsWithBindings({
        "some-unknown-action": "Ctrl+Alt+Z",
        "close-tab": "Ctrl+W",
      }),
    });
    render(<HomeShortcuts />);

    expect(screen.getByText("关闭标签")).toBeVisible();
    expect(screen.queryByText("Z")).not.toBeInTheDocument();
    // 只有 close-tab 的 Ctrl+W 两个键帽
    expect(document.querySelectorAll("kbd")).toHaveLength(2);
  });
});
