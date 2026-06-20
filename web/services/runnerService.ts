/**
 * Runner Registry 前端服务层 — 封装 Tauri/API 调用
 */
import type {
  PortClaim,
  PortConflict,
  RunnerInstance,
  RunnerLaunchPlan,
  RunnerProfile,
  RunnerProfileDraft,
} from "@/types/runner";
import { apiDelete, apiGet, apiJson, apiNoContent, invokeOrApi } from "./apiClient";

export const runnerService = {
  /** 列出某项目的启动配置（按 lastStartedAt 倒序） */
  async listProfiles(projectPath: string): Promise<RunnerProfile[]> {
    return invokeOrApi<RunnerProfile[]>("runner_list_profiles", { projectPath }, () =>
      apiGet<RunnerProfile[]>("/api/runner/profiles", { projectPath }),
    );
  },

  /** 获取单个 profile */
  async getProfile(id: string): Promise<RunnerProfile | null> {
    return invokeOrApi<RunnerProfile | null>("runner_get_profile", { id }, () =>
      apiGet<RunnerProfile | null>(`/api/runner/profiles/${encodeURIComponent(id)}`),
    );
  },

  /** 新建或更新 profile（draft.id 为空 = 新建） */
  async upsertProfile(draft: RunnerProfileDraft): Promise<RunnerProfile> {
    return invokeOrApi<RunnerProfile>("runner_upsert_profile", { draft }, () =>
      apiJson<RunnerProfile>("/api/runner/profiles", "PUT", draft),
    );
  },

  async deleteProfile(id: string): Promise<void> {
    await invokeOrApi<void>("runner_delete_profile", { id }, () =>
      apiDelete(`/api/runner/profiles/${encodeURIComponent(id)}`),
    );
  },

  /** 启动前预演 */
  async planLaunch(profileId: string): Promise<RunnerLaunchPlan> {
    return invokeOrApi<RunnerLaunchPlan>("runner_plan_launch", { profileId }, () =>
      apiGet<RunnerLaunchPlan>(
        `/api/runner/profiles/${encodeURIComponent(profileId)}/launch-plan`,
      ),
    );
  },

  /** 当前活跃运行实例 */
  async listActiveInstances(
    projectPath?: string,
  ): Promise<RunnerInstance[]> {
    const args = { projectPath: projectPath ?? null };
    return invokeOrApi<RunnerInstance[]>("runner_list_active_instances", args, () =>
      apiGet<RunnerInstance[]>("/api/runner/instances/active", args),
    );
  },

  /** 查询给定端口的当前占用情况 */
  async listPortConflicts(ports: number[]): Promise<PortConflict[]> {
    return invokeOrApi<PortConflict[]>("runner_list_port_conflicts", { ports }, () =>
      apiJson<PortConflict[]>("/api/runner/ports/conflicts", "POST", { ports }),
    );
  },

  /** 刷新某 instance 的 port_claims（用 sysinfo 扫子进程树 ∩ netstat2） */
  async refreshPortClaims(instanceId: string): Promise<PortClaim[]> {
    return invokeOrApi<PortClaim[]>("runner_refresh_port_claims", { instanceId }, () =>
      apiJson<PortClaim[]>(
        `/api/runner/instances/${encodeURIComponent(instanceId)}/port-claims`,
        "POST",
      ),
    );
  },

  async markInstanceExited(
    instanceId: string,
    exitCode?: number,
    orphaned?: boolean,
  ): Promise<void> {
    const body = {
      instanceId,
      exitCode: exitCode ?? null,
      orphaned: orphaned ?? null,
    };
    await invokeOrApi<void>("runner_mark_instance_exited", body, () =>
      apiNoContent(
        `/api/runner/instances/${encodeURIComponent(instanceId)}/mark-exited`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exitCode: exitCode ?? null, orphaned: orphaned ?? null }),
        },
      ),
    );
  },

  /** 杀掉 instance 的根进程树 */
  async killInstance(instanceId: string): Promise<boolean> {
    return invokeOrApi<boolean>("runner_kill_instance", { instanceId }, () =>
      apiJson<boolean>(
        `/api/runner/instances/${encodeURIComponent(instanceId)}/kill`,
        "POST",
      ),
    );
  },

  /** 按 PID 杀进程（薄包装；用于 skill 决定杀某个具体端口占用方） */
  async killPid(pid: number): Promise<boolean> {
    return invokeOrApi<boolean>("runner_kill_pid", { pid }, () =>
      apiJson<boolean>("/api/runner/pids/kill", "POST", { pid }),
    );
  },

  /** UI 编排专用：根据 session_id 反查 PID 后登记为 runner instance。
   *  典型流程：createTerminalSession → submit command → registerForSession。
   *  profileId 提供则刷新 last_started_at。
   */
  async registerForSession(args: {
    sessionId: string;
    projectPath: string;
    workspaceName?: string;
    profileId?: string;
    runtimeKind: string;
    command: string;
    cwd: string;
  }): Promise<RunnerInstance> {
    const body = {
      ...args,
      workspaceName: args.workspaceName ?? null,
      profileId: args.profileId ?? null,
    };
    return invokeOrApi<RunnerInstance>("runner_register_for_session", body, () =>
      apiJson<RunnerInstance>("/api/runner/instances/register-for-session", "POST", body),
    );
  },

  /** 隐式扫描入口：hook 上报或 UI 手动同步 */
  async registerImplicitInstance(args: {
    projectPath: string;
    workspaceName?: string;
    sessionId?: string;
    rootPid: number;
    runtimeKind: string;
    command: string;
    cwd: string;
  }): Promise<RunnerInstance> {
    const body = {
      ...args,
      workspaceName: args.workspaceName ?? null,
      sessionId: args.sessionId ?? null,
    };
    return invokeOrApi<RunnerInstance>("runner_register_implicit_instance", body, () =>
      apiJson<RunnerInstance>("/api/runner/instances/register-implicit", "POST", body),
    );
  },
};
