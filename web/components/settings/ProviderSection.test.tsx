import "@/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProviderSection from "./ProviderSection";

vi.mock("@/components/providers", () => ({
  ProvidersPanel: vi.fn(({ compact }: { compact?: boolean }) => (
    <div data-testid="providers-panel" data-compact={String(compact)} />
  )),
}));

describe("ProviderSection", () => {
  it("renders ProvidersPanel in compact mode", () => {
    render(<ProviderSection />);

    const panel = screen.getByTestId("providers-panel");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAttribute("data-compact", "true");
  });
});
