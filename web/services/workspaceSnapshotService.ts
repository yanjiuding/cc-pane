import type { WorkspaceSnapshot, WorkspaceSnapshotSummary } from "@/types";
import { apiDeleteJson, apiGet, invokeOrApi } from "./apiClient";

export const workspaceSnapshotService = {
  list(workspaceId: string): Promise<WorkspaceSnapshotSummary[]> {
    return invokeOrApi<WorkspaceSnapshotSummary[]>(
      "list_workspace_snapshots",
      { workspaceId },
      () => apiGet<WorkspaceSnapshotSummary[]>(
        `/api/workspace-snapshots/${encodeURIComponent(workspaceId)}`,
      ),
    );
  },

  get(workspaceId: string, snapshotId: string): Promise<WorkspaceSnapshot | null> {
    return invokeOrApi<WorkspaceSnapshot | null>(
      "get_workspace_snapshot",
      { workspaceId, snapshotId },
      () => apiGet<WorkspaceSnapshot | null>(
        `/api/workspace-snapshots/${encodeURIComponent(workspaceId)}/${encodeURIComponent(snapshotId)}`,
      ),
    );
  },

  remove(workspaceId: string, snapshotId: string): Promise<boolean> {
    return invokeOrApi<boolean>(
      "delete_workspace_snapshot",
      { workspaceId, snapshotId },
      () => apiDeleteJson<boolean>(
        `/api/workspace-snapshots/${encodeURIComponent(workspaceId)}/${encodeURIComponent(snapshotId)}`,
      ),
    );
  },
};
