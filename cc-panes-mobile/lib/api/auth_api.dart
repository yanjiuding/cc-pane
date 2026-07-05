import '../core/result.dart';
import '../models/auth_status.dart';
import 'api_client.dart';

/// /api/auth/* —— 登录、状态、登出（cookie 由 ApiClient 的 jar 自动管理）。
class AuthApi {
  const AuthApi(this._client);

  final ApiClient _client;

  Future<Result<AuthStatus>> status() => guard(
        () => _client.dio.get<Map<String, dynamic>>('/api/auth/status'),
        (response) => AuthStatus.fromJson(response.data as Map<String, dynamic>),
      );

  Future<Result<bool>> login({required String username, required String password}) => guard(
        () => _client.dio.post<Map<String, dynamic>>(
          '/api/auth/login',
          data: {'username': username, 'password': password},
        ),
        (response) =>
            (response.data as Map<String, dynamic>)['authenticated'] as bool? ?? false,
      );

  Future<Result<void>> logout() => guard(
        () => _client.dio.post<Map<String, dynamic>>('/api/auth/logout'),
        (_) {},
      );
}
