import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xterm/xterm.dart';

import '../../state/terminal_controller.dart';
import '../widgets/key_bar.dart';

/// 终端页：xterm 渲染 + WS 输入 + 快捷键条。
/// 进页面默认把共享 PTY 适配为手机屏幕尺寸，AppBar 提供手动「再适配」（旋转后用）。
class TerminalScreen extends ConsumerWidget {
  const TerminalScreen({super.key, required this.sessionId, required this.title});

  final String sessionId;
  final String title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.watch(terminalControllerProvider(sessionId));

    return Scaffold(
      appBar: AppBar(
        title: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          if (controller.phase == TerminalPhase.connected)
            IconButton(
              icon: const Icon(Icons.fit_screen_outlined),
              tooltip: '把 PTY 尺寸调整为手机屏幕（会影响桌面端同一会话的渲染）',
              onPressed: () {
                controller.resizeToView();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('已按手机屏幕调整终端尺寸')),
                );
              },
            ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (controller.phase == TerminalPhase.connecting)
              const LinearProgressIndicator(minHeight: 2),
            if (controller.phase == TerminalPhase.error)
              MaterialBanner(
                content: Text(controller.errorMessage ?? '连接中断'),
                actions: [
                  TextButton(
                    onPressed: () =>
                        ref.invalidate(terminalControllerProvider(sessionId)),
                    child: const Text('重连'),
                  ),
                ],
              ),
            if (controller.phase == TerminalPhase.exited)
              MaterialBanner(
                content: Text('会话已退出（exit ${controller.exitCode ?? '?'}）'),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('返回'),
                  ),
                ],
              ),
            Expanded(
              child: ColoredBox(
                color: const Color(0xFF1E1E1E),
                child: TerminalView(
                  controller.terminal,
                  textStyle: const TerminalStyle(fontSize: 12),
                  autofocus: true,
                ),
              ),
            ),
            KeyBar(controller: controller),
          ],
        ),
      ),
    );
  }
}
