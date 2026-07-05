import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/workspace.dart';
import '../../state/workspaces_controller.dart';
import '../widgets/launch_sheet.dart';

/// 工作空间树：工作空间（可折叠）→ 项目 → 点击弹启动 sheet。只读浏览。
class WorkspaceScreen extends ConsumerWidget {
  const WorkspaceScreen({super.key});

  Future<void> _restoreSnapshot(
      BuildContext context, WidgetRef ref, Workspace workspace) async {
    final result = await ref
        .read(workspacesControllerProvider.notifier)
        .restoreLatestSnapshot(workspace);
    if (!context.mounted) return;
    if (result == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('该工作空间没有可恢复的布局快照')),
      );
      return;
    }
    result.when(
      ok: (restore) {
        final failed = restore.entries.length - restore.succeededCount;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(failed == 0
              ? '已恢复 ${restore.succeededCount} 个会话，去「会话」查看'
              : '恢复 ${restore.succeededCount} 个成功、$failed 个失败（详见会话列表）'),
        ));
      },
      err: (failure) => ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(failure.message))),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final workspaces = ref.watch(workspacesControllerProvider);

    return workspaces.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('加载失败: $error'),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: () => ref.invalidate(workspacesControllerProvider),
              child: const Text('重试'),
            ),
          ],
        ),
      ),
      data: (list) => list.isEmpty
          ? const Center(child: Text('桌面端还没有工作空间'))
          : RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(workspacesControllerProvider);
                ref.invalidate(launchHistoryProvider);
              },
              child: ListView(
                children: [
                  for (final workspace in list)
                    ExpansionTile(
                      leading: Icon(
                        workspace.pinned ? Icons.push_pin : Icons.folder_outlined,
                        size: 20,
                      ),
                      title: Text(workspace.displayName),
                      subtitle: Text(
                        '${workspace.projects.length} 个项目',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      children: [
                        ListTile(
                          contentPadding: const EdgeInsets.only(left: 32, right: 16),
                          leading: const Icon(Icons.history, size: 20),
                          title: const Text('恢复上次布局'),
                          subtitle: const Text('按快照重建一组会话（resume 续接对话）'),
                          onTap: () => _restoreSnapshot(context, ref, workspace),
                        ),
                        for (final project in workspace.projects)
                          ListTile(
                            contentPadding: const EdgeInsets.only(left: 32, right: 16),
                            leading: const Icon(Icons.source_outlined, size: 20),
                            title: Text(project.displayName),
                            subtitle: Text(
                              project.path,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            trailing: const Icon(Icons.play_arrow_rounded),
                            onTap: () => showLaunchSheet(
                              context,
                              ref,
                              project: project,
                              workspaceName: workspace.name,
                            ),
                          ),
                      ],
                    ),
                ],
              ),
            ),
    );
  }
}
