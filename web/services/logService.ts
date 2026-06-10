import { invoke } from "@tauri-apps/api/core";

/** 日志服务 */
export const logService = {
  /** 获取应用日志目录路径 */
  getLogDir(): Promise<string> {
    return invoke<string>("get_log_dir");
  },

  /** 在系统文件管理器中打开应用日志目录 */
  async openLogDir(): Promise<void> {
    const logDir = await logService.getLogDir();
    await invoke("open_path_in_explorer", { path: logDir });
  },
};
