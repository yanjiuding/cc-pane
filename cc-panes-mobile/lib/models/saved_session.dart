import 'workspace.dart' show pathBasename;

/// GET /api/terminal-sessions 元素（web/types/session-restore.ts 的 SavedSession）。
/// 会话 ↔ 项目/标题/CLI 的关联主表。
class SavedSession {
  const SavedSession({
    required this.sessionId,
    required this.projectPath,
    this.tabId,
    this.paneId,
    this.workspaceName,
    this.cliTool,
    this.customTitle,
    this.resumeId,
  });

  final String sessionId;
  final String projectPath;

  /// 桌面标签页 / 分屏归属：同一 tabId 的会话在桌面属于同一个标签页（可能多分屏）。
  final String? tabId;
  final String? paneId;
  final String? workspaceName;
  final String? cliTool;
  final String? customTitle;
  final String? resumeId;

  String get displayTitle =>
      customTitle?.isNotEmpty == true ? customTitle! : pathBasename(projectPath);

  factory SavedSession.fromJson(Map<String, dynamic> json) => SavedSession(
        sessionId: json['sessionId'] as String,
        projectPath: json['projectPath'] as String? ?? '',
        tabId: json['tabId'] as String?,
        paneId: json['paneId'] as String?,
        workspaceName: json['workspaceName'] as String?,
        cliTool: json['cliTool'] as String?,
        customTitle: json['customTitle'] as String?,
        resumeId: json['resumeId'] as String?,
      );
}
