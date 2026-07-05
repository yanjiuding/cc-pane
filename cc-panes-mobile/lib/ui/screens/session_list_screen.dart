import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/result.dart';
import '../../state/sessions_controller.dart';
import '../widgets/session_tile.dart';
import 'terminal_screen.dart';

/// 会话列表（HomeScreen 的一个 tab body）：
/// 显示项目名/标题/CLI 类型，可关闭会话。新建走工作空间 tab 的启动 sheet。
class SessionListScreen extends ConsumerWidget {
  const SessionListScreen({super.key, required this.readOnly});

  final bool readOnly;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessions = ref.watch(sessionsControllerProvider);

    return sessions.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('加载失败: $error'),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: () => ref.invalidate(sessionsControllerProvider),
              child: const Text('重试'),
            ),
          ],
        ),
      ),
      data: (list) {
        if (list.isEmpty) {
          return const Center(child: Text('暂无会话，去「工作空间」里选个项目启动'));
        }
        final groups = groupSessionsByTab(list);
        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(sessionsControllerProvider),
          child: ListView(
            children: [
              for (final group in groups) ...[
                _GroupHeader(group: group),
                for (final session in group.sessions)
                  SessionTile(
                    session: session,
                    indented: group.tabId != null,
                    onKill:
                        readOnly ? null : () => _killSession(context, ref, session),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => TerminalScreen(
                          sessionId: session.sessionId,
                          title: session.title,
                        ),
                      ),
                    ),
                  ),
              ],
            ],
          ),
        );
      },
    );
  }

  Future<void> _killSession(
      BuildContext context, WidgetRef ref, SessionView session) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('关闭会话？'),
        content: Text('将终止「${session.title}」及其整棵进程树。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('关闭'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    final result = await ref
        .read(sessionsControllerProvider.notifier)
        .killSession(session.sessionId);
    if (!context.mounted) return;
    result.when(
      ok: (_) {},
      err: (failure) {
        final message = failure.kind == FailureKind.readOnly
            ? '远程只读模式已拦截该操作。可在桌面端设置中开启「允许已登录的远程会话写入」。'
            : failure.message;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      },
    );
  }
}

/// 会话分组标题：桌面一个标签页/分屏 = 一组。
class _GroupHeader extends StatelessWidget {
  const _GroupHeader({required this.group});

  final SessionGroup group;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      color: scheme.surfaceContainerHigh,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: Row(
        children: [
          Icon(
            group.tabId == null ? Icons.dashboard_outlined : Icons.tab,
            size: 16,
            color: scheme.onSurfaceVariant,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              group.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context)
                  .textTheme
                  .labelLarge
                  ?.copyWith(color: scheme.onSurfaceVariant),
            ),
          ),
          if (group.tabId != null && group.isMultiPane)
            Text(
              '${group.sessions.length} 分屏',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
            ),
        ],
      ),
    );
  }
}
