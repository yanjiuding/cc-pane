import '../core/result.dart';
import '../models/session_info.dart';
import 'api_client.dart';

/// /api/sessions —— 终端会话 CRUD 与输入输出（REST 部分）。
class SessionsApi {
  const SessionsApi(this._client);

  final ApiClient _client;

  Future<Result<List<SessionInfo>>> list() => guard(
        () => _client.dio.get<List<dynamic>>('/api/sessions'),
        (response) => (response.data as List<dynamic>)
            .map((item) => SessionInfo.fromJson(item as Map<String, dynamic>))
            .toList(),
      );

  /// 新建会话。契约同 web 前端 CreateSessionRequest：
  /// - Claude/Codex：cliTool + launchClaude=true（可带 resumeId 恢复历史会话）
  /// - 纯终端：cliTool="none"、launchClaude=false
  Future<Result<String>> create({
    required String projectPath,
    String cliTool = 'none',
    bool launchClaude = false,
    String? workspaceName,
    String? resumeId,
    int cols = 120,
    int rows = 30,
  }) =>
      guard(
        () => _client.dio.post<Map<String, dynamic>>('/api/sessions', data: {
          'projectPath': projectPath,
          'cols': cols,
          'rows': rows,
          'cliTool': cliTool,
          'launchClaude': launchClaude,
          if (workspaceName != null) 'workspaceName': workspaceName,
          if (resumeId != null) 'resumeId': resumeId,
        }),
        (response) => (response.data as Map<String, dynamic>)['sessionId'] as String,
      );

  Future<Result<void>> kill(String sessionId) => guard(
        () => _client.dio.delete<void>('/api/sessions/$sessionId'),
        (_) {},
      );

  /// 原始终端输入。注意提交回车必须是 `\r`（CR），不是 `\n`。
  Future<Result<void>> write(String sessionId, String data) => guard(
        () => _client.dio.post<void>('/api/sessions/$sessionId/write', data: {'data': data}),
        (_) {},
      );

  /// 提交一段文本并回车（服务端处理 CR）。
  Future<Result<void>> submit(String sessionId, String text) => guard(
        () => _client.dio.post<void>('/api/sessions/$sessionId/submit', data: {'text': text}),
        (_) {},
      );

  Future<Result<void>> resize(String sessionId, int cols, int rows) => guard(
        () => _client.dio
            .post<void>('/api/sessions/$sessionId/resize', data: {'cols': cols, 'rows': rows}),
        (_) {},
      );

  /// 最近 N 行纯文本输出（卡片预览用；ANSI 已剥离）。
  Future<Result<List<String>>> output(String sessionId, {int lines = 2}) => guard(
        () => _client.dio.get<Map<String, dynamic>>(
            '/api/sessions/$sessionId/output', queryParameters: {'lines': lines}),
        (response) => (response.data?['lines'] as List<dynamic>? ?? const [])
            .map((e) => e.toString())
            .toList(),
      );

  /// VT 回放快照（attach 时初始化终端内容）。
  Future<Result<String>> snapshot(String sessionId) => guard(
        () => _client.dio.get<Map<String, dynamic>?>('/api/sessions/$sessionId/snapshot'),
        (response) {
          final data = response.data;
          if (data == null) return '';
          return data['data'] as String? ?? '';
        },
      );
}
