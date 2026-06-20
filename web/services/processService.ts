import type { ProcessScanResult } from "@/types";
import { apiDeleteJson, apiGet, apiJson, invokeOrApi } from "./apiClient";

export const processService = {
  /** 扫描系统中所有 Claude 相关进程 */
  async scan(): Promise<ProcessScanResult> {
    return invokeOrApi<ProcessScanResult>("scan_claude_processes", undefined, () =>
      apiGet<ProcessScanResult>("/api/processes/claude"),
    );
  },

  /** 终止单个进程 */
  async killProcess(pid: number): Promise<boolean> {
    return invokeOrApi<boolean>("kill_claude_process", { pid }, () =>
      apiDeleteJson<boolean>(`/api/processes/claude/${pid}`),
    );
  },

  /** 批量终止进程，返回 [pid, success] 数组 */
  async killProcesses(pids: number[]): Promise<[number, boolean][]> {
    return invokeOrApi<[number, boolean][]>("kill_claude_processes", { pids }, () =>
      apiJson<[number, boolean][]>("/api/processes/claude", "POST", { pids }),
    );
  },
};
