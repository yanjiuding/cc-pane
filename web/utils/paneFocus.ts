export type PaneFocusDirection = "left" | "right" | "up" | "down";

export interface PaneFocusRect {
  paneId: string;
  rect: Pick<DOMRectReadOnly, "left" | "right" | "top" | "bottom" | "width" | "height">;
}

interface ScoredPane {
  paneId: string;
  overlapRank: number;
  distance: number;
  axisGap: number;
  centerDistance: number;
  order: number;
}

interface FindPaneFocusTargetOptions {
  activePaneId: string;
  direction: PaneFocusDirection;
  paneOrder: string[];
  paneRects: PaneFocusRect[];
}

const PANE_SELECTOR = "[data-pane-id]";

export function readPaneFocusRects(root: ParentNode = document): PaneFocusRect[] {
  return Array.from(root.querySelectorAll<HTMLElement>(PANE_SELECTOR))
    .map((element) => {
      const paneId = element.dataset.paneId;
      if (!paneId) return null;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return {
        paneId,
        rect: {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
      };
    })
    .filter((item): item is PaneFocusRect => item !== null);
}

export function findPaneFocusTarget({
  activePaneId,
  direction,
  paneOrder,
  paneRects,
}: FindPaneFocusTargetOptions): string | null {
  if (paneOrder.length <= 1) return null;

  const rects = new Map(paneRects.map((item) => [item.paneId, item.rect]));
  const activeRect = rects.get(activePaneId);
  if (!activeRect) {
    return fallbackPaneId(paneOrder, activePaneId, direction);
  }

  const scored = paneRects
    .filter((item) => item.paneId !== activePaneId)
    .map((item) => scorePane(activeRect, item, direction, paneOrder))
    .filter((item): item is ScoredPane => item !== null)
    .sort(compareScoredPanes);

  return scored[0]?.paneId ?? fallbackPaneId(paneOrder, activePaneId, direction);
}

function scorePane(
  activeRect: PaneFocusRect["rect"],
  candidate: PaneFocusRect,
  direction: PaneFocusDirection,
  paneOrder: string[]
): ScoredPane | null {
  const distance = directionalDistance(activeRect, candidate.rect, direction);
  if (distance === null) return null;

  const isHorizontal = direction === "left" || direction === "right";
  const overlap = isHorizontal
    ? rangeOverlap(activeRect.top, activeRect.bottom, candidate.rect.top, candidate.rect.bottom)
    : rangeOverlap(activeRect.left, activeRect.right, candidate.rect.left, candidate.rect.right);
  const axisGap = isHorizontal
    ? rangeGap(activeRect.top, activeRect.bottom, candidate.rect.top, candidate.rect.bottom)
    : rangeGap(activeRect.left, activeRect.right, candidate.rect.left, candidate.rect.right);
  const centerDistance = isHorizontal
    ? Math.abs(centerY(activeRect) - centerY(candidate.rect))
    : Math.abs(centerX(activeRect) - centerX(candidate.rect));

  return {
    paneId: candidate.paneId,
    overlapRank: overlap > 0 ? 0 : 1,
    distance,
    axisGap,
    centerDistance,
    order: paneOrder.indexOf(candidate.paneId),
  };
}

function compareScoredPanes(a: ScoredPane, b: ScoredPane): number {
  return (
    a.overlapRank - b.overlapRank ||
    a.distance - b.distance ||
    a.axisGap - b.axisGap ||
    a.centerDistance - b.centerDistance ||
    normalizeOrder(a.order) - normalizeOrder(b.order)
  );
}

function directionalDistance(
  activeRect: PaneFocusRect["rect"],
  candidateRect: PaneFocusRect["rect"],
  direction: PaneFocusDirection
): number | null {
  switch (direction) {
    case "left":
      if (centerX(candidateRect) >= centerX(activeRect)) return null;
      return Math.max(0, activeRect.left - candidateRect.right);
    case "right":
      if (centerX(candidateRect) <= centerX(activeRect)) return null;
      return Math.max(0, candidateRect.left - activeRect.right);
    case "up":
      if (centerY(candidateRect) >= centerY(activeRect)) return null;
      return Math.max(0, activeRect.top - candidateRect.bottom);
    case "down":
      if (centerY(candidateRect) <= centerY(activeRect)) return null;
      return Math.max(0, candidateRect.top - activeRect.bottom);
  }
}

function fallbackPaneId(
  paneOrder: string[],
  activePaneId: string,
  direction: PaneFocusDirection
): string | null {
  if (paneOrder.length <= 1) return null;
  const index = paneOrder.indexOf(activePaneId);
  if (index === -1) return paneOrder[0] ?? null;
  const delta = direction === "left" || direction === "up" ? -1 : 1;
  const nextIndex = (index + delta + paneOrder.length) % paneOrder.length;
  return paneOrder[nextIndex] ?? null;
}

function rangeOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function rangeGap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  if (aEnd < bStart) return bStart - aEnd;
  if (bEnd < aStart) return aStart - bEnd;
  return 0;
}

function centerX(rect: PaneFocusRect["rect"]): number {
  return rect.left + rect.width / 2;
}

function centerY(rect: PaneFocusRect["rect"]): number {
  return rect.top + rect.height / 2;
}

function normalizeOrder(order: number): number {
  return order === -1 ? Number.MAX_SAFE_INTEGER : order;
}
