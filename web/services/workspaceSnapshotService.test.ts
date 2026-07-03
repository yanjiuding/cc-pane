import { describe, it, expect, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { workspaceSnapshotService } from "./workspaceSnapshotService";
import {
  mockTauriInvoke,
  resetTauriInvoke,
} from "@/test/utils/mockTauriInvoke";

describe("workspaceSnapshotService", () => {
  beforeEach(() => {
    resetTauriInvoke();
  });

  describe("list", () => {
    it("应该调用 list_workspace_snapshots 并返回摘要列表", async () => {
      const summaries = [{ id: "snap-1", createdAt: "2024-01-01" }];
      mockTauriInvoke({ list_workspace_snapshots: summaries });

      const result = await workspaceSnapshotService.list("ws-1");

      expect(invoke).toHaveBeenCalledWith("list_workspace_snapshots", {
        workspaceId: "ws-1",
      });
      expect(result).toEqual(summaries);
    });
  });

  describe("get", () => {
    it("应该调用 get_workspace_snapshot 并返回快照", async () => {
      const snapshot = { id: "snap-1", layouts: [] };
      mockTauriInvoke({ get_workspace_snapshot: snapshot });

      const result = await workspaceSnapshotService.get("ws-1", "snap-1");

      expect(invoke).toHaveBeenCalledWith("get_workspace_snapshot", {
        workspaceId: "ws-1",
        snapshotId: "snap-1",
      });
      expect(result).toEqual(snapshot);
    });

    it("应该在快照不存在时返回 null", async () => {
      mockTauriInvoke({ get_workspace_snapshot: null });

      const result = await workspaceSnapshotService.get("ws-1", "missing");

      expect(result).toBeNull();
    });
  });

  describe("remove", () => {
    it("应该调用 delete_workspace_snapshot 并返回删除结果", async () => {
      mockTauriInvoke({ delete_workspace_snapshot: true });

      const result = await workspaceSnapshotService.remove("ws-1", "snap-1");

      expect(invoke).toHaveBeenCalledWith("delete_workspace_snapshot", {
        workspaceId: "ws-1",
        snapshotId: "snap-1",
      });
      expect(result).toBe(true);
    });
  });
});
