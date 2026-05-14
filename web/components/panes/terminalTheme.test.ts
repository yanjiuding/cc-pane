import { describe, expect, it } from "vitest";
import {
  DARK_TERMINAL_THEME,
  LIGHT_TERMINAL_THEME,
  getTerminalTheme,
  resolveTerminalThemeMode,
} from "./terminalTheme";

describe("terminalTheme", () => {
  it("follows the app theme by default", () => {
    expect(getTerminalTheme(true)).toBe(DARK_TERMINAL_THEME);
    expect(getTerminalTheme(false)).toBe(LIGHT_TERMINAL_THEME);
    expect(getTerminalTheme(true, "followApp")).toBe(DARK_TERMINAL_THEME);
    expect(getTerminalTheme(false, "followApp")).toBe(LIGHT_TERMINAL_THEME);
  });

  it("allows terminal theme to override the app theme", () => {
    expect(getTerminalTheme(false, "dark")).toBe(DARK_TERMINAL_THEME);
    expect(getTerminalTheme(true, "light")).toBe(LIGHT_TERMINAL_THEME);
  });

  it("normalizes unknown theme modes to followApp", () => {
    expect(resolveTerminalThemeMode("unknown")).toBe("followApp");
    expect(resolveTerminalThemeMode(null)).toBe("followApp");
  });
});
