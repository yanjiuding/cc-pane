import '../core/result.dart';
import '../models/workspace.dart';
import '../models/workspace_snapshot.dart';
import 'api_client.dart';

/// /api/workspaces + /api/workspace-snapshots —— 工作空间树与布局快照。
class WorkspacesApi {
  const WorkspacesApi(this._client);

  final ApiClient _client;

  Future<Result<List<Workspace>>> list() => guard(
        () => _client.dio.get<List<dynamic>>('/api/workspaces'),
        (response) => (response.data as List<dynamic>)
            .map((item) => Workspace.fromJson(item as Map<String, dynamic>))
            .toList(),
      );

  Future<Result<List<WorkspaceSnapshotSummary>>> listSnapshots(String workspaceId) =>
      guard(
        () => _client.dio.get<List<dynamic>>('/api/workspace-snapshots/$workspaceId'),
        (response) => (response.data as List<dynamic>)
            .map((item) =>
                WorkspaceSnapshotSummary.fromJson(item as Map<String, dynamic>))
            .toList(),
      );

  /// 按快照重建一组会话（各自带 resumeId 续接对话上下文）。
  Future<Result<RestoreSnapshotResult>> restoreSnapshot(
          String workspaceId, String snapshotId) =>
      guard(
        () => _client.dio.post<Map<String, dynamic>>(
            '/api/workspace-snapshots/$workspaceId/$snapshotId/restore'),
        (response) =>
            RestoreSnapshotResult.fromJson(response.data as Map<String, dynamic>),
      );
}
