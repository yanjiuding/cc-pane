import { describe, expect, it, vi } from "vitest";
import { isDropInsideTerminalHost } from "./terminalDrop";

describe("terminalDrop", () => {
  it("matches a drop target inside the terminal host", () => {
    const host = document.createElement("div");
    const child = document.createElement("span");
    host.appendChild(child);
    document.body.appendChild(host);

    expect(
      isDropInsideTerminalHost(host, { x: 12, y: 24 }, () => child, 1)
    ).toBe(true);

    host.remove();
  });

  it("scales physical drop coordinates by device pixel ratio", () => {
    const host = document.createElement("div");
    const child = document.createElement("span");
    host.appendChild(child);
    document.body.appendChild(host);
    const elementFromPoint = vi.fn(() => child);

    expect(
      isDropInsideTerminalHost(host, { x: 40, y: 80 }, elementFromPoint, 2)
    ).toBe(true);
    expect(elementFromPoint).toHaveBeenCalledWith(20, 40);

    host.remove();
  });

  it("ignores a drop target outside the terminal host", () => {
    const host = document.createElement("div");
    const outside = document.createElement("span");
    document.body.append(host, outside);

    expect(
      isDropInsideTerminalHost(host, { x: 10, y: 20 }, () => outside, 1)
    ).toBe(false);

    host.remove();
    outside.remove();
  });

  it("ignores drops without an element target", () => {
    const host = document.createElement("div");

    expect(
      isDropInsideTerminalHost(host, { x: 10, y: 20 }, () => null, 1)
    ).toBe(false);
  });
});
