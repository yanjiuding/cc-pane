/// GET /api/auth/status 响应（cc-panes-web web_auth.rs AuthStatus，camelCase）。
class AuthStatus {
  const AuthStatus({
    required this.authRequired,
    required this.authenticated,
    required this.username,
    required this.passwordConfigured,
    required this.readOnly,
    required this.remoteAuthenticatedWrite,
  });

  final bool authRequired;
  final bool authenticated;
  final String username;
  final bool passwordConfigured;

  /// 本请求来源在远程只读模式下是否被限制为只读
  final bool readOnly;

  /// 服务端是否开启"已登录远程会话可写"
  final bool remoteAuthenticatedWrite;

  factory AuthStatus.fromJson(Map<String, dynamic> json) => AuthStatus(
        authRequired: json['authRequired'] as bool? ?? false,
        authenticated: json['authenticated'] as bool? ?? false,
        username: json['username'] as String? ?? '',
        passwordConfigured: json['passwordConfigured'] as bool? ?? false,
        readOnly: json['readOnly'] as bool? ?? false,
        remoteAuthenticatedWrite: json['remoteAuthenticatedWrite'] as bool? ?? false,
      );
}
