import { beforeEach, describe, expect, it } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { taskBindingService } from "./taskBindingService";
import { mockTauriInvoke, resetTauriInvoke } from "@/test/utils/mockTauriInvoke";

describe("taskBindingService", () => {
  beforeEach(() => {
    resetTauriInvoke();
  });

  it("registerPlanLeader 调用 register_plan_leader", async () => {
    const binding = { id: "leader-1" };
    const request = {
      planPath: "D:/repo/.claude/plans/plan.md",
      projectPath: "D:/repo",
      sessionId: "pty-leader",
    };
    mockTauriInvoke({ register_plan_leader: binding });

    const result = await taskBindingService.registerPlanLeader(request);

    expect(invoke).toHaveBeenCalledWith("register_plan_leader", { request });
    expect(result).toBe(binding);
  });

  it("registerPlanWorker 调用 register_plan_worker", async () => {
    const binding = { id: "worker-1" };
    const request = {
      leaderId: "leader-1",
      sessionId: "pty-worker",
      projectPath: "D:/repo",
      cliTool: "codex",
    };
    mockTauriInvoke({ register_plan_worker: binding });

    const result = await taskBindingService.registerPlanWorker(request);

    expect(invoke).toHaveBeenCalledWith("register_plan_worker", { request });
    expect(result).toBe(binding);
  });

  it("getPlanCollaboration 调用 get_plan_collaboration", async () => {
    const collaboration = { leader: { id: "leader-1" }, workers: [], total: 0 };
    const key = { leaderId: "leader-1" };
    mockTauriInvoke({ get_plan_collaboration: collaboration });

    const result = await taskBindingService.getPlanCollaboration(key, true);

    expect(invoke).toHaveBeenCalledWith("get_plan_collaboration", {
      key,
      verbose: true,
    });
    expect(result).toBe(collaboration);
  });

  it("reconcilePlanCollaboration 调用 reconcile_plan_collaboration", async () => {
    const collaboration = { leader: { id: "leader-1" }, workers: [], total: 0 };
    const key = { planPath: "D:/repo/.claude/plans/plan.md" };
    mockTauriInvoke({ reconcile_plan_collaboration: collaboration });

    const result = await taskBindingService.reconcilePlanCollaboration(key);

    expect(invoke).toHaveBeenCalledWith("reconcile_plan_collaboration", {
      key,
      verbose: false,
    });
    expect(result).toBe(collaboration);
  });
});
