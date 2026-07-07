import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xterm/xterm.dart';

import '../api/sessions_api.dart';
import '../api/terminal_socket.dart';
import '../core/result.dart';
import 'auth_controller.dart';

enum TerminalPhase { connecting, connected, exited, error }

/// 单个会话的终端状态机：
/// snapshot 初始化 → 连 WS 收输出流 → 键盘输入经 WS input 回传。
/// Enter 发 \r（CC-Panes PTY 约定，xterm 键盘默认即 CR）。
/// 断线重连是 Phase 4，本期断开即显示错误状态。
class TerminalSessionController extends ChangeNotifier {
  TerminalSessionController({required this.sessionId, required AuthReady auth})
      : _auth = auth {
    terminal.onOutput = _handleUserInput;
    unawaited(_start());
  }

  final String sessionId;
  final AuthReady _auth;
  final Terminal terminal = Terminal(maxLines: 5000);

  TerminalPhase _phase = TerminalPhase.connecting;
  TerminalPhase get phase => _phase;
  int? exitCode;
  String? errorMessage;

  /// Ctrl 粘滞：点亮后下一个字母键转为 ctrl-code。
  bool ctrlLatched = false;

  TerminalSocket? _socket;
  StreamSubscription<TerminalEvent>? _sub;
  bool _disposed = false;

  Future<void> _start() async {
    // 1. snapshot 初始化（拿不到不阻塞，直接连流）
    final snapshot = await SessionsApi(_auth.client).snapshot(sessionId);
    if (_disposed) return;
    final data = snapshot.valueOrNull;
    if (data != null && data.isNotEmpty) {
      terminal.write(data);
    }

    // 2. 连 WebSocket
    try {
      final cookie = await _auth.client.sessionCookieHeader();
      _socket = await TerminalSocket.connect(
        baseUrl: _auth.client.profile.baseUrl,
        sessionId: sessionId,
        cookieHeader: cookie,
      );
    } on Object catch (error) {
      if (_disposed) return;
      _setPhase(TerminalPhase.error, message: '连接终端流失败: $error');
      return;
    }
    if (_disposed) {
      unawaited(_socket?.close());
      return;
    }

    _setPhase(TerminalPhase.connected);
    _autoFit(); // 进页面默认把 PTY 调整为手机屏幕尺寸（等 TerminalView 布局完成）
    _sub = _socket!.events.listen(
      (event) {
        switch (event) {
          case TerminalOutput(data: final data):
            terminal.write(data);
          case TerminalExit(exitCode: final code):
            exitCode = code;
            _setPhase(TerminalPhase.exited);
        }
      },
      onError: (Object error) =>
          _setPhase(TerminalPhase.error, message: '终端流中断: $error'),
      onDone: () {
        if (_phase == TerminalPhase.connected) {
          _setPhase(TerminalPhase.error, message: '终端流已断开');
        }
      },
    );
  }

  void _handleUserInput(String data) {
    if (_auth.readOnly) return;
    var out = data;
    if (ctrlLatched && data.length == 1) {
      final code = data.toLowerCase().codeUnitAt(0);
      if (code >= 0x61 && code <= 0x7a) {
        out = String.fromCharCode(code - 0x60);
      }
      ctrlLatched = false;
      notifyListeners();
    }
    _socket?.sendInput(out);
  }

  /// 快捷键条直发原始序列。
  void sendSequence(String sequence) => _handleUserInput(sequence);

  void toggleCtrl() {
    ctrlLatched = !ctrlLatched;
    notifyListeners();
  }

  /// 「跟随手机尺寸」：把共享 PTY 调整为当前 TerminalView 的 cols/rows。
  /// 进页面自动触发一次，AppBar 也可手动再触发（旋转/键盘弹出后重新适配）。
  void resizeToView() {
    final cols = terminal.viewWidth;
    final rows = terminal.viewHeight;
    if (cols > 0 && rows > 0) {
      _socket?.sendResize(cols, rows);
    }
  }

  /// 连上后自动适配：TerminalView 首帧可能还没把 viewWidth/Height 布局出来，
  /// 用 post-frame + 有限重试等到有效尺寸再下发 resize。
  void _autoFit({int attempt = 0}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_disposed || _phase != TerminalPhase.connected) return;
      if (terminal.viewWidth > 0 && terminal.viewHeight > 0) {
        resizeToView();
      } else if (attempt < 10) {
        _autoFit(attempt: attempt + 1);
      }
    });
  }

  void _setPhase(TerminalPhase next, {String? message}) {
    _phase = next;
    errorMessage = message;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    unawaited(_sub?.cancel());
    unawaited(_socket?.close());
    super.dispose();
  }
}

/// per-session controller；离开页面自动销毁（重连留到 Phase 4）。
final terminalControllerProvider = ChangeNotifierProvider.autoDispose
    .family<TerminalSessionController, String>((ref, sessionId) {
  final auth = ref.watch(authControllerProvider).value;
  if (auth is! AuthReady) {
    throw const ApiFailure(FailureKind.local, '未连接服务器');
  }
  return TerminalSessionController(sessionId: sessionId, auth: auth);
});
