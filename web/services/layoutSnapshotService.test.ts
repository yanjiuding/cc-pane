import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { layoutSnapshotService } from "./layoutSnapshotService";
import { mockTauriInvoke, resetTauriInvoke } from "@/test/utils/mockTauriInvoke";

describe("layoutSnapshotService", () => {
  beforeEach(() => {
    resetTauriInvoke();
    vi.unstubAllGlobals();
  });

  it("saves layout snapshots through Tauri IPC", async () => {
    const snapshot = {
      profileId: "default",
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      payload: { schemaVersion: 1, layouts: [], currentLayoutId: "layout-1" },
      savedAt: "2026-06-21T01:00:00Z",
      source: "desktop",
    };
    mockTauriInvoke({ save_layout_snapshot: undefined });

    await layoutSnapshotService.save(snapshot);

    expect(invoke).toHaveBeenCalledWith("save_layout_snapshot", { snapshot });
  });

  it("loads layout snapshots through Web API", async () => {
    vi.stubGlobal("__TAURI_INTERNALS__", undefined);
    const response = {
      profileId: "default",
      payload: { schemaVersion: 1, layouts: [], currentLayoutId: "layout-1" },
      savedAt: "2026-06-21T01:00:00Z",
      source: "web",
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(response),
    });
    vi.stubGlobal("fetch", fetchMock);

    const loaded = await layoutSnapshotService.load("default");

    expect(fetchMock).toHaveBeenCalledWith("/api/layout-snapshot/default", undefined);
    expect(loaded).toEqual(response);
  });
});
