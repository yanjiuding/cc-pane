export function isWebKitTerminalRendererHost(userAgent: string): boolean {
  const normalized = userAgent.toLowerCase();
  if (!normalized.includes("applewebkit")) return false;

  return !(
    normalized.includes("chrome/") ||
    normalized.includes("chromium/") ||
    normalized.includes("edg/")
  );
}

export function shouldUseTerminalWebglRenderer(
  userAgent: string = typeof navigator === "undefined" ? "" : navigator.userAgent,
): boolean {
  // WKWebView/Safari can leave stale WebGL terminal cell backgrounds after
  // partial repaints. Prefer xterm's default renderer there.
  return !isWebKitTerminalRendererHost(userAgent);
}
