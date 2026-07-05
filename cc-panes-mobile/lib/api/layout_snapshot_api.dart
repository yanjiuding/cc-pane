import '../core/result.dart';
import '../models/layout_snapshot.dart';
import 'api_client.dart';

/// GET /api/layout-snapshot/{profileId} —— 电脑当前布局镜像。
/// MVP 固定 profileId="default"（Codex 评审开放3 采纳）。
class LayoutSnapshotApi {
  const LayoutSnapshotApi(this._client);

  final ApiClient _client;

  /// 返回快照；桌面前端从未落库时后端可能返回空 body / null，此时得到 null。
  Future<Result<LayoutSnapshot?>> fetch({String profileId = 'default'}) => guard(
        () => _client.dio.get<dynamic>('/api/layout-snapshot/$profileId'),
        (response) {
          final data = response.data;
          if (data is! Map<String, dynamic>) return null;
          return LayoutSnapshot.fromJson(data);
        },
      );
}
