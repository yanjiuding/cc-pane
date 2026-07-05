import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/result.dart';
import '../../models/launch_record.dart';
import '../../models/workspace.dart';
import '../../state/mirror_controller.dart';
import '../../state/workspaces_controller.dart';
import '../screens/terminal_screen.dart';

/// 项目启动底部 sheet：启动 Claude / Codex / 纯终端 + 该项目最近启动记录（可 resume）。
Future<void> showLaunchSheet(
  BuildContext context,
  WidgetRef ref, {
  required WorkspaceProject project,
  String? workspaceName,
}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (sheetContext) => _LaunchSheet(project: project, workspaceName: workspaceName),
  );
}

class _LaunchSheet extends ConsumerWidget {
  const _LaunchSheet({required this.project, this.workspaceName});

  final WorkspaceProject project;
  final String? workspaceName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = ref.watch(launchHistoryProvider);
    final records = (history.value ?? const <LaunchRecord>[])
        .where((r) => r.projectPath == project.path && r.canResume)
        .take(5)
        .toList();

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(project.displayName, style: Theme.of(context).textTheme.titleMedium),
            Text(
              project.path,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    icon: const Icon(Icons.smart_toy_outlined, size: 18),
                    label: const Text('Claude'),
                    onPressed: () => _launch(context, ref, cliTool: 'claude'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton.tonalIcon(
                    icon: const Icon(Icons.code, size: 18),
                    label: const Text('Codex'),
                    onPressed: () => _launch(context, ref, cliTool: 'codex'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.terminal, size: 18),
                    label: const Text('终端'),
                    onPressed: () => _launch(context, ref, cliTool: 'none'),
                  ),
                ),
              ],
            ),
            if (records.isNotEmpty) ...[
              const SizedBox(height: 16),
              Text('最近启动（点击恢复会话）', style: Theme.of(context).textTheme.labelMedium),
              const SizedBox(height: 4),
              ...records.map((record) => ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(
                      record.cliTool == 'codex' ? Icons.code : Icons.smart_toy_outlined,
                      size: 20,
                    ),
                    title: Text(
                      record.lastPrompt?.isNotEmpty == true
                          ? record.lastPrompt!
                          : '会话 ${record.resumeSessionId!.substring(0, 8)}…',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    subtitle: Text(record.launchedAt.split('T').first),
                    onTap: () => _launch(
                      context,
                      ref,
                      cliTool: record.cliTool ?? 'claude',
                      resumeId: record.resumeSessionId,
                    ),
                  )),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _launch(
    BuildContext context,
    WidgetRef ref, {
    required String cliTool,
    String? resumeId,
  }) async {
    final result = await ref.read(mirrorControllerProvider.notifier).launch(
          projectPath: project.path,
          cliTool: cliTool,
          workspaceName: workspaceName,
          resumeId: resumeId,
        );
    if (!context.mounted) return;
    result.when(
      ok: (sessionId) {
        Navigator.of(context).pop();
        Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => TerminalScreen(
              sessionId: sessionId,
              title: project.displayName,
            ),
          ),
        );
      },
      err: (failure) {
        final message = failure.kind == FailureKind.readOnly
            ? '远程只读模式已拦截。可在桌面端开启「允许已登录的远程会话写入」。'
            : failure.message;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      },
    );
  }
}
