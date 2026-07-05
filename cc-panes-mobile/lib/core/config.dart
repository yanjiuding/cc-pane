/// 全局常量。
abstract final class AppConfig {
  /// 会话列表轮询间隔
  static const sessionPollInterval = Duration(seconds: 5);

  /// HTTP 请求超时
  static const httpTimeout = Duration(seconds: 10);

  /// WS 重连退避：起始 / 封顶（Phase 3 使用）
  static const wsReconnectMin = Duration(seconds: 1);
  static const wsReconnectMax = Duration(seconds: 30);

  /// 终端 resize 去抖（Phase 2 使用）
  static const resizeDebounce = Duration(milliseconds: 250);

  /// 桌面端默认 Web 端口
  static const defaultPort = 18080;

  /// 镜像首页开关（Codex 评审必修6：feature flag 切换，稳定前保留旧首页回退）。
  static const useMirrorHome = true;

  /// 布局快照陈旧阈值：savedAt 距今超过此值 → 显示 stale 提示
  /// （桌面前端每 60s 兜底保存 + 布局变更 800ms 保存，正常远小于此）。
  static const snapshotStale = Duration(seconds: 90);

  /// 孤儿会话过旧阈值：/api/sessions 里无布局归属且 updatedAt 超此值 → 视为残留，隐藏。
  static const orphanStale = Duration(minutes: 5);
}
