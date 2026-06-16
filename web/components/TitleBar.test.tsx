import "@/i18n";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TitleBar from "./TitleBar";

const mockUseBorderlessStore = vi.fn();
const mockStartDrag = vi.fn();
const mockCloseWindow = vi.fn();
const mockMinimizeWindow = vi.fn();
const mockMaximizeWindow = vi.fn();
const mockToggleFullscreenWindow = vi.fn();

vi.mock("@/stores", () => ({
  useBorderlessStore: (selector: (state: { isBorderless: boolean }) => boolean) =>
    selector({ isBorderless: mockUseBorderlessStore() }),
}));

vi.mock("@/hooks/useWindowControl", () => ({
  useWindowControl: () => ({
    closeWindow: mockCloseWindow,
    minimizeWindow: mockMinimizeWindow,
    maximizeWindow: mockMaximizeWindow,
    toggleFullscreenWindow: mockToggleFullscreenWindow,
    isMaximized: false,
    startDrag: mockStartDrag,
  }),
}));

describe("TitleBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBorderlessStore.mockReturnValue(false);
  });

  it("marks the whole titlebar as a native drag region", () => {
    const { container } = render(<TitleBar workspaceName="Workspace A" />);
    const titlebar = container.firstElementChild as HTMLDivElement;

    expect(titlebar).toHaveAttribute("data-tauri-drag-region", "");
    expect(screen.getByText("Workspace A")).toBeInTheDocument();
  });

  it("keeps window controls out of the drag region", () => {
    render(<TitleBar />);

    const minimizeButton = screen.getByTitle("最小化");

    fireEvent.click(minimizeButton);
    expect(mockMinimizeWindow).toHaveBeenCalledTimes(1);
    expect(mockStartDrag).not.toHaveBeenCalled();
  });

  it("starts dragging from the center spacer", () => {
    render(<TitleBar />);

    fireEvent.mouseDown(screen.getByTestId("titlebar-drag-spacer"), { button: 0 });

    expect(mockStartDrag).toHaveBeenCalledTimes(1);
  });

  it("toggles fullscreen on center spacer double click", () => {
    render(<TitleBar />);

    fireEvent.mouseDown(screen.getByTestId("titlebar-drag-spacer"), { button: 0, detail: 2 });

    expect(mockToggleFullscreenWindow).toHaveBeenCalledTimes(1);
    expect(mockStartDrag).not.toHaveBeenCalled();
  });

  it("toggles fullscreen on workspace title double click", () => {
    render(<TitleBar workspaceName="Workspace A" />);

    fireEvent.doubleClick(screen.getByText("Workspace A"));

    expect(mockToggleFullscreenWindow).toHaveBeenCalledTimes(1);
    expect(mockStartDrag).not.toHaveBeenCalled();
  });

  it("hides itself in borderless mode", () => {
    mockUseBorderlessStore.mockReturnValue(true);

    const { container } = render(<TitleBar />);

    expect(container).toBeEmptyDOMElement();
  });
});
