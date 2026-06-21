import type { LayoutEntry } from "./pane";

export interface LayoutSnapshotPayload {
  schemaVersion: number;
  layouts: LayoutEntry[];
  currentLayoutId: string;
}

export interface LayoutSnapshot {
  profileId: string;
  workspaceId?: string | null;
  workspaceName?: string | null;
  payload: LayoutSnapshotPayload;
  savedAt: string;
  source: string;
}

export interface SaveLayoutSnapshotRequest {
  profileId: string;
  workspaceId?: string | null;
  workspaceName?: string | null;
  payload: LayoutSnapshotPayload;
  savedAt: string;
  source: string;
}
