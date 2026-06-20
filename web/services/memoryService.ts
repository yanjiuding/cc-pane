/**
 * Memory 服务层 — 封装所有 Memory 相关的 Tauri/API 调用
 */
import type {
  Memory,
  MemoryQuery,
  MemoryQueryResult,
  MemoryStats,
  MemoryScope,
  StoreMemoryRequest,
  UpdateMemoryRequest,
} from "@/types";
import { apiDeleteJson, apiGet, apiJson, invokeOrApi } from "./apiClient";

export const memoryService = {
  /** 搜索 Memory（支持全文搜索 + 筛选） */
  async search(query: MemoryQuery): Promise<MemoryQueryResult> {
    return invokeOrApi<MemoryQueryResult>("search_memory", { query }, () =>
      apiJson<MemoryQueryResult>("/api/memories/search", "POST", query),
    );
  },

  /** 存储新 Memory */
  async store(request: StoreMemoryRequest): Promise<Memory> {
    return invokeOrApi<Memory>("store_memory", { request }, () =>
      apiJson<Memory>("/api/memories", "POST", request),
    );
  },

  /** 列出 Memory（按 scope/workspace/project 筛选） */
  async list(params?: {
    scope?: MemoryScope;
    workspaceName?: string;
    projectPath?: string;
    limit?: number;
    offset?: number;
  }): Promise<MemoryQueryResult> {
    const args = {
      scope: params?.scope,
      workspaceName: params?.workspaceName,
      projectPath: params?.projectPath,
      limit: params?.limit,
      offset: params?.offset,
    };
    return invokeOrApi<MemoryQueryResult>("list_memories", args, () =>
      apiGet<MemoryQueryResult>("/api/memories", args),
    );
  },

  /** 获取单个 Memory */
  async get(id: string): Promise<Memory | null> {
    return invokeOrApi<Memory | null>("get_memory", { id }, () =>
      apiGet<Memory | null>(`/api/memories/${encodeURIComponent(id)}`),
    );
  },

  /** 更新 Memory */
  async update(id: string, request: UpdateMemoryRequest): Promise<boolean> {
    return invokeOrApi<boolean>("update_memory", { id, request }, () =>
      apiJson<boolean>(`/api/memories/${encodeURIComponent(id)}`, "PATCH", request),
    );
  },

  /** 删除 Memory */
  async delete(id: string): Promise<boolean> {
    return invokeOrApi<boolean>("delete_memory", { id }, () =>
      apiDeleteJson<boolean>(`/api/memories/${encodeURIComponent(id)}`),
    );
  },

  /** 获取统计信息 */
  async stats(params?: {
    workspaceName?: string;
    projectPath?: string;
  }): Promise<MemoryStats> {
    const args = {
      workspaceName: params?.workspaceName,
      projectPath: params?.projectPath,
    };
    return invokeOrApi<MemoryStats>("get_memory_stats", args, () =>
      apiGet<MemoryStats>("/api/memories/stats", args),
    );
  },

  /** 准备会话上下文（project memories + 指定 memories） */
  async prepareSessionContext(
    projectPath: string,
    memoryIds: string[]
  ): Promise<string> {
    const body = {
      projectPath,
      memoryIds,
    };
    return invokeOrApi<string>("prepare_session_context", body, () =>
      apiJson<string>("/api/memories/session-context", "POST", body),
    );
  },

  /** 格式化 Memory 用于注入 */
  async formatForInjection(memoryIds: string[]): Promise<string> {
    return invokeOrApi<string>("format_memory_for_injection", { memoryIds }, () =>
      apiJson<string>("/api/memories/format", "POST", { memoryIds }),
    );
  },
};
