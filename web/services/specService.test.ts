import { describe, it, expect, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { specService } from "./specService";
import {
  mockTauriInvoke,
  resetTauriInvoke,
} from "@/test/utils/mockTauriInvoke";
import type { CreateSpecRequest, UpdateSpecRequest } from "@/types/spec";

describe("specService", () => {
  beforeEach(() => {
    resetTauriInvoke();
  });

  describe("create", () => {
    it("应该调用 create_spec 并返回创建的 Spec", async () => {
      const request = {
        projectPath: "/tmp/project",
        title: "New Spec",
      } as unknown as CreateSpecRequest;
      const entry = { id: "spec-1", title: "New Spec" };
      mockTauriInvoke({ create_spec: entry });

      const result = await specService.create(request);

      expect(invoke).toHaveBeenCalledWith("create_spec", { request });
      expect(result).toEqual(entry);
    });
  });

  describe("list", () => {
    it("应该调用 list_specs 并传递项目路径", async () => {
      mockTauriInvoke({ list_specs: [] });

      const result = await specService.list("/tmp/project");

      expect(invoke).toHaveBeenCalledWith("list_specs", {
        projectPath: "/tmp/project",
        status: undefined,
      });
      expect(result).toEqual([]);
    });

    it("应该透传 status 过滤参数", async () => {
      mockTauriInvoke({ list_specs: [] });

      await specService.list("/tmp/project", "draft" as never);

      expect(invoke).toHaveBeenCalledWith("list_specs", {
        projectPath: "/tmp/project",
        status: "draft",
      });
    });
  });

  describe("getContent", () => {
    it("应该调用 get_spec_content 并返回内容", async () => {
      mockTauriInvoke({ get_spec_content: "# Spec" });

      const result = await specService.getContent("/tmp/project", "spec-1");

      expect(invoke).toHaveBeenCalledWith("get_spec_content", {
        projectPath: "/tmp/project",
        specId: "spec-1",
      });
      expect(result).toBe("# Spec");
    });
  });

  describe("saveContent", () => {
    it("应该调用 save_spec_content 并传递内容", async () => {
      mockTauriInvoke({ save_spec_content: undefined });

      await specService.saveContent("/tmp/project", "spec-1", "# Updated");

      expect(invoke).toHaveBeenCalledWith("save_spec_content", {
        projectPath: "/tmp/project",
        specId: "spec-1",
        content: "# Updated",
      });
    });
  });

  describe("update", () => {
    it("应该调用 update_spec 并返回更新后的 Spec", async () => {
      const request = { title: "Renamed" } as unknown as UpdateSpecRequest;
      const entry = { id: "spec-1", title: "Renamed" };
      mockTauriInvoke({ update_spec: entry });

      const result = await specService.update("spec-1", request);

      expect(invoke).toHaveBeenCalledWith("update_spec", {
        specId: "spec-1",
        request,
      });
      expect(result).toEqual(entry);
    });
  });

  describe("delete", () => {
    it("应该调用 delete_spec", async () => {
      mockTauriInvoke({ delete_spec: undefined });

      await specService.delete("/tmp/project", "spec-1");

      expect(invoke).toHaveBeenCalledWith("delete_spec", {
        projectPath: "/tmp/project",
        specId: "spec-1",
      });
    });
  });

  describe("syncTasks", () => {
    it("应该调用 sync_spec_tasks", async () => {
      mockTauriInvoke({ sync_spec_tasks: undefined });

      await specService.syncTasks("/tmp/project", "spec-1");

      expect(invoke).toHaveBeenCalledWith("sync_spec_tasks", {
        projectPath: "/tmp/project",
        specId: "spec-1",
      });
    });
  });
});
