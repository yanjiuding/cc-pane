import '../core/result.dart';
import '../models/launch_record.dart';
import '../models/saved_session.dart';
import 'api_client.dart';

/// /api/launch-history + /api/terminal-sessions —— 启动历史与会话关联表。
class HistoryApi {
  const HistoryApi(this._client);

  final ApiClient _client;

  Future<Result<List<LaunchRecord>>> launchHistory({int limit = 50}) => guard(
        () => _client.dio
            .get<List<dynamic>>('/api/launch-history', queryParameters: {'limit': limit}),
        (response) => (response.data as List<dynamic>)
            .map((item) => LaunchRecord.fromJson(item as Map<String, dynamic>))
            .toList(),
      );

  Future<Result<List<SavedSession>>> terminalSessions() => guard(
        () => _client.dio.get<List<dynamic>>('/api/terminal-sessions'),
        (response) => (response.data as List<dynamic>)
            .map((item) => SavedSession.fromJson(item as Map<String, dynamic>))
            .toList(),
      );
}
