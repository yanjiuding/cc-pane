import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/workspaces_controller.dart';
import 'launch_sheet.dart';

/// 启动入口：先选工作空间/项目，再进 launch_sheet 选 Claude/Codex/终端。
/// 启动的会话进「手机远程会话」组（桌面前端未纳入布局，诚实标注）。
Future<void> showLaunchPicker(BuildContext context, WidgetRef ref) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (_) => const _LaunchPicker(),
  );
}

class _LaunchPicker extends ConsumerWidget {
  const _LaunchPicker();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final workspaces = ref.watch(workspacesControllerProvider);
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.75),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Row(
                children: [
                  Text('选项目启动', style: Theme.of(context).textTheme.titleMedium),
                  const Spacer(),
                  Text('会进「手机远程会话」',
                      style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
            Flexible(
              child: workspaces.when(
                loading: () => const Padding(
                  padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(),
                ),
                error: (error, _) => Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text('加载失败: $error'),
                ),
                data: (list) => ListView(
                  shrinkWrap: true,
                  children: [
                    for (final workspace in list)
                      ExpansionTile(
                        leading: const Icon(Icons.folder_outlined, size: 20),
                        title: Text(workspace.displayName),
                        subtitle: Text('${workspace.projects.length} 个项目'),
                        children: [
                          for (final project in workspace.projects)
                            ListTile(
                              contentPadding: const EdgeInsets.only(left: 32, right: 16),
                              leading: const Icon(Icons.source_outlined, size: 20),
                              title: Text(project.displayName),
                              subtitle: Text(project.path,
                                  maxLines: 1, overflow: TextOverflow.ellipsis),
                              onTap: () {
                                Navigator.of(context).pop();
                                showLaunchSheet(
                                  context,
                                  ref,
                                  project: project,
                                  workspaceName: workspace.name,
                                );
                              },
                            ),
                        ],
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
