import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/history_api.dart';
import '../api/workspaces_api.dart';
import '../core/result.dart';
import '../models/launch_record.dart';
import '../models/workspace.dart';
import '../models/workspace_snapshot.dart';
import 'auth_controller.dart';
import 'sessions_controller.dart';

/// 工作空间树 + 启动历史，进入首页加载一次，下拉刷新。
class WorkspacesController extends AsyncNotifier<List<Workspace>> {
  @override
  Future<List<Workspace>> build() async {
    final auth = await ref.watch(authControllerProvider.future);
    if (auth is! AuthReady) return const [];
    final result = await WorkspacesApi(auth.client).list();
    return switch (result) {
      Ok(value: final workspaces) => _sorted(workspaces),
      Err(failure: final failure) => throw failure,
    };
  }

  List<Workspace> _sorted(List<Workspace> workspaces) {
    final sorted = [...workspaces];
    sorted.sort((a, b) {
      if (a.pinned != b.pinned) return a.pinned ? -1 : 1;
      return a.displayName.compareTo(b.displayName);
    });
    return sorted;
  }

  /// 恢复该工作空间最近一次布局快照：逐 entry 重建会话（resume 续接）。
  /// 返回 null 表示没有可恢复的快照。
  Future<Result<RestoreSnapshotResult>?> restoreLatestSnapshot(
      Workspace workspace) async {
    final auth = ref.read(authControllerProvider).value;
    if (auth is! AuthReady) {
      return const Err(ApiFailure(FailureKind.local, '未连接服务器'));
    }
    final api = WorkspacesApi(auth.client);

    // 快照在服务端按 workspace name（而非 uuid）作为 key 存储
    final snapshots = await api.listSnapshots(workspace.name);
    switch (snapshots) {
      case Err(failure: final failure):
        return Err(failure);
      case Ok(value: final list):
        if (list.isEmpty) return null;
        final sorted = [...list]..sort((a, b) => b.savedAt.compareTo(a.savedAt));
        final result = await api.restoreSnapshot(workspace.name, sorted.first.id);
        if (result is Ok<RestoreSnapshotResult>) {
          ref.invalidate(sessionsControllerProvider);
        }
        return result;
    }
  }
}

final workspacesControllerProvider =
    AsyncNotifierProvider<WorkspacesController, List<Workspace>>(WorkspacesController.new);

/// 全量启动历史（launch sheet 按 projectPath 过滤展示）。
final launchHistoryProvider = FutureProvider<List<LaunchRecord>>((ref) async {
  final auth = await ref.watch(authControllerProvider.future);
  if (auth is! AuthReady) return const [];
  final result = await HistoryApi(auth.client).launchHistory(limit: 100);
  return result.valueOrNull ?? const [];
});

