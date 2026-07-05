import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/history_api.dart';
import '../api/sessions_api.dart';
import '../core/config.dart';
import '../core/result.dart';
import '../models/saved_session.dart';
import '../models/session_info.dart';
import 'auth_controller.dart';

/// 会话视图 = 运行态（GET /api/sessions）+ 关联信息（GET /api/terminal-sessions）。
/// SessionStatusInfo 只有 sessionId；项目路径/标题/CLI 来自 SavedSession 表。
class SessionView {
  const SessionView({required this.info, this.saved});

  final SessionInfo info;
  final SavedSession? saved;

  String get sessionId => info.sessionId;
  String get title => saved?.displayTitle ?? info.sessionId;
  String? get projectPath => saved?.projectPath;
  String? get cliTool => saved?.cliTool;
  String? get tabId => saved?.tabId;
}

/// 一个桌面标签页（可能含多分屏会话）在手机上的分组。
class SessionGroup {
  const SessionGroup({required this.title, required this.sessions, this.tabId});

  /// 桌面 tabId；null 表示"其他会话"（无布局归属，如手机自建的会话）。
  final String? tabId;
  final String title;
  final List<SessionView> sessions;

  bool get isMultiPane => sessions.length > 1;
}

/// 按 tabId 把会话分组，还原桌面的标签页/分屏归属（纯函数，便于单测）。
/// 有 tabId 的按 tab 聚合（同 tab = 同标签页/分屏）；无 tabId 的归到末尾"其他会话"。
/// 组内保持传入顺序，组间按各组首个会话的出现顺序稳定排列。
List<SessionGroup> groupSessionsByTab(List<SessionView> views) {
  final grouped = <String, List<SessionView>>{};
  final order = <String>[];
  final ungrouped = <SessionView>[];

  for (final view in views) {
    final tab = view.tabId;
    if (tab == null || tab.isEmpty) {
      ungrouped.add(view);
      continue;
    }
    if (!grouped.containsKey(tab)) {
      grouped[tab] = [];
      order.add(tab);
    }
    grouped[tab]!.add(view);
  }

  String labelFor(List<SessionView> sessions) {
    final saved = sessions.first.saved;
    if (saved?.workspaceName?.isNotEmpty == true) return saved!.workspaceName!;
    return sessions.first.title;
  }

  final groups = [
    for (final tab in order)
      SessionGroup(tabId: tab, title: labelFor(grouped[tab]!), sessions: grouped[tab]!),
  ];
  if (ungrouped.isNotEmpty) {
    groups.add(SessionGroup(title: '其他会话', sessions: ungrouped));
  }
  return groups;
}

/// 合并数据源为展示列表（纯函数，便于单测）。
/// [saved] 来自服务端 terminal-sessions（桌面前端写入，只覆盖桌面启动的会话）；
/// [localMeta] 是本端启动时记下的元数据，作为 fallback——移动端启动的会话
/// 不会出现在服务端关联表里。
List<SessionView> mergeSessionViews(
  List<SessionInfo> running,
  List<SavedSession> saved, {
  Map<String, SavedSession> localMeta = const {},
}) {
  final byId = {for (final s in saved) s.sessionId: s};
  return running
      .map((info) => SessionView(
          info: info, saved: byId[info.sessionId] ?? localMeta[info.sessionId]))
      .toList();
}

/// 会话列表：AuthReady 后每 5s 轮询；401 触发 AuthController 重连。
class SessionsController extends AsyncNotifier<List<SessionView>> {
  Timer? _timer;

  /// 本端启动的会话元数据（sessionId → 项目/CLI），进程内缓存。
  final Map<String, SavedSession> _localMeta = {};

  @override
  Future<List<SessionView>> build() async {
    final auth = await ref.watch(authControllerProvider.future);
    if (auth is! AuthReady) return const [];

    final sessionsApi = SessionsApi(auth.client);
    final historyApi = HistoryApi(auth.client);
    _timer?.cancel();
    _timer = Timer.periodic(
        AppConfig.sessionPollInterval, (_) => _refresh(sessionsApi, historyApi));
    ref.onDispose(() => _timer?.cancel());

    return _fetch(sessionsApi, historyApi);
  }

  Future<List<SessionView>> _fetch(SessionsApi sessions, HistoryApi history) async {
    final runningResult = await sessions.list();
    final running = switch (runningResult) {
      Ok(value: final list) => list,
      Err(failure: final failure) => _raise(failure),
    };
    // 关联表拿不到不阻塞列表（降级为裸 sessionId 展示）
    final saved = (await history.terminalSessions()).valueOrNull ?? const <SavedSession>[];
    return mergeSessionViews(running, saved, localMeta: _localMeta);
  }

  Never _raise(ApiFailure failure) {
    if (failure.kind == FailureKind.unauthorized) {
      unawaited(ref.read(authControllerProvider.notifier).reconnect());
    }
    throw failure;
  }

  Future<void> _refresh(SessionsApi sessions, HistoryApi history) async {
    try {
      state = AsyncData(await _fetch(sessions, history));
    } on ApiFailure catch (failure) {
      // 轮询失败保留旧列表，只在没有旧数据时暴露错误
      if (state.value == null) {
        state = AsyncError(failure, StackTrace.current);
      }
    }
  }

  /// 在项目中启动会话（Claude / Codex / 纯终端 / resume）。
  Future<Result<String>> launch({
    required String projectPath,
    String cliTool = 'none',
    String? workspaceName,
    String? resumeId,
  }) async {
    final api = _requireApis();
    if (api == null) {
      return const Err(ApiFailure(FailureKind.local, '未连接服务器'));
    }
    final result = await api.$1.create(
      projectPath: projectPath,
      cliTool: cliTool,
      launchClaude: cliTool != 'none',
      workspaceName: workspaceName,
      resumeId: resumeId,
    );
    if (result is Ok<String>) {
      _localMeta[result.value] = SavedSession(
        sessionId: result.value,
        projectPath: projectPath,
        workspaceName: workspaceName,
        cliTool: cliTool,
        resumeId: resumeId,
      );
      await _refresh(api.$1, api.$2);
    }
    return result;
  }

  Future<Result<void>> killSession(String sessionId) async {
    final api = _requireApis();
    if (api == null) {
      return const Err(ApiFailure(FailureKind.local, '未连接服务器'));
    }
    final result = await api.$1.kill(sessionId);
    await _refresh(api.$1, api.$2);
    return result;
  }

  (SessionsApi, HistoryApi)? _requireApis() {
    final auth = ref.read(authControllerProvider).value;
    if (auth is! AuthReady) return null;
    return (SessionsApi(auth.client), HistoryApi(auth.client));
  }
}

final sessionsControllerProvider =
    AsyncNotifierProvider<SessionsController, List<SessionView>>(SessionsController.new);
