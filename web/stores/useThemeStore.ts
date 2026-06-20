import { create } from "zustand";

export type Theme = "light" | "dark";
type ThemePreference = Theme | "system";

const STORAGE_KEY = "theme";

interface ThemeState {
  isDark: boolean;
  setThemeMode: (theme: ThemePreference) => void;
  toggleTheme: () => void;
}

function getSystemTheme(): Theme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveThemeMode(theme: ThemePreference | null | undefined): Theme {
  if (theme === "light" || theme === "dark") {
    return theme;
  }
  if (theme === "system") {
    return getSystemTheme();
  }
  return "dark";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures in restricted environments.
  }
}

// 初始化主题
const stored = typeof localStorage === "undefined"
  ? null
  : (localStorage.getItem(STORAGE_KEY) as ThemePreference | null);
const initialTheme = resolveThemeMode(stored);
applyTheme(initialTheme);

export const useThemeStore = create<ThemeState>((set, get) => ({
  isDark: initialTheme === "dark",

  setThemeMode: (theme: ThemePreference) => {
    const next = resolveThemeMode(theme);
    applyTheme(next);
    set({ isDark: next === "dark" });
  },

  toggleTheme: () => {
    const next: Theme = get().isDark ? "light" : "dark";
    applyTheme(next);
    set({ isDark: next === "dark" });
  },
}));
