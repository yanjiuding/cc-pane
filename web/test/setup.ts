import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

if (typeof window !== "undefined") {
  window.__TAURI_INTERNALS__ = {};
}

// jsdom 未实现 ResizeObserver，而 Radix（Tooltip/Popover 等）在挂载时会用到。
// 用直接赋值而非 vi.stubGlobal——后者会被个别测试的 vi.unstubAllGlobals() 清除，
// 导致依赖它的组件测试在全量套件里随机崩溃（ReferenceError: ResizeObserver is not defined）。
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// 每个测试后自动清理 DOM
afterEach(() => {
  cleanup();
});

// Mock Tauri API
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(),
  emitTo: vi.fn(),
}));

vi.mock("@tauri-apps/api/webview", () => {
  const webview = {
    listen: vi.fn(() => Promise.resolve(() => {})),
    onDragDropEvent: vi.fn(() => Promise.resolve(() => {})),
  };
  return {
    getCurrentWebview: vi.fn(() => webview),
  };
});

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
  message: vi.fn(),
  ask: vi.fn(),
  confirm: vi.fn(),
}));
