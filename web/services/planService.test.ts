import { describe, it, expect, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { planService, type PlanEntry } from "./planService";
import {
  mockTauriInvoke,
  resetTauriInvoke,
} from "@/test/utils/mockTauriInvoke";

function createPlan(overrides: Partial<PlanEntry> = {}): PlanEntry {
  return {
    fileName: "2024-01-01-plan.md",
    originalName: "plan.md",
    sessionId: "session-1",
    archivedAt: "2024-01-01T00:00:00Z",
    size: 1024,
    ...overrides,
  };
}

describe("planService", () => {
  beforeEach(() => {
    resetTauriInvoke();
  });

  describe("listPlans", () => {
    it("应该调用 list_plans 命令并返回计划列表", async () => {
      const plans = [createPlan()];
      mockTauriInvoke({ list_plans: plans });

      const result = await planService.listPlans("/tmp/project");

      expect(invoke).toHaveBeenCalledWith("list_plans", {
        projectPath: "/tmp/project",
      });
      expect(result).toEqual(plans);
    });
  });

  describe("getPlanContent", () => {
    it("应该调用 get_plan_content 并返回内容", async () => {
      mockTauriInvoke({ get_plan_content: "# Plan\ncontent" });

      const result = await planService.getPlanContent(
        "/tmp/project",
        "2024-01-01-plan.md",
      );

      expect(invoke).toHaveBeenCalledWith("get_plan_content", {
        projectPath: "/tmp/project",
        fileName: "2024-01-01-plan.md",
      });
      expect(result).toBe("# Plan\ncontent");
    });
  });

  describe("deletePlan", () => {
    it("应该调用 delete_plan 命令", async () => {
      mockTauriInvoke({ delete_plan: undefined });

      await planService.deletePlan("/tmp/project", "2024-01-01-plan.md");

      expect(invoke).toHaveBeenCalledWith("delete_plan", {
        projectPath: "/tmp/project",
        fileName: "2024-01-01-plan.md",
      });
    });
  });
});
