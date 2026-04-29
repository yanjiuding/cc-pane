export function buildPrimaryDeviceAttributesReport(
  params: Array<number | number[]>,
  prefix?: string,
): string | null {
  if (prefix) return null;
  if (params.length > 1) return null;

  const code = params.length === 0
    ? 0
    : typeof params[0] === "number"
      ? params[0]
      : params[0][0];
  if (code !== 0) return null;

  // VT100 with advanced video option. Codex only needs a valid DA response.
  return "\x1b[?1;2c";
}

export function buildKittyKeyboardProtocolReport(
  params: Array<number | number[]>,
  prefix?: string,
): string | null {
  if (prefix !== "?") return null;
  if (params.length > 1) return null;
  const code = params.length === 0
    ? 0
    : typeof params[0] === "number"
      ? params[0]
      : params[0][0];
  if (code !== 0) return null;

  // xterm.js does not implement Kitty keyboard protocol flags.
  return "\x1b[?0u";
}
