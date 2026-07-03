import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import OrchestrationOverlay from "./OrchestrationOverlay";

interface FullViewProps {
  variant?: string;
  onClose?: () => void;
}

let lastFullViewProps: FullViewProps | null = null;

vi.mock("./OrchestrationFullView", () => ({
  default: (props: FullViewProps) => {
    lastFullViewProps = props;
    return <div data-testid="full-view" />;
  },
}));

describe("OrchestrationOverlay", () => {
  it("renders the full view in overlay variant inside a modal dialog", () => {
    render(<OrchestrationOverlay onClose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Orchestration" })).toBeInTheDocument();
    expect(screen.getByTestId("full-view")).toBeInTheDocument();
    expect(lastFullViewProps?.variant).toBe("overlay");
  });

  it("closes when the backdrop button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OrchestrationOverlay onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Close orchestration overlay" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("passes the same onClose down to the full view", () => {
    const onClose = vi.fn();
    render(<OrchestrationOverlay onClose={onClose} />);

    lastFullViewProps?.onClose?.();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking inside the dialog does not close the overlay", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OrchestrationOverlay onClose={onClose} />);

    await user.click(screen.getByTestId("full-view"));

    expect(onClose).not.toHaveBeenCalled();
  });
});
