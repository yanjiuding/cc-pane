import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { error as logError } from "@tauri-apps/plugin-log";
import type { ReactElement } from "react";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import ErrorBoundary from "./ErrorBoundary";

vi.mock("@tauri-apps/plugin-log", () => ({
  error: vi.fn(() => Promise.resolve()),
}));

function CrashingChild(): ReactElement {
  throw new Error("boundary boom");
}

describe("ErrorBoundary", () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const logDir = "C:\\Users\\customer\\AppData\\Local\\com.ccpanes.app\\logs";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockImplementation((command, args) => {
      if (command === "get_log_dir") {
        return Promise.resolve(logDir);
      }
      if (command === "open_path_in_explorer") {
        return Promise.resolve(args);
      }
      return Promise.resolve(null);
    });
  });

  afterAll(() => {
    consoleError.mockRestore();
  });

  test("捕获 React 崩溃后写入日志并显示日志目录", async () => {
    render(
      <ErrorBoundary>
        <CrashingChild />
      </ErrorBoundary>,
    );

    await waitFor(() => {
      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining("[frontend-crash] react-error-boundary"),
      );
    });

    expect(logError).toHaveBeenCalledWith(expect.stringContaining("boundary boom"));
    expect(await screen.findByText(logDir)).toBeInTheDocument();
    expect(screen.getByText(/最新 cc-panes\*\.log/)).toBeInTheDocument();
    expect(screen.getByText(/GitHub Issue/)).toBeInTheDocument();
    expect(screen.getByText(/github\.com\/wuxiran\/cc-pane\/issues\/new/)).toBeInTheDocument();
  });

  test("错误页可以打开日志目录", async () => {
    const user = userEvent.setup();

    render(
      <ErrorBoundary>
        <CrashingChild />
      </ErrorBoundary>,
    );

    await screen.findByText(logDir);
    await user.click(screen.getByRole("button", { name: "打开日志目录" }));

    expect(invoke).toHaveBeenCalledWith("open_path_in_explorer", { path: logDir });
  });
});
