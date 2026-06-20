import type {
  SpecEntry,
  SpecStatus,
  CreateSpecRequest,
  UpdateSpecRequest,
} from "@/types/spec";
import { apiDelete, apiGet, apiJson, apiNoContent, invokeOrApi } from "./apiClient";

export const specService = {
  async create(request: CreateSpecRequest): Promise<SpecEntry> {
    return invokeOrApi<SpecEntry>("create_spec", { request }, () =>
      apiJson<SpecEntry>("/api/specs", "POST", request),
    );
  },

  async list(
    projectPath: string,
    status?: SpecStatus
  ): Promise<SpecEntry[]> {
    return invokeOrApi<SpecEntry[]>("list_specs", { projectPath, status }, () =>
      apiGet<SpecEntry[]>("/api/specs", { projectPath, status }),
    );
  },

  async getContent(
    projectPath: string,
    specId: string
  ): Promise<string> {
    return invokeOrApi<string>("get_spec_content", { projectPath, specId }, () =>
      apiGet<string>(`/api/specs/${encodeURIComponent(specId)}/content`, { projectPath }),
    );
  },

  async saveContent(
    projectPath: string,
    specId: string,
    content: string
  ): Promise<void> {
    return invokeOrApi<void>("save_spec_content", { projectPath, specId, content }, () =>
      apiNoContent(`/api/specs/${encodeURIComponent(specId)}/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectPath, content }),
      }),
    );
  },

  async update(
    specId: string,
    request: UpdateSpecRequest
  ): Promise<SpecEntry> {
    return invokeOrApi<SpecEntry>("update_spec", { specId, request }, () =>
      apiJson<SpecEntry>(`/api/specs/${encodeURIComponent(specId)}`, "PATCH", request),
    );
  },

  async delete(projectPath: string, specId: string): Promise<void> {
    return invokeOrApi<void>("delete_spec", { projectPath, specId }, () =>
      apiDelete(`/api/specs/${encodeURIComponent(specId)}?projectPath=${encodeURIComponent(projectPath)}`),
    );
  },

  async syncTasks(
    projectPath: string,
    specId: string
  ): Promise<void> {
    return invokeOrApi<void>("sync_spec_tasks", { projectPath, specId }, () =>
      apiJson<void>(`/api/specs/${encodeURIComponent(specId)}/sync-tasks`, "POST", { projectPath }),
    );
  },
};
