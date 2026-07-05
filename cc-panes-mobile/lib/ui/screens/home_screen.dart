import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/auth_controller.dart';
import '../../state/sessions_controller.dart';
import 'session_list_screen.dart';
import 'workspace_screen.dart';

/// 登录后的主界面：工作空间 / 会话 两个 tab。
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key, required this.auth});

  final AuthReady auth;

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final sessionCount =
        ref.watch(sessionsControllerProvider).value?.length ?? 0;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.auth.client.profile.name),
        actions: [
          if (widget.auth.readOnly)
            const Padding(
              padding: EdgeInsets.only(right: 8),
              child: Chip(label: Text('只读'), visualDensity: VisualDensity.compact),
            ),
        ],
      ),
      body: IndexedStack(
        index: _tab,
        children: [
          const WorkspaceScreen(),
          SessionListScreen(readOnly: widget.auth.readOnly),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (index) => setState(() => _tab = index),
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.folder_outlined),
            selectedIcon: Icon(Icons.folder),
            label: '工作空间',
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: sessionCount > 0,
              label: Text('$sessionCount'),
              child: const Icon(Icons.terminal_outlined),
            ),
            selectedIcon: const Icon(Icons.terminal),
            label: '会话',
          ),
        ],
      ),
    );
  }
}
