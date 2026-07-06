import { describe, expect, it } from "vitest";
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  fontFamilyHasCjkFallback,
  normalizeTerminalFontFamily,
} from "./terminalFont";

describe("normalizeTerminalFontFamily", () => {
  it("returns the default chain for empty values", () => {
    expect(normalizeTerminalFontFamily(undefined)).toBe(DEFAULT_TERMINAL_FONT_FAMILY);
    expect(normalizeTerminalFontFamily(null)).toBe(DEFAULT_TERMINAL_FONT_FAMILY);
    expect(normalizeTerminalFontFamily("   ")).toBe(DEFAULT_TERMINAL_FONT_FAMILY);
  });

  it("keeps chains that already contain a CJK-capable font", () => {
    const value = '"JetBrains Mono", "Sarasa Mono SC", monospace';
    expect(normalizeTerminalFontFamily(value)).toBe(value);
    expect(normalizeTerminalFontFamily(DEFAULT_TERMINAL_FONT_FAMILY)).toBe(
      DEFAULT_TERMINAL_FONT_FAMILY,
    );
  });

  it("appends a CJK fallback before the generic monospace entry", () => {
    const result = normalizeTerminalFontFamily('Consolas, "Courier New", monospace');
    expect(result).toContain("Consolas");
    expect(result).toContain('"Microsoft YaHei UI"');
    expect(result.indexOf("Consolas")).toBeLessThan(result.indexOf('"Microsoft YaHei UI"'));
    expect(result.trim().endsWith("monospace")).toBe(true);
  });

  it("appends a CJK fallback and generic monospace when the chain has no generic entry", () => {
    const result = normalizeTerminalFontFamily('"Cascadia Mono"');
    expect(result).toContain('"Cascadia Mono"');
    expect(result).toContain('"Sarasa Mono SC"');
    expect(result.trim().endsWith("monospace")).toBe(true);
  });
});

describe("fontFamilyHasCjkFallback", () => {
  it("detects CJK-capable fonts case-insensitively", () => {
    expect(fontFamilyHasCjkFallback("Consolas, MICROSOFT YAHEI")).toBe(true);
    expect(fontFamilyHasCjkFallback("Consolas, 微软雅黑")).toBe(true);
    expect(fontFamilyHasCjkFallback('Consolas, "Courier New", monospace')).toBe(false);
  });
});
