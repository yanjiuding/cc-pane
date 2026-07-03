import "@/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import BorderlessFloatingButton from "./BorderlessFloatingButton";
import { useBorderlessStore } from "@/stores";
import { TooltipProvider } from "@/components/ui/tooltip";
import { mockTauriInvoke } from "@/test/utils/mockTauriInvoke";

// Radix Tooltip 打开时经 react-use-size 依赖 ResizeObserver，jsdom 未实现，补桩避免
// 点击触发 hover 挂载 TooltipContent 时抛未捕获异常（全量跑时时序敏感、单跑偶现通过）
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = window.ResizeObserver ?? (ResizeObserverStub as unknown as typeof ResizeObserver);

function resetStore(isBorderless: boolean) {
  useBorderlessStore.setState({ isBorderless });
}

function renderWithProvider(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("BorderlessFloatingButton", () => {
  beforeEach(() => {
    mockTauriInvoke({ set_decorations: null });
    resetStore(false);
  });

  it("非无边框模式下不渲染任何内容", () => {
    const { container } = renderWithProvider(<BorderlessFloatingButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it("无边框模式下渲染退出按钮", () => {
    resetStore(true);
    renderWithProvider(<BorderlessFloatingButton />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("点击按钮退出无边框模式并卸载按钮", async () => {
    const user = userEvent.setup();
    resetStore(true);
    renderWithProvider(<BorderlessFloatingButton />);

    await user.click(screen.getByRole("button"));

    // exitBorderless 会异步走 invokeIfTauri(set_decorations) 再置 isBorderless=false
    await waitFor(() => expect(useBorderlessStore.getState().isBorderless).toBe(false));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
