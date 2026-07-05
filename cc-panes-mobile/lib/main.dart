import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/config.dart';
import 'core/result.dart';
import 'state/auth_controller.dart';
import 'ui/screens/connect_screen.dart';
import 'ui/screens/home_screen.dart';
import 'ui/screens/mirror_home_screen.dart';

void main() {
  runApp(const ProviderScope(child: CcPanesApp()));
}

class CcPanesApp extends StatelessWidget {
  const CcPanesApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'CC-Panes',
      theme: ThemeData(colorSchemeSeed: Colors.teal, brightness: Brightness.light),
      darkTheme: ThemeData(colorSchemeSeed: Colors.teal, brightness: Brightness.dark),
      home: const _Root(),
    );
  }
}

/// 按 AuthState 路由：无配置 → 连接页；连接中 → loading；就绪 → 会话列表；
/// 失败 → 带错误信息的连接页。
class _Root extends ConsumerWidget {
  const _Root();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);

    return auth.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (error, _) => ConnectScreen(errorMessage: '$error'),
      data: (state) => switch (state) {
        AuthNoProfile() => const ConnectScreen(),
        AuthConnecting() =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
        AuthReady() => AppConfig.useMirrorHome
            ? MirrorHomeScreen(auth: state)
            : HomeScreen(auth: state),
        AuthFailed(failure: final failure) => ConnectScreen(
            initial: ref.read(authControllerProvider.notifier).currentProfile,
            errorMessage: _describeFailure(failure),
          ),
      },
    );
  }

  static String _describeFailure(ApiFailure failure) => switch (failure.kind) {
        FailureKind.network => '无法连接服务器：${failure.message}',
        FailureKind.unauthorized => failure.message,
        FailureKind.remoteForbidden =>
          '服务端拒绝了远程访问。请在桌面端开启「允许局域网访问」并设置密码，或改用 Tailscale。',
        _ => failure.message,
      };
}
