/**
 * 设置服务 - 与后端设置交互
 */

import type { AppSettings, DataDirInfo, WebAccessStatus } from "@/types/settings";
import { apiGet, apiJson, invokeOrApi } from "./apiClient";

export const settingsService = {
  async getSettings(): Promise<AppSettings> {
    return invokeOrApi<AppSettings>("get_settings", undefined, () =>
      apiGet<AppSettings>("/api/settings"),
    );
  },

  async updateSettings(settings: AppSettings): Promise<void> {
    return invokeOrApi<void>("update_settings", { settings }, () =>
      apiJson<void>("/api/settings", "PUT", settings),
    );
  },

  async setWebAccessPassword(password: string): Promise<void> {
    return invokeOrApi<void>("set_web_access_password", { password }, () =>
      apiJson<void>("/api/settings/web-access/password", "POST", { password }),
    );
  },

  async getWebAccessStatus(): Promise<WebAccessStatus> {
    return invokeOrApi<WebAccessStatus>("get_web_access_status", undefined, async () => {
      const settings = await apiGet<AppSettings>("/api/settings");
      return {
        enabled: settings.webAccess.enabled,
        running: true,
        pid: null,
        url: window.location.origin + "/",
        bindHost: window.location.hostname,
        port: settings.webAccess.port,
        lanRequested: settings.webAccess.allowLan,
        lanActive: settings.webAccess.allowLan && settings.webAccess.authEnabled && Boolean(settings.webAccess.passwordHash),
        authRequired: settings.webAccess.authEnabled && Boolean(settings.webAccess.passwordHash),
        passwordConfigured: Boolean(settings.webAccess.passwordHash),
      };
    });
  },

  async startWebAccess(): Promise<WebAccessStatus> {
    return invokeOrApi<WebAccessStatus>("start_web_access", undefined, () =>
      this.getWebAccessStatus(),
    );
  },

  async stopWebAccess(): Promise<WebAccessStatus> {
    return invokeOrApi<WebAccessStatus>("stop_web_access", undefined, () =>
      this.getWebAccessStatus(),
    );
  },

  async restartWebAccess(): Promise<WebAccessStatus> {
    return invokeOrApi<WebAccessStatus>("restart_web_access", undefined, () =>
      this.getWebAccessStatus(),
    );
  },

  async openWebAccess(): Promise<void> {
    return invokeOrApi<void>("open_web_access", undefined, async () => {
      window.open(window.location.origin + "/", "_blank", "noopener,noreferrer");
    });
  },

  async testProxy(): Promise<boolean> {
    return invokeOrApi<boolean>("test_proxy", undefined, async () => false);
  },

  async testCliLauncher(command: string, versionArgs?: string[]): Promise<string> {
    return invokeOrApi<string>(
      "test_cli_launcher",
      { command, versionArgs },
      async () => {
        throw new Error("CLI launcher testing is only available in the desktop app");
      },
    );
  },

  async getDataDirInfo(): Promise<DataDirInfo> {
    return invokeOrApi<DataDirInfo>("get_data_dir_info", undefined, async () => ({
      currentPath: "",
      defaultPath: "",
      isDefault: true,
      sizeBytes: 0,
    }));
  },

  async migrateDataDir(targetDir: string): Promise<void> {
    return invokeOrApi<void>("migrate_data_dir", { targetDir }, async () => {
      throw new Error("Data directory migration is only available in the desktop app");
    });
  },

  async generateClaudeMd(): Promise<void> {
    return invokeOrApi<void>("generate_claude_md", undefined, async () => {
      throw new Error("Claude.md generation is only available in the desktop app");
    });
  },
};
