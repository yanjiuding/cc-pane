/// GET /api/workspace-snapshots/{workspaceId} 元素（WorkspaceSnapshotSummary）。
class WorkspaceSnapshotSummary {
  const WorkspaceSnapshotSummary({
    required this.id,
    required this.workspaceId,
    required this.title,
    required this.savedAt,
    required this.entryCount,
  });

  final String id;
  final String workspaceId;
  final String title;
  final String savedAt;
  final int entryCount;

  factory WorkspaceSnapshotSummary.fromJson(Map<String, dynamic> json) =>
      WorkspaceSnapshotSummary(
        id: json['id'] as String,
        workspaceId: json['workspaceId'] as String,
        title: json['title'] as String? ?? '',
        savedAt: json['savedAt'] as String? ?? '',
        entryCount: (json['entryCount'] as num?)?.toInt() ?? 0,
      );
}

/// POST .../restore 响应的单条结果。
class RestoredSnapshotEntry {
  const RestoredSnapshotEntry({
    required this.projectPath,
    required this.cliTool,
    this.sessionId,
    this.customTitle,
    this.error,
  });

  final String projectPath;
  final String cliTool;
  final String? sessionId;
  final String? customTitle;
  final String? error;

  bool get succeeded => sessionId != null && error == null;

  factory RestoredSnapshotEntry.fromJson(Map<String, dynamic> json) =>
      RestoredSnapshotEntry(
        projectPath: json['projectPath'] as String? ?? '',
        cliTool: json['cliTool'] as String? ?? 'none',
        sessionId: json['sessionId'] as String?,
        customTitle: json['customTitle'] as String?,
        error: json['error'] as String?,
      );
}

class RestoreSnapshotResult {
  const RestoreSnapshotResult({required this.snapshotId, required this.entries});

  final String snapshotId;
  final List<RestoredSnapshotEntry> entries;

  int get succeededCount => entries.where((e) => e.succeeded).length;

  factory RestoreSnapshotResult.fromJson(Map<String, dynamic> json) =>
      RestoreSnapshotResult(
        snapshotId: json['snapshotId'] as String,
        entries: (json['entries'] as List<dynamic>? ?? const [])
            .map((item) =>
                RestoredSnapshotEntry.fromJson(item as Map<String, dynamic>))
            .toList(),
      );
}
