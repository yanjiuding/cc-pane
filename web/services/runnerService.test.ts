import { describe, it, expect, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { runnerService } from "./runnerService";
import {
  mockTauriInvoke,
  resetTauriInvoke,
} from "@/test/utils/mockTauriInvoke";
import type { RunnerProfileDraft } from "@/types/runner";

describe("runnerService", () => {
  beforeEach(() => {
    resetTauriInvoke();
  });

  describe("listProfiles", () => {
    it("应该调用 runner_list_profiles 并返回配置列表", async () => {
      const profiles = [{ id: "p-1", name: "dev" }];
      mockTauriInvoke({ runner_list_profiles: profiles });

      const result = await runnerService.listProfiles("/tmp/project");

      expect(invoke).toHaveBeenCalledWith("runner_list_profiles", {
        projectPath: "/tmp/project",
      });
      expect(result).toEqual(profiles);
    });
  });

  describe("getProfile", () => {
    it("应该调用 runner_get_profile", async () => {
      const profile = { id: "p-1", name: "dev" };
      mockTauriInvoke({ runner_get_profile: profile });

      const result = await runnerService.getProfile("p-1");

      expect(invoke).toHaveBeenCalledWith("runner_get_profile", { id: "p-1" });
      expect(result).toEqual(profile);
    });

    it("应该在不存在时返回 null", async () => {
      mockTauriInvoke({ runner_get_profile: null });

      const result = await runnerService.getProfile("missing");

      expect(result).toBeNull();
    });
  });

  describe("upsertProfile", () => {
    it("应该调用 runner_upsert_profile 并传递 draft", async () => {
      const draft = { name: "dev", command: "npm run dev" } as unknown as RunnerProfileDraft;
      const profile = { id: "p-1", name: "dev" };
      mockTauriInvoke({ runner_upsert_profile: profile });

      const result = await runnerService.upsertProfile(draft);

      expect(invoke).toHaveBeenCalledWith("runner_upsert_profile", { draft });
      expect(result).toEqual(profile);
    });
  });

  describe("deleteProfile", () => {
    it("应该调用 runner_delete_profile", async () => {
      mockTauriInvoke({ runner_delete_profile: undefined });

      await runnerService.deleteProfile("p-1");

      expect(invoke).toHaveBeenCalledWith("runner_delete_profile", { id: "p-1" });
    });
  });

  describe("planLaunch", () => {
    it("应该调用 runner_plan_launch 并返回启动预演", async () => {
      const plan = { profileId: "p-1", conflicts: [] };
      mockTauriInvoke({ runner_plan_launch: plan });

      const result = await runnerService.planLaunch("p-1");

      expect(invoke).toHaveBeenCalledWith("runner_plan_launch", {
        profileId: "p-1",
      });
      expect(result).toEqual(plan);
    });
  });

  describe("listActiveInstances", () => {
    it("应该传递项目路径", async () => {
      mockTauriInvoke({ runner_list_active_instances: [] });

      await runnerService.listActiveInstances("/tmp/project");

      expect(invoke).toHaveBeenCalledWith("runner_list_active_instances", {
        projectPath: "/tmp/project",
      });
    });

    it("应该在未传项目路径时使用 null", async () => {
      mockTauriInvoke({ runner_list_active_instances: [] });

      await runnerService.listActiveInstances();

      expect(invoke).toHaveBeenCalledWith("runner_list_active_instances", {
        projectPath: null,
      });
    });
  });

  describe("listPortConflicts", () => {
    it("应该调用 runner_list_port_conflicts 并传递端口列表", async () => {
      const conflicts = [{ port: 3000, pid: 1234 }];
      mockTauriInvoke({ runner_list_port_conflicts: conflicts });

      const result = await runnerService.listPortConflicts([3000, 8080]);

      expect(invoke).toHaveBeenCalledWith("runner_list_port_conflicts", {
        ports: [3000, 8080],
      });
      expect(result).toEqual(conflicts);
    });
  });

  describe("refreshPortClaims", () => {
    it("应该调用 runner_refresh_port_claims", async () => {
      const claims = [{ port: 3000, pid: 1234 }];
      mockTauriInvoke({ runner_refresh_port_claims: claims });

      const result = await runnerService.refreshPortClaims("inst-1");

      expect(invoke).toHaveBeenCalledWith("runner_refresh_port_claims", {
        instanceId: "inst-1",
      });
      expect(result).toEqual(claims);
    });
  });

  describe("markInstanceExited", () => {
    it("应该将可选参数归一化为 null", async () => {
      mockTauriInvoke({ runner_mark_instance_exited: undefined });

      await runnerService.markInstanceExited("inst-1");

      expect(invoke).toHaveBeenCalledWith("runner_mark_instance_exited", {
        instanceId: "inst-1",
        exitCode: null,
        orphaned: null,
      });
    });

    it("应该透传 exitCode 和 orphaned", async () => {
      mockTauriInvoke({ runner_mark_instance_exited: undefined });

      await runnerService.markInstanceExited("inst-1", 1, true);

      expect(invoke).toHaveBeenCalledWith("runner_mark_instance_exited", {
        instanceId: "inst-1",
        exitCode: 1,
        orphaned: true,
      });
    });
  });

  describe("killInstance / killPid", () => {
    it("killInstance 应该调用 runner_kill_instance", async () => {
      mockTauriInvoke({ runner_kill_instance: true });

      const result = await runnerService.killInstance("inst-1");

      expect(invoke).toHaveBeenCalledWith("runner_kill_instance", {
        instanceId: "inst-1",
      });
      expect(result).toBe(true);
    });

    it("killPid 应该调用 runner_kill_pid", async () => {
      mockTauriInvoke({ runner_kill_pid: false });

      const result = await runnerService.killPid(1234);

      expect(invoke).toHaveBeenCalledWith("runner_kill_pid", { pid: 1234 });
      expect(result).toBe(false);
    });
  });

  describe("registerForSession", () => {
    it("应该将可选字段归一化为 null 后调用命令", async () => {
      const instance = { id: "inst-1" };
      mockTauriInvoke({ runner_register_for_session: instance });

      const result = await runnerService.registerForSession({
        sessionId: "s-1",
        projectPath: "/tmp/project",
        runtimeKind: "local",
        command: "npm run dev",
        cwd: "/tmp/project",
      });

      expect(invoke).toHaveBeenCalledWith("runner_register_for_session", {
        sessionId: "s-1",
        projectPath: "/tmp/project",
        runtimeKind: "local",
        command: "npm run dev",
        cwd: "/tmp/project",
        workspaceName: null,
        profileId: null,
      });
      expect(result).toEqual(instance);
    });
  });

  describe("registerImplicitInstance", () => {
    it("应该将可选字段归一化为 null 后调用命令", async () => {
      const instance = { id: "inst-2" };
      mockTauriInvoke({ runner_register_implicit_instance: instance });

      const result = await runnerService.registerImplicitInstance({
        projectPath: "/tmp/project",
        rootPid: 4321,
        runtimeKind: "local",
        command: "npm run dev",
        cwd: "/tmp/project",
      });

      expect(invoke).toHaveBeenCalledWith("runner_register_implicit_instance", {
        projectPath: "/tmp/project",
        rootPid: 4321,
        runtimeKind: "local",
        command: "npm run dev",
        cwd: "/tmp/project",
        workspaceName: null,
        sessionId: null,
      });
      expect(result).toEqual(instance);
    });
  });
});
