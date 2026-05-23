import { invoke } from "@tauri-apps/api/core";
import type { UsageQueryResult } from "@/types/usageStats";

export const usageStatsService = {
  async queryUsage(
    rangeDays: number,
    workspaceFilter?: string | null,
  ): Promise<UsageQueryResult> {
    return invoke<UsageQueryResult>("query_usage_stats", {
      rangeDays,
      workspaceFilter: workspaceFilter || null,
    });
  },

  async refreshUsage(): Promise<void> {
    return invoke("refresh_usage_stats");
  },

  async recordInputChars(sessionId: string, charCount: number): Promise<void> {
    if (charCount <= 0) return;
    return invoke("record_terminal_input", { sessionId, charCount });
  },
};
