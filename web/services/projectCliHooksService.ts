import type { ProjectCliHookGroupStatus } from "@/types";
import { apiGet, apiNoContent, invokeOrApi } from "./apiClient";

/**
 * 项目级 CLI hooks 服务 - 管理不同 CLI 工具的项目 hooks
 */
export const projectCliHooksService = {
  async getStatus(projectPath: string): Promise<ProjectCliHookGroupStatus[]> {
    return invokeOrApi<ProjectCliHookGroupStatus[]>(
      "get_project_cli_hooks",
      { projectPath },
      () => apiGet<ProjectCliHookGroupStatus[]>("/api/project-cli-hooks", { projectPath }),
    );
  },

  async setHookEnabled(
    projectPath: string,
    cliTool: string,
    hookName: string,
    enabled: boolean,
  ): Promise<void> {
    const body = {
      projectPath,
      cliTool,
      hookName,
      enabled,
    };
    return invokeOrApi<void>("set_project_cli_hook_enabled", body, () =>
      apiNoContent("/api/project-cli-hooks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  },
};
