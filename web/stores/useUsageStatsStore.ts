import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { usageStatsService } from "@/services/usageStatsService";
import type { UsageQueryResult } from "@/types/usageStats";
import { translateError } from "@/utils";

interface UsageStatsState {
  rangeDays: number;
  workspaceFilter: string | null;
  data: UsageQueryResult | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  setRangeDays: (rangeDays: number) => Promise<void>;
  setWorkspaceFilter: (workspaceFilter: string | null) => Promise<void>;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useUsageStatsStore = create<UsageStatsState>()(
  immer((set, get) => ({
    rangeDays: 30,
    workspaceFilter: null,
    data: null,
    loading: false,
    refreshing: false,
    error: null,

    setRangeDays: async (rangeDays) => {
      set((state) => {
        state.rangeDays = rangeDays;
      });
      await get().load();
    },

    setWorkspaceFilter: async (workspaceFilter) => {
      set((state) => {
        state.workspaceFilter = workspaceFilter;
      });
      await get().load();
    },

    load: async () => {
      const { rangeDays, workspaceFilter } = get();
      set((state) => {
        state.loading = true;
        state.error = null;
      });
      try {
        const data = await usageStatsService.queryUsage(rangeDays, workspaceFilter);
        set((state) => {
          state.data = data;
        });
      } catch (error) {
        set((state) => {
          state.error = translateError(error);
        });
        throw error;
      } finally {
        set((state) => {
          state.loading = false;
        });
      }
    },

    refresh: async () => {
      set((state) => {
        state.refreshing = true;
        state.error = null;
      });
      try {
        await usageStatsService.refreshUsage();
        await get().load();
      } catch (error) {
        set((state) => {
          state.error = translateError(error);
        });
        throw error;
      } finally {
        set((state) => {
          state.refreshing = false;
        });
      }
    },
  })),
);
