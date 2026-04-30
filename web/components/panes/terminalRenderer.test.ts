import { describe, expect, it } from "vitest";
import {
  decideTerminalRenderer,
  isWebKitTerminalRendererHost,
  normalizeTerminalRendererMode,
  shouldUseTerminalWebglRenderer,
} from "./terminalRenderer";

describe("terminal renderer selection", () => {
  it("disables WebGL for Safari/WKWebView user agents", () => {
    const safari =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15";

    expect(isWebKitTerminalRendererHost(safari)).toBe(true);
    expect(shouldUseTerminalWebglRenderer(safari)).toBe(false);
    expect(decideTerminalRenderer("auto", {
      userAgent: safari,
      webgl2Supported: true,
    })).toMatchObject({
      renderer: "dom",
      reason: "webkit-host",
    });
  });

  it("keeps WebGL enabled for Chromium-based WebViews", () => {
    const webview2 =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";

    expect(isWebKitTerminalRendererHost(webview2)).toBe(false);
    expect(shouldUseTerminalWebglRenderer(webview2)).toBe(true);
    expect(decideTerminalRenderer("auto", {
      userAgent: webview2,
      webgl2Supported: true,
    })).toMatchObject({
      renderer: "webgl",
      reason: "auto-webgl",
    });
  });

  it("treats iOS Chrome as a WebKit host", () => {
    const iosChrome =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1";

    expect(isWebKitTerminalRendererHost(iosChrome)).toBe(true);
    expect(shouldUseTerminalWebglRenderer(iosChrome)).toBe(false);
  });

  it("allows forced WebGL on WebKit only when WebGL2 exists", () => {
    const safari =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15";

    expect(decideTerminalRenderer("webgl", {
      userAgent: safari,
      webgl2Supported: true,
    })).toMatchObject({
      renderer: "webgl",
      reason: "user-webgl",
    });
  });

  it("falls back to DOM when WebGL2 is unavailable", () => {
    const webview2 =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";

    expect(decideTerminalRenderer("webgl", {
      userAgent: webview2,
      webgl2Supported: false,
    })).toMatchObject({
      renderer: "dom",
      reason: "webgl2-unavailable",
    });
  });

  it("normalizes unknown renderer modes to auto", () => {
    expect(normalizeTerminalRendererMode("unknown")).toBe("auto");
    expect(normalizeTerminalRendererMode("dom")).toBe("dom");
  });
});
