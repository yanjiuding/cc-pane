import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CCCHAN_SETTINGS, FALLBACK_PET, useCCChanStore } from "@/stores/useCCChanStore";
import { useTerminalStatusStore } from "@/stores";
import { CCChanApp } from "./CCChanApp";

type WebviewListener = (event: { payload: unknown }) => void;

const mockOuterPosition = vi.fn(() => Promise.resolve({ x: 200, y: 120 }));
const mockScaleFactor = vi.fn(() => Promise.resolve(1));
const mockClose = vi.fn(() => Promise.resolve());

vi.mock("@tauri-apps/api/window", () => ({
  currentMonitor: vi.fn(() => Promise.resolve(null)),
  getCurrentWindow: vi.fn(() => ({
    outerPosition: mockOuterPosition,
    scaleFactor: mockScaleFactor,
    close: mockClose,
  })),
}));

function createWebviewListenerRegistry() {
  const listeners = new Map<string, Set<WebviewListener>>();
  vi.mocked(getCurrentWebview().listen).mockImplementation(async (eventName, handler) => {
    const eventListeners = listeners.get(eventName) ?? new Set<WebviewListener>();
    const listener = handler as WebviewListener;
    eventListeners.add(listener);
    listeners.set(eventName, eventListeners);
    return () => {
      eventListeners.delete(listener);
    };
  });

  return {
    emit(eventName: string, payload: unknown) {
      for (const listener of listeners.get(eventName) ?? []) {
        listener({ payload });
      }
    },
    listenerCount(eventName: string) {
      return listeners.get(eventName)?.size ?? 0;
    },
  };
}

function mockCcChanInvoke() {
  const mockInvoke = invoke as ReturnType<typeof vi.fn>;
  mockInvoke.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
    if (cmd === "get_ccchan_settings") return Promise.resolve(DEFAULT_CCCHAN_SETTINGS);
    if (cmd === "get_ccchan_pets") return Promise.resolve([FALLBACK_PET]);
    if (cmd === "get_all_terminal_status") return Promise.resolve([]);
    if (cmd === "resize_ccchan_for_chat") return Promise.resolve(undefined);
    if (cmd === "resize_ccchan_for_menu") return Promise.resolve(undefined);
    if (cmd === "resize_ccchan_for_bubble") return Promise.resolve(undefined);
    if (cmd === "start_ccchan_chat") return Promise.resolve("chat-session");
    if (cmd === "is_ccchan_chat_session_alive") return Promise.resolve(args?.sessionId !== "dead-chat");
    return Promise.resolve(undefined);
  });
  return mockInvoke;
}

describe("CCChanApp pet interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createWebviewListenerRegistry();
    useCCChanStore.setState({
      settings: DEFAULT_CCCHAN_SETTINGS,
      pets: [FALLBACK_PET],
      expanded: false,
      chatSessionId: null,
      loading: false,
      loaded: false,
    });
    useTerminalStatusStore.setState({
      statusMap: new Map(),
      _unlisten: null,
      _idleCheckInterval: null,
      _initialized: false,
    });
  });

  it("opens chat on a fast left pointer click before window position resolves", async () => {
    const mockInvoke = mockCcChanInvoke();
    let resolvePosition: (position: { x: number; y: number }) => void = () => {};
    mockOuterPosition.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolvePosition = resolve;
      }),
    );

    render(<CCChanApp />);

    const pet = screen.getByTitle("打开 cc酱 chat");
    fireEvent.pointerDown(pet, {
      button: 0,
      pointerId: 7,
      screenX: 24,
      screenY: 24,
    });
    fireEvent.pointerUp(pet, {
      button: 0,
      pointerId: 7,
      screenX: 24,
      screenY: 24,
    });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("resize_ccchan_for_chat", { expanded: true });
    });
    resolvePosition({ x: 200, y: 120 });
  });

  it("opens the menu from right pointer down and can open chat from the menu", async () => {
    const mockInvoke = mockCcChanInvoke();

    render(<CCChanApp />);

    const pet = screen.getByTitle("打开 cc酱 chat");
    fireEvent.pointerDown(pet, {
      button: 2,
      pointerId: 8,
      screenX: 24,
      screenY: 24,
    });

    const openChatItem = await screen.findByRole("button", { name: "打开对话" });
    fireEvent.click(openChatItem);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("resize_ccchan_for_chat", { expanded: true });
    });
  });

  it("keeps the active chat transcript when the panel is closed and opened again", async () => {
    const listeners = createWebviewListenerRegistry();
    const mockInvoke = mockCcChanInvoke();

    render(<CCChanApp />);

    fireEvent.click(screen.getByTitle("打开 cc酱对话"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("start_ccchan_chat", {
        aiEngine: DEFAULT_CCCHAN_SETTINGS.aiEngine,
      });
    });
    await waitFor(() => {
      expect(listeners.listenerCount("ccchan-chat-output")).toBeGreaterThan(0);
    });

    act(() => {
      listeners.emit("ccchan-chat-output", {
        sessionId: "chat-session",
        role: "assistant",
        text: "这条回复关闭后还应该在。",
      });
    });

    expect(await screen.findByText("这条回复关闭后还应该在。")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("关闭 chat"));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("resize_ccchan_for_chat", { expanded: false });
    });

    fireEvent.click(screen.getByTitle("打开 cc酱对话"));

    expect(await screen.findByText("这条回复关闭后还应该在。")).toBeInTheDocument();
    expect(mockInvoke.mock.calls.filter(([cmd]) => cmd === "start_ccchan_chat")).toHaveLength(1);
  });
});
