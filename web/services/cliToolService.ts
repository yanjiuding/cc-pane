/**
 * CLI 工具服务 — 封装 Tauri/API 调用
 */
import type { CliToolInfo } from "@/types";
import { apiGet, invokeOrApi } from "./apiClient";

/** 列出所有已注册的 CLI 工具（含实时检测状态） */
export async function listCliTools(): Promise<CliToolInfo[]> {
  return invokeOrApi<CliToolInfo[]>("list_cli_tools", undefined, () =>
    apiGet<CliToolInfo[]>("/api/cli-tools"),
  );
}
