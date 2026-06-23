const FOCUS_MODE_PATTERN = /\x1b\[\?1004([hl])/g;

export const XTERM_FOCUS_IN_REPORT = "\x1b[I";
export const XTERM_FOCUS_OUT_REPORT = "\x1b[O";

export function isXtermFocusReportInput(data: string): boolean {
  return data === XTERM_FOCUS_IN_REPORT || data === XTERM_FOCUS_OUT_REPORT;
}

export function detectFocusReportMode(data: string, current: boolean): boolean {
  let enabled = current;
  FOCUS_MODE_PATTERN.lastIndex = 0;

  for (const match of data.matchAll(FOCUS_MODE_PATTERN)) {
    enabled = match[1] === "h";
  }

  return enabled;
}
