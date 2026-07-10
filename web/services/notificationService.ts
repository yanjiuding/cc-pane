/**
 * 通知服务层 — 封装 trigger_notification Tauri 命令。
 * 走 Rust NotificationService：系统通知 + emit `notification-sent` 进通知中心。
 */
import { invokeOrApi } from "./apiClient";

export interface NotificationRequest {
  kind: string;
  title: string;
  body?: string;
  source?: string;
  scope?: string;
  dedupeKey?: string;
  groupKey?: string;
  onlyWhenUnfocused?: boolean;
  metadata?: unknown;
}

export interface NotificationTriggerResult {
  sent: boolean;
  skipped: boolean;
  reason: string | null;
}

export const notificationService = {
  /** 触发一条应用通知；web 端无桌面通知通道，静默跳过 */
  async trigger(request: NotificationRequest): Promise<NotificationTriggerResult> {
    return invokeOrApi<NotificationTriggerResult>(
      "trigger_notification",
      { request },
      async () => ({ sent: false, skipped: true, reason: "web runtime" }),
    );
  },
};
