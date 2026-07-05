import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/sessions_api.dart';
import '../../state/auth_controller.dart';
import '../../state/mirror_controller.dart';

/// 会话卡最近输出预览（懒加载，按 sessionId 缓存；不随 5s 轮询频繁重拉）。
final _previewProvider =
    FutureProvider.autoDispose.family<String?, String>((ref, sessionId) async {
  final auth = ref.watch(authControllerProvider).value;
  if (auth is! AuthReady) return null;
  final result = await SessionsApi(auth.client).output(sessionId, lines: 2);
  final lines = result.valueOrNull ?? const [];
  for (final line in lines.reversed) {
    if (line.trim().isNotEmpty) return line.trim();
  }
  return null;
});

/// 镜像会话卡：状态点 + 标题 + 项目/CLI + pane 序号/active + 最近输出预览。
class MirrorCardTile extends ConsumerWidget {
  const MirrorCardTile({super.key, required this.card, this.onTap, this.onKill});

  final MirrorCard card;
  final VoidCallback? onTap;
  final VoidCallback? onKill;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final preview = ref.watch(_previewProvider(card.sessionId));

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.circle, size: 11, color: _statusColor(card)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      card.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                  if (card.cliTool != null && card.cliTool != 'none')
                    _Badge(text: card.cliTool!, scheme: scheme),
                  if (card.paneOrdinal != null) ...[
                    const SizedBox(width: 4),
                    _Badge(
                      text: 'Pane ${card.paneOrdinal}${card.isActiveLeaf ? '·当前' : ''}',
                      scheme: scheme,
                      subtle: true,
                    ),
                  ],
                  if (onKill != null)
                    IconButton(
                      icon: const Icon(Icons.close, size: 18),
                      visualDensity: VisualDensity.compact,
                      tooltip: '关闭会话',
                      onPressed: onKill,
                    ),
                ],
              ),
              const SizedBox(height: 2),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _subtitle(card),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
                    ),
                  ),
                ],
              ),
              preview.maybeWhen(
                data: (line) => line == null
                    ? const SizedBox.shrink()
                    : Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text(
                          line,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 11,
                            fontFamily: 'monospace',
                            color: scheme.onSurfaceVariant.withValues(alpha: 0.8),
                          ),
                        ),
                      ),
                orElse: () => const SizedBox.shrink(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _subtitle(MirrorCard card) {
    final status = _statusLabel(card.info.status);
    final tool = card.info.currentToolName;
    final statusText = tool != null ? '$status · $tool' : status;
    final project = card.projectName;
    if (card.orphanReason != null) return '${card.orphanReason} · $statusText';
    if (project != null && project.isNotEmpty && project != card.title) {
      return '$project · $statusText';
    }
    return statusText;
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

  static Color _statusColor(MirrorCard card) {
    if (card.info.exited) return Colors.grey;
    return switch (card.info.status) {
      'idle' => Colors.green,
      'waitingInput' => Colors.orange,
      'active' || 'thinking' || 'toolRunning' || 'compacting' => Colors.blue,
      _ => Colors.grey,
    };
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.text, required this.scheme, this.subtle = false});

  final String text;
  final ColorScheme scheme;
  final bool subtle;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: subtle ? scheme.surfaceContainerHighest : scheme.secondaryContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(text, style: Theme.of(context).textTheme.labelSmall),
    );
  }
}
