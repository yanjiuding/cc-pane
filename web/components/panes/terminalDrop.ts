export interface TerminalDropPosition {
  x: number;
  y: number;
}

export function isDropInsideTerminalHost(
  host: HTMLElement,
  position: TerminalDropPosition,
  elementFromPoint: (x: number, y: number) => Element | null = document.elementFromPoint.bind(document),
  devicePixelRatio = window.devicePixelRatio || 1,
): boolean {
  const target = elementFromPoint(
    position.x / devicePixelRatio,
    position.y / devicePixelRatio,
  );
  return target instanceof Node && host.contains(target);
}
