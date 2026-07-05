/// 统一错误处理，对齐后端 AppResult&lt;T&gt; 风格：
/// API/存储层返回 Result 而不是裸 throw 穿层，UI 层显式分支。
sealed class Result<T> {
  const Result();

  R when<R>({
    required R Function(T value) ok,
    required R Function(ApiFailure failure) err,
  }) {
    final self = this;
    return switch (self) {
      Ok<T>() => ok(self.value),
      Err<T>() => err(self.failure),
    };
  }

  T? get valueOrNull => switch (this) {
        Ok<T>(value: final v) => v,
        Err<T>() => null,
      };

  ApiFailure? get failureOrNull => switch (this) {
        Ok<T>() => null,
        Err<T>(failure: final f) => f,
      };
}

final class Ok<T> extends Result<T> {
  const Ok(this.value);
  final T value;
}

final class Err<T> extends Result<T> {
  const Err(this.failure);
  final ApiFailure failure;
}

enum FailureKind {
  /// 网络不可达 / 超时
  network,

  /// 401：会话过期或未登录
  unauthorized,

  /// 403 READ_ONLY：远程只读模式拦截
  readOnly,

  /// 403 REMOTE_FORBIDDEN：来源被服务端拒绝
  remoteForbidden,

  /// 404 等其余 HTTP 错误
  http,

  /// 响应解析失败等本地错误
  local,
}

class ApiFailure {
  const ApiFailure(this.kind, this.message, {this.statusCode});

  final FailureKind kind;
  final String message;
  final int? statusCode;

  @override
  String toString() => 'ApiFailure($kind, $statusCode, $message)';
}
