import 'package:cc_panes_mobile/models/launch_record.dart';
import 'package:cc_panes_mobile/models/saved_session.dart';
import 'package:cc_panes_mobile/models/session_info.dart';
import 'package:cc_panes_mobile/models/workspace.dart';
import 'package:cc_panes_mobile/state/sessions_controller.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Workspace.fromJson', () {
    test('parses tree with projects and alias fallback', () {
      final workspace = Workspace.fromJson({
        'id': 'w1',
        'name': 'emergency',
        'alias': '化工平台',
        'createdAt': '2026-03-06T00:00:00Z',
        'projects': [
          {'id': 'p1', 'path': r'D:\work\repo-a', 'alias': '前端'},
          {'id': 'p2', 'path': r'D:\work\repo-b'},
        ],
      });
      expect(workspace.displayName, '化工平台');
      expect(workspace.projects, hasLength(2));
      expect(workspace.projects[0].displayName, '前端');
      expect(workspace.projects[1].displayName, 'repo-b');
    });

    test('pathBasename handles both separators', () {
      expect(pathBasename(r'D:\a\b\repo'), 'repo');
      expect(pathBasename('/home/user/repo'), 'repo');
      expect(pathBasename('repo'), 'repo');
    });
  });

  group('LaunchRecord.fromJson', () {
    test('parses record and canResume', () {
      final record = LaunchRecord.fromJson({
        'id': 490,
        'projectName': 'proj',
        'projectPath': r'I:\proj',
        'launchedAt': '2026-07-04T08:38:41Z',
        'resumeSessionId': '342961cf',
        'cliTool': 'claude',
        'lastPrompt': null,
        'workspaceName': 'emergency',
      });
      expect(record.canResume, isTrue);
      expect(record.cliTool, 'claude');
    });

    test('no resumeSessionId means not resumable', () {
      final record = LaunchRecord.fromJson({
        'id': 1,
        'projectName': 'p',
        'projectPath': 'x',
        'launchedAt': '',
      });
      expect(record.canResume, isFalse);
    });
  });

  group('mergeSessionViews', () {
    SessionInfo info(String id) => SessionInfo.fromJson({
          'sessionId': id,
          'status': 'idle',
          'lastOutputAt': 0,
          'updatedAt': 0,
        });

    test('joins saved metadata by sessionId', () {
      final saved = SavedSession.fromJson({
        'sessionId': 's1',
        'projectPath': r'D:\work\repo-a',
        'cliTool': 'claude',
        'customTitle': '修 bug',
      });
      final views = mergeSessionViews([info('s1'), info('s2')], [saved]);
      expect(views[0].title, '修 bug');
      expect(views[0].cliTool, 'claude');
      // 无关联信息降级为裸 sessionId
      expect(views[1].title, 's2');
      expect(views[1].projectPath, isNull);
    });

    test('localMeta fills sessions missing from server table', () {
      final local = SavedSession.fromJson({
        'sessionId': 's2',
        'projectPath': r'D:\work\repo-b',
        'cliTool': 'codex',
      });
      final views = mergeSessionViews(
        [info('s2')],
        const [],
        localMeta: {'s2': local},
      );
      expect(views[0].title, 'repo-b');
      expect(views[0].cliTool, 'codex');
    });

    test('customTitle falls back to project basename', () {
      final saved = SavedSession.fromJson({
        'sessionId': 's1',
        'projectPath': r'D:\work\repo-a',
      });
      final views = mergeSessionViews([info('s1')], [saved]);
      expect(views[0].title, 'repo-a');
    });
  });

  group('groupSessionsByTab', () {
    SessionView view(String id, {String? tab, String? ws, String? project}) => SessionView(
          info: SessionInfo.fromJson({
            'sessionId': id,
            'status': 'idle',
            'lastOutputAt': 0,
            'updatedAt': 0,
          }),
          saved: (tab == null && ws == null && project == null)
              ? null
              : SavedSession(
                  sessionId: id,
                  projectPath: project ?? r'D:\work\repo',
                  tabId: tab,
                  workspaceName: ws,
                ),
        );

    test('same tabId groups together as one multi-pane tab', () {
      final groups = groupSessionsByTab([
        view('a', tab: 'tab-1', ws: 'emergency'),
        view('b', tab: 'tab-1', ws: 'emergency'),
        view('c', tab: 'tab-2', ws: 'cc-book'),
      ]);
      expect(groups, hasLength(2));
      expect(groups[0].tabId, 'tab-1');
      expect(groups[0].title, 'emergency');
      expect(groups[0].sessions, hasLength(2));
      expect(groups[0].isMultiPane, isTrue);
      expect(groups[1].tabId, 'tab-2');
      expect(groups[1].isMultiPane, isFalse);
    });

    test('sessions without tabId fall into a trailing "其他会话" group', () {
      final groups = groupSessionsByTab([
        view('a', tab: 'tab-1', ws: 'ws'),
        view('b'), // 无 saved / 无 tabId
      ]);
      expect(groups, hasLength(2));
      expect(groups.last.tabId, isNull);
      expect(groups.last.title, '其他会话');
      expect(groups.last.sessions.single.sessionId, 'b');
    });

    test('group order follows first appearance', () {
      final groups = groupSessionsByTab([
        view('a', tab: 'tab-2'),
        view('b', tab: 'tab-1'),
        view('c', tab: 'tab-2'),
      ]);
      expect(groups.map((g) => g.tabId), ['tab-2', 'tab-1']);
    });
  });
}
