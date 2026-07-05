import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../api/auth_api.dart';
import '../core/result.dart';
import '../models/auth_status.dart';
import '../models/server_profile.dart';
import 'server_store.dart';

/// 连接 + 登录状态。
sealed class AuthState {
  const AuthState();
}

/// 尚未配置任何服务器
final class AuthNoProfile extends AuthState {
  const AuthNoProfile();
}

final class AuthConnecting extends AuthState {
  const AuthConnecting();
}

/// 已连接并可用（authenticated 或服务端未开鉴权）
final class AuthReady extends AuthState {
  const AuthReady({required this.client, required this.status});

  final ApiClient client;
  final AuthStatus status;

  bool get readOnly => status.readOnly;
}

/// 需要用户交互（密码错误 / 静默重登失败 / 网络错误）
final class AuthFailed extends AuthState {
  const AuthFailed(this.failure);

  final ApiFailure failure;
}

/// 登录生命周期：
/// 启动 → 读当前 profile → status 探测 → 已认证直达 / 用存储密码静默登录 →
/// 失败才落到 AuthFailed 让 UI 弹登录页。
class AuthController extends AsyncNotifier<AuthState> {
  /// 当前选中的 profile（登录失败时供 ConnectScreen 预填表单）。
  ServerProfile? get currentProfile => ref.read(serverStoreProvider).value?.current;

  @override
  Future<AuthState> build() async {
    final servers = await ref.watch(serverStoreProvider.future);
    final profile = servers.current;
    if (profile == null) return const AuthNoProfile();
    return _connect(profile);
  }

  Future<AuthState> _connect(ServerProfile profile) async {
    final client = await ApiClient.create(profile);
    final api = AuthApi(client);

    final statusResult = await api.status();
    switch (statusResult) {
      case Err(failure: final failure):
        return AuthFailed(failure);
      case Ok(value: final status):
        if (!status.authRequired || status.authenticated) {
          return AuthReady(client: client, status: status);
        }
    }

    // cookie 过期或首次连接：用存储凭证静默登录
    final loginResult =
        await api.login(username: profile.username, password: profile.password);
    switch (loginResult) {
      case Err(failure: final failure):
        return AuthFailed(failure);
      case Ok(value: final authenticated):
        if (!authenticated) {
          return const AuthFailed(
            ApiFailure(FailureKind.unauthorized, '用户名或密码错误'),
          );
        }
    }

    final refreshed = await api.status();
    return refreshed.when(
      ok: (status) => AuthReady(client: client, status: status),
      err: AuthFailed.new,
    );
  }

  /// 保存（或更新）profile 并立即连接。供 ConnectScreen 调用。
  Future<void> connectWith(ServerProfile profile) async {
    state = const AsyncData(AuthConnecting());
    await ref.read(serverStoreProvider.notifier).upsert(profile);
    // serverStoreProvider 变更会触发 build() 重新连接
  }

  /// 401 时由调用方触发：重新跑一遍连接流程（含静默重登）。
  Future<void> reconnect() async {
    final servers = ref.read(serverStoreProvider).value;
    final profile = servers?.current;
    if (profile == null) {
      state = const AsyncData(AuthNoProfile());
      return;
    }
    state = const AsyncData(AuthConnecting());
    state = AsyncData(await _connect(profile));
  }
}

final authControllerProvider =
    AsyncNotifierProvider<AuthController, AuthState>(AuthController.new);
