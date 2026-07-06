import { describe, expect, it } from "vitest";
import { getCCChanLayout } from "./ccchanLayout";

describe("getCCChanLayout", () => {
  it("restores legacy layout values at the default pet size (120)", () => {
    const layout = getCCChanLayout(120);
    expect([layout.bubbleW, layout.bubbleH]).toEqual([300, 220]);
    expect([layout.menuW, layout.menuH]).toEqual([300, 280]);
    expect([layout.chatW, layout.chatH]).toEqual([460, 680]);
    expect(layout.bubblePetLeft).toBe(10);
    expect(layout.bubblePetTop).toBe(96);
    expect(layout.bubbleTextW).toBe(260);
    expect(layout.chatPanelTop).toBe(148);
    expect([layout.chatPanelW, layout.chatPanelH]).toEqual([432, 508]);
  });

  it("scales up with larger pet sizes", () => {
    const layout = getCCChanLayout(240);
    expect([layout.bubbleW, layout.bubbleH]).toEqual([420, 340]);
    expect([layout.chatW, layout.chatH]).toEqual([580, 800]);
    expect(layout.chatPanelTop).toBe(268);
    // chat 面板净高保持恒定（顶部预留随 petSize 增长）
    expect(layout.chatPanelH).toBe(508);
  });

  it("floors window sizes at legacy minimums for small pets", () => {
    const layout = getCCChanLayout(80);
    expect([layout.bubbleW, layout.bubbleH]).toEqual([300, 220]);
    expect([layout.menuW, layout.menuH]).toEqual([300, 280]);
    expect([layout.chatW, layout.chatH]).toEqual([460, 680]);
    expect(layout.bubblePetTop).toBe(136);
  });
});
