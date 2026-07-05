/// GET /api/launch-history 元素（web/services/historyService.ts 的 LaunchRecord）。
class LaunchRecord {
  const LaunchRecord({
    required this.id,
    required this.projectName,
    required this.projectPath,
    required this.launchedAt,
    this.resumeSessionId,
    this.cliTool,
    this.lastPrompt,
    this.workspaceName,
  });

  final int id;
  final String projectName;
  final String projectPath;
  final String launchedAt;
  final String? resumeSessionId;
  final String? cliTool;
  final String? lastPrompt;
  final String? workspaceName;

  bool get canResume => resumeSessionId?.isNotEmpty == true;

  factory LaunchRecord.fromJson(Map<String, dynamic> json) => LaunchRecord(
        id: (json['id'] as num).toInt(),
        projectName: json['projectName'] as String? ?? '',
        projectPath: json['projectPath'] as String? ?? '',
        launchedAt: json['launchedAt'] as String? ?? '',
        resumeSessionId: json['resumeSessionId'] as String?,
        cliTool: json['cliTool'] as String?,
        lastPrompt: json['lastPrompt'] as String?,
        workspaceName: json['workspaceName'] as String?,
      );
}
