import type { LayoutSnapshot, SaveLayoutSnapshotRequest } from "@/types";
import { apiDelete, apiGet, apiNoContent, invokeOrApi } from "./apiClient";

class LayoutSnapshotService {
  async save(snapshot: SaveLayoutSnapshotRequest): Promise<void> {
    return invokeOrApi<void>("save_layout_snapshot", { snapshot }, () =>
      apiNoContent("/api/layout-snapshot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      }),
    );
  }

  async load(profileId: string): Promise<LayoutSnapshot | null> {
    return invokeOrApi<LayoutSnapshot | null>("load_layout_snapshot", { profileId }, () =>
      apiGet<LayoutSnapshot | null>(`/api/layout-snapshot/${encodeURIComponent(profileId)}`),
    );
  }

  async clear(profileId: string): Promise<void> {
    return invokeOrApi<void>("clear_layout_snapshot", { profileId }, () =>
      apiDelete(`/api/layout-snapshot/${encodeURIComponent(profileId)}`),
    );
  }
}

export const layoutSnapshotService = new LayoutSnapshotService();
