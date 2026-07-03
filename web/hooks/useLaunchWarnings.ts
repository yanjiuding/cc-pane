import { useEffect } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { listenWebviewIfTauri } from "@/services/runtime";

/**
 * 后端 `terminal-launch-warning` 事件的载荷（见 cc-panes-core constants::events）。
 * 目前唯一 kind 是 `profileMismatch`：显式选中的启动配置因 CLI/运行环境不匹配被
 * 静默回落，profile 级设置（如 YOLO）可能未生效。
 */
export interface LaunchWarningPayload {
  kind: string;
  cliTool?: string;
  runtimeKind?: string;
  requestedProfileName?: string;
  cliMismatch?: boolean;
  runtimeMismatch?: boolean;
  usedProfileName?: string | null;
}

/**
 * 监听启动非致命警告并以 toast 提示用户。挂在 App 顶层一次即可。
 */
export function useLaunchWarnings(): void {
  const { t } = useTranslation(["panes", "common"]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        const fn = await listenWebviewIfTauri<LaunchWarningPayload>(
          "terminal-launch-warning",
          (event) => {
            const payload = event.payload;
            if (!payload || payload.kind !== "profileMismatch") return;
            toast.warning(
              t("launchProfileMismatch", {
                ns: "panes",
                profile: payload.requestedProfileName ?? "",
                cli: payload.cliTool ?? "",
                used: payload.usedProfileName ?? t("common:default", { defaultValue: "default" }),
              }),
            );
          },
        );
        if (cancelled) fn();
        else unlisten = fn;
      } catch {
        // Web 运行时或监听失败：静默忽略（非致命提示，不应影响主流程）。
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [t]);
}

export default useLaunchWarnings;
