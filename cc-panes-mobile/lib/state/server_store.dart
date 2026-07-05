import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/server_profile.dart';

const _profilesKey = 'server_profiles';
const _currentIdKey = 'current_profile_id';

class ServerState {
  const ServerState({required this.profiles, this.currentId});

  final List<ServerProfile> profiles;
  final String? currentId;

  ServerProfile? get current {
    if (profiles.isEmpty) return null;
    for (final profile in profiles) {
      if (profile.id == currentId) return profile;
    }
    return profiles.first;
  }
}

/// 服务器配置列表 + 当前选中，持久化在 flutter_secure_storage。
/// 数据模型从第一天就是多 profile，UI 先做单服务器。
class ServerStore extends AsyncNotifier<ServerState> {
  FlutterSecureStorage get _storage => ref.read(secureStorageProvider);

  @override
  Future<ServerState> build() => _load();

  Future<ServerState> _load() async {
    final raw = await _storage.read(key: _profilesKey);
    final currentId = await _storage.read(key: _currentIdKey);
    if (raw == null || raw.isEmpty) {
      return ServerState(profiles: const [], currentId: currentId);
    }
    try {
      final list = (jsonDecode(raw) as List<dynamic>)
          .map((item) => ServerProfile.fromJson(item as Map<String, dynamic>))
          .toList();
      return ServerState(profiles: list, currentId: currentId);
    } on FormatException {
      // 存储损坏时回退为空列表，让用户重新配置，而不是启动即崩
      return ServerState(profiles: const [], currentId: null);
    }
  }

  Future<void> _persist(ServerState next) async {
    await _storage.write(
      key: _profilesKey,
      value: jsonEncode(next.profiles.map((p) => p.toJson()).toList()),
    );
    if (next.currentId != null) {
      await _storage.write(key: _currentIdKey, value: next.currentId);
    } else {
      await _storage.delete(key: _currentIdKey);
    }
    state = AsyncData(next);
  }

  Future<void> upsert(ServerProfile profile) async {
    final current = state.value ?? const ServerState(profiles: []);
    final profiles = [...current.profiles];
    final index = profiles.indexWhere((p) => p.id == profile.id);
    if (index >= 0) {
      profiles[index] = profile;
    } else {
      profiles.add(profile);
    }
    await _persist(ServerState(profiles: profiles, currentId: profile.id));
  }

  Future<void> remove(String profileId) async {
    final current = state.value ?? const ServerState(profiles: []);
    final profiles = current.profiles.where((p) => p.id != profileId).toList();
    final currentId = current.currentId == profileId
        ? (profiles.isEmpty ? null : profiles.first.id)
        : current.currentId;
    await _persist(ServerState(profiles: profiles, currentId: currentId));
  }

  Future<void> select(String profileId) async {
    final current = state.value ?? const ServerState(profiles: []);
    await _persist(ServerState(profiles: current.profiles, currentId: profileId));
  }
}

final secureStorageProvider = Provider<FlutterSecureStorage>(
  (_) => const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  ),
);

final serverStoreProvider =
    AsyncNotifierProvider<ServerStore, ServerState>(ServerStore.new);
