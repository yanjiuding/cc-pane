import 'package:cc_panes_mobile/models/auth_status.dart';
import 'package:cc_panes_mobile/models/server_profile.dart';
import 'package:cc_panes_mobile/models/session_info.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('SessionInfo.fromJson', () {
    test('parses full SessionStatusInfo payload', () {
      final info = SessionInfo.fromJson({
        'sessionId': 'session-1',
        'status': 'toolRunning',
        'lastOutputAt': 100,
        'updatedAt': 120,
        'pid': 42,
        'currentToolName': 'Bash',
        'currentToolSummary': 'cargo test',
      });
      expect(info.sessionId, 'session-1');
      expect(info.status, 'toolRunning');
      expect(info.pid, 42);
      expect(info.exited, isFalse);
    });

    test('exitCode marks session exited; optional fields absent', () {
      final info = SessionInfo.fromJson({
        'sessionId': 's',
        'status': 'idle',
        'lastOutputAt': 0,
        'updatedAt': 0,
        'exitCode': 0,
      });
      expect(info.exited, isTrue);
      expect(info.currentToolName, isNull);
    });

    test('unknown status survives without throwing', () {
      final info = SessionInfo.fromJson({
        'sessionId': 's',
        'status': 'someFutureStatus',
        'lastOutputAt': 0,
        'updatedAt': 0,
      });
      expect(info.status, 'someFutureStatus');
    });
  });

  group('AuthStatus.fromJson', () {
    test('parses readOnly and remoteAuthenticatedWrite', () {
      final status = AuthStatus.fromJson({
        'authRequired': true,
        'authenticated': true,
        'username': 'admin',
        'passwordConfigured': true,
        'allowLan': true,
        'lockOnIdleMinutes': 30,
        'readOnly': false,
        'remoteAuthenticatedWrite': true,
      });
      expect(status.authenticated, isTrue);
      expect(status.readOnly, isFalse);
      expect(status.remoteAuthenticatedWrite, isTrue);
    });

    test('older server without new field defaults to false', () {
      final status = AuthStatus.fromJson({
        'authRequired': false,
        'authenticated': true,
        'username': 'admin',
        'passwordConfigured': false,
        'readOnly': true,
      });
      expect(status.remoteAuthenticatedWrite, isFalse);
      expect(status.readOnly, isTrue);
    });
  });

  group('ServerProfile', () {
    test('normalizeBaseUrl adds scheme and strips trailing slash', () {
      expect(ServerProfile.normalizeBaseUrl('192.168.1.5:18080/'),
          'http://192.168.1.5:18080');
      expect(ServerProfile.normalizeBaseUrl('https://host.ts.net/'),
          'https://host.ts.net');
      expect(ServerProfile.normalizeBaseUrl('  http://a:1  '), 'http://a:1');
    });

    test('json round-trip', () {
      const profile = ServerProfile(
        id: '1',
        name: 'desktop',
        baseUrl: 'http://192.168.1.5:18080',
        username: 'admin',
        password: 'secret',
      );
      final restored = ServerProfile.fromJson(profile.toJson());
      expect(restored.baseUrl, profile.baseUrl);
      expect(restored.password, profile.password);
    });
  });
}
