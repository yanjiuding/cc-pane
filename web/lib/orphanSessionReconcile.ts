import { isBusyStatus, type TerminalStatusInfo } from "@/types";

/**
 * 孤儿会话判定（纯函数，无副作用）。
 *
 * daemon 里的会话可能失去所有前端引用（布局删除、崩溃重启后未被收养等），
 * 这些孤儿会话的 TUI 空闲重绘会持续消耗 CPU。本函数从全量会话状态中挑出
 * 可以安全回收的孤儿，调用方负责实际 kill。
 *
 * 与 daemon 侧 session_reaper 的 `is_reap_protected_status` 对齐：
 * busy（active/thinking/toolRunning/compacting）、initializing、waitingInput 一律不杀。
 */

export interface SelectOrphanOptions {
  /** 宽限期：最近活动（lastOutputAt/updatedAt 取大）距今小于该值的会话不杀，覆盖"会话已建、tab 未建"的竞态窗口 */
  graceMs?: number;
  /** 每轮最多回收数量，限制误判时的爆炸半径 */
  maxKillsPerSweep?: number;
}

export const DEFAULT_GRACE_MS = 10 * 60 * 1000;
export const DEFAULT_MAX_KILLS_PER_SWEEP = 10;

function isProtectedStatus(status: TerminalStatusInfo["status"]): boolean {
  return isBusyStatus(status) || status === "initializing" || status === "waitingInput";
}

/**
 * 从全量会话状态中选出应回收的孤儿会话 id，按 lastOutputAt 升序（最老优先）。
 *
 * @param statuses daemon 全量会话状态
 * @param referencedIds 所有仍被引用的 sessionId 集合（全布局 tab + self-chat + runner + task binding）
 * @param now 当前 epoch 毫秒
 */
export function selectOrphanSessions(
  statuses: readonly TerminalStatusInfo[],
  referencedIds: ReadonlySet<string>,
  now: number,
  options: SelectOrphanOptions = {},
): string[] {
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
  const maxKills = options.maxKillsPerSweep ?? DEFAULT_MAX_KILLS_PER_SWEEP;

  return statuses
    .filter((info) => {
      if (referencedIds.has(info.sessionId)) return false;
      // exited 会话进程已死，回收只是清元数据，放行；其余受保护状态不杀
      if (info.status !== "exited" && isProtectedStatus(info.status)) return false;
      const lastActivity = Math.max(info.lastOutputAt ?? 0, info.updatedAt ?? 0);
      if (now - lastActivity < graceMs) return false;
      return true;
    })
    .sort((a, b) => (a.lastOutputAt ?? 0) - (b.lastOutputAt ?? 0))
    .slice(0, maxKills)
    .map((info) => info.sessionId);
}
