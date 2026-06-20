import { invokeOrApi } from "./apiClient";

/** 日志服务 */
export const logService = {
  /** 获取应用日志目录路径 */
  getLogDir(): Promise<string> {
    return invokeOrApi<string>("get_log_dir", undefined, async () => "");
  },

  /** 在系统文件管理器中打开应用日志目录 */
  async openLogDir(): Promise<void> {
    const logDir = await logService.getLogDir();
    await invokeOrApi<void>("open_path_in_explorer", { path: logDir }, async () => {
      throw new Error("Opening log directories is only available in the desktop app");
    });
  },
};
