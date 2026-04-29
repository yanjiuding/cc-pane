import { describe, expect, it } from "vitest";
import {
  buildKittyKeyboardProtocolReport,
  buildPrimaryDeviceAttributesReport,
} from "./terminalCapabilityReports";

describe("terminal capability reports", () => {
  it("responds to primary device attributes requests", () => {
    expect(buildPrimaryDeviceAttributesReport([], undefined)).toBe("\x1b[?1;2c");
    expect(buildPrimaryDeviceAttributesReport([0], undefined)).toBe("\x1b[?1;2c");
  });

  it("ignores non-primary device attributes requests", () => {
    expect(buildPrimaryDeviceAttributesReport([1], undefined)).toBeNull();
    expect(buildPrimaryDeviceAttributesReport([], ">")).toBeNull();
  });

  it("reports no Kitty keyboard protocol flags", () => {
    expect(buildKittyKeyboardProtocolReport([], "?")).toBe("\x1b[?0u");
    expect(buildKittyKeyboardProtocolReport([0], "?")).toBe("\x1b[?0u");
  });

  it("ignores non-query Kitty keyboard protocol sequences", () => {
    expect(buildKittyKeyboardProtocolReport([1], "?")).toBeNull();
    expect(buildKittyKeyboardProtocolReport([], ">")).toBeNull();
  });
});
