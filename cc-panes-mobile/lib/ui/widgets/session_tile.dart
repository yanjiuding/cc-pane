import 'package:flutter/material.dart';

import '../../models/workspace.dart' show pathBasename;
import '../../state/sessions_controller.dart';

/// 会话列表项：状态点 + 标题（项目名/自定义标题）+ CLI 徽标 + 当前状态。
class SessionTile extends StatelessWidget {
  const SessionTile({
    super.key,
    required this.session,
    this.onTap,
    this.onKill,
    this.indented = false,
  });

  final SessionView session;
  final VoidCallback? onTap;
  final VoidCallback? onKill;

  /// 分组内会话缩进对齐（视觉上归属上方的标签页标题）。
  final bool indented;

  @override
  Widget build(BuildContext context) {
    final info = session.info;
    final statusText = info.exited
        ? '已退出（exit ${info.exitCode ?? '?'}）'
        : info.currentToolName != null
            ? '${_statusLabel(info.status)} · ${info.currentToolName}'
            : _statusLabel(info.status);
    final projectName =
        session.projectPath != null ? pathBasename(session.projectPath!) : null;

    return ListTile(
      contentPadding: EdgeInsets.only(left: indented ? 32 : 16, right: 8),
      leading: Icon(Icons.circle, size: 12, color: _statusColor(session)),
      title: Row(
        children: [
          Flexible(
            child: Text(
              session.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (session.cliTool != null && session.cliTool != 'none') ...[
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.secondaryContainer,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                session.cliTool!,
                style: Theme.of(context).textTheme.labelSmall,
              ),
            ),
          ],
        ],
      ),
      subtitle: Text(
        projectName != null && projectName != session.title
            ? '$projectName · $statusText'
            : statusText,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: onKill == null
          ? null
          : IconButton(
              icon: const Icon(Icons.close),
              tooltip: '关闭会话',
              onPressed: onKill,
            ),
      onTap: onTap,
    );
  }

  static String _statusLabel(String status) => switch (status) {
        'initializing' => '启动中',
        'active' => '运行中',
        'idle' => '空闲',
        'thinking' => '思考中',
        'toolRunning' => '工具执行中',
        'compacting' => '压缩上下文',
        'waitingInput' => '等待输入',
        'exited' => '已退出',
        _ => status,
      };

  static Color _statusColor(SessionView session) {
    if (session.info.exited) return Colors.grey;
    return switch (session.info.status) {
      'idle' => Colors.green,
      'waitingInput' => Colors.orange,
      'active' || 'thinking' || 'toolRunning' || 'compacting' => Colors.blue,
      _ => Colors.grey,
    };
  }
}
