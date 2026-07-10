import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { usePanesStore } from "@/stores/usePanesStore";
import { useSelfChatStore } from "@/stores/useSelfChatStore";
import { terminalService } from "@/services/terminalService";
import { runnerService } from "@/services/runnerService";
import { taskBindingService } from "@/services/taskBindingService";
import { notificationService } from "@/services/notificationService";
import { isTauriRuntime } from "@/services/runtime";
import { waitForTauri } from "@/utils";
import { selectOrphanSessions } from "@/lib/orphanSessionReconcile";
import type { TaskBindingStatus } from "@/types";

/** 首轮延迟：等布局 rehydrate、会话收养/restore 完成后再对账 */
const FIRST_SWEEP_DELAY_MS = 5 * 60 * 1000;
/** 对账周期 */
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
/** 视为"仍被引用"的活跃 task binding 状态 */
const LIVE_BINDING_STATUSES: TaskBindingStatus[] = ["pending", "running", "waiting"];

/**
 * 收集当前仍被引用的 sessionId 全集：
 * 全布局 tab（含星标/非当前布局）+ Self-Chat + Runner 实例 + 活跃编排任务。
 * 任一来源查询失败即抛错，调用方跳过本轮（fail-closed，宁可不杀）。
 */
async function collectReferencedIds(): Promise<Set<string>> {
  const referenced = usePanesStore.getState().collectReferencedSessionIds();

  const selfChatPty = useSelfChatStore.getState().activeSession?.ptySessionId;
  if (selfChatPty) referenced.add(selfChatPty);

  const runners = await runnerService.listActiveInstances();
  for (const runner of runners) {
    if (runner.sessionId) referenced.add(runner.sessionId);
  }

  const bindingResults = await Promise.all(
    LIVE_BINDING_STATUSES.map((status) => taskBindingService.query({ status })),
  );
  for (const result of bindingResults) {
    for (const binding of result.items) {
      if (binding.sessionId) referenced.add(binding.sessionId);
    }
  }

  return referenced;
}

/**
 * 孤儿终端会话对账回收。
 *
 * daemon 会话可能失去全部前端引用（布局删除、崩溃重启后未被收养等），
 * 空闲 TUI 每帧重绘持续消耗 CPU。本 hook 周期性把 daemon 全量会话与
 * 所有引用来源对账，无引用且非活跃状态的会话直接 kill 并聚合通知。
 *
 * 只在桌面端运行：web/mobile 镜像的布局是残缺视图，会误判孤儿。
 * daemon 侧另有 TTL 兜底（session_reaper，默认 24h）覆盖 app 不运行的时段。
 */
export function useOrphanSessionReconciler() {
  const { t } = useTranslation("settings");
  const sweeping = useRef(false);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const sweep = async () => {
      if (sweeping.current) return;
      sweeping.current = true;
      try {
        const referenced = await collectReferencedIds();
        const statuses = await terminalService.getAllStatus();
        const orphans = selectOrphanSessions(statuses, referenced, Date.now());
        if (orphans.length === 0) return;

        let killed = 0;
        for (const sessionId of orphans) {
          if (disposed) break;
          // TOCTOU 复查：对账快照与 kill 之间该会话可能刚被 tab/binding 认领
          const latest = await collectReferencedIds();
          if (latest.has(sessionId)) continue;
          try {
            await terminalService.killSession(sessionId);
            killed += 1;
            console.info("[orphan-reconcile] reclaimed session", sessionId);
          } catch (error) {
            console.warn("[orphan-reconcile] failed to kill session", sessionId, error);
          }
        }

        if (killed > 0) {
          await notificationService
            .trigger({
              kind: "orphan-session-reclaimed",
              title: t("orphanSessionReclaimedTitle"),
              body: t("orphanSessionReclaimedBody", { count: killed }),
              dedupeKey: "orphan-session-reclaimed",
              source: "orphan-reconciler",
            })
            .catch(() => {});
        }
      } catch (error) {
        // fail-closed：任一引用来源查询失败都跳过本轮，绝不基于残缺集合杀会话
        console.warn("[orphan-reconcile] sweep skipped:", error);
      } finally {
        sweeping.current = false;
      }
    };

    const timerId = setTimeout(async () => {
      const ready = await waitForTauri();
      if (!ready || disposed) return;
      void sweep();
      intervalId = setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
    }, FIRST_SWEEP_DELAY_MS);

    return () => {
      disposed = true;
      clearTimeout(timerId);
      if (intervalId !== undefined) clearInterval(intervalId);
    };
  }, [t]);
}
