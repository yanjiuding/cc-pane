import type { TerminalStatusType } from "@/types";
import { BUSY_STATUSES } from "@/types";

/** pane 内多会话状态聚合：error > waitingInput > busy(绿色家族) > 其余取首个非 null > null */
export function aggregatePaneStatus(
  statuses: ReadonlyArray<TerminalStatusType | null>,
): TerminalStatusType | null {
  if (statuses.includes("error")) return "error";
  if (statuses.includes("waitingInput")) return "waitingInput";

  const busy = statuses.find(
    (status): status is TerminalStatusType => status !== null && BUSY_STATUSES.has(status),
  );
  if (busy) return busy;

  return statuses.find((status): status is TerminalStatusType => status !== null) ?? null;
}
