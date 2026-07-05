/// GET /api/sessions 元素（cc-panes-core SessionStatusInfo，camelCase）。
class SessionInfo {
  const SessionInfo({
    required this.sessionId,
    required this.status,
    required this.lastOutputAt,
    required this.updatedAt,
    this.pid,
    this.exitCode,
    this.currentToolName,
    this.currentToolSummary,
  });

  final String sessionId;

  /// initializing | idle | thinking | toolRunning | compacting | waitingInput | exited …
  /// 保留原始字符串，未知值不炸（服务端枚举可能扩展）。
  final String status;
  final int lastOutputAt;
  final int updatedAt;
  final int? pid;
  final int? exitCode;
  final String? currentToolName;
  final String? currentToolSummary;

  bool get exited => exitCode != null || status == 'exited';

  factory SessionInfo.fromJson(Map<String, dynamic> json) => SessionInfo(
        sessionId: json['sessionId'] as String,
        status: json['status'] as String? ?? 'unknown',
        lastOutputAt: (json['lastOutputAt'] as num?)?.toInt() ?? 0,
        updatedAt: (json['updatedAt'] as num?)?.toInt() ?? 0,
        pid: (json['pid'] as num?)?.toInt(),
        exitCode: (json['exitCode'] as num?)?.toInt(),
        currentToolName: json['currentToolName'] as String?,
        currentToolSummary: json['currentToolSummary'] as String?,
      );
}
