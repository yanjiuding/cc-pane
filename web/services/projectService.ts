import { invoke } from "@tauri-apps/api/core";
import type { Project } from "@/types";
import { apiDelete, apiGet, apiJson, apiNoContent, invokeOrApi, isTauriRuntime } from "./apiClient";

/**
 * 项目服务 - 封装与后端的 API 调用
 */
export const projectService = {
  /**
   * 获取所有项目列表
   */
  async list(): Promise<Project[]> {
    return invokeOrApi<Project[]>("list_projects", undefined, () =>
      apiGet<Project[]>("/api/projects"),
    );
  },

  /**
   * 添加新项目
   */
  async add(path: string): Promise<Project> {
    const project = await invokeOrApi<Project>("add_project", { path }, () =>
      apiJson<Project>("/api/projects", "POST", { path }),
    );
    // 初始化 Local History
    try {
      if (isTauriRuntime()) {
        await invoke("init_project_history", { projectPath: path });
      } else {
        await apiNoContent("/api/local-history/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectPath: path }),
        });
      }
    } catch (e) {
      console.warn("Failed to init project history:", e);
    }
    return project;
  },

  /**
   * 删除项目
   */
  async remove(id: string): Promise<void> {
    return invokeOrApi<void>("remove_project", { id }, () =>
      apiDelete(`/api/projects/${encodeURIComponent(id)}`),
    );
  },

  /**
   * 获取单个项目
   */
  async get(id: string): Promise<Project | null> {
    return invokeOrApi<Project | null>("get_project", { id }, () =>
      apiGet<Project | null>(`/api/projects/${encodeURIComponent(id)}`),
    );
  },

  /**
   * 更新项目名称
   */
  async updateName(id: string, name: string): Promise<void> {
    return invokeOrApi<void>("update_project_name", { id, name }, () =>
      apiNoContent(`/api/projects/${encodeURIComponent(id)}/name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    );
  },

  /**
   * 更新项目别名
   */
  async updateAlias(id: string, alias: string | null): Promise<void> {
    return invokeOrApi<void>("update_project_alias", { id, alias }, () =>
      apiNoContent(`/api/projects/${encodeURIComponent(id)}/alias`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias }),
      }),
    );
  },
};
