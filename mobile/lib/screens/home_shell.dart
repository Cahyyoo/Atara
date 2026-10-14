import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/stages_provider.dart';

import '../l10n/app_localizations.dart';
import '../theme/app_theme.dart';
import 'home_screen.dart';
import 'scanner_screen.dart';
import 'settings_screen.dart';

/// The signed-in shell: two tabs, and a scan button between them.
///
/// Scanning is not a tab of its own even though it sits in the tab bar. A tab
/// keeps its state alive, so the camera would stay running in the background
/// and need pause/resume plumbing of its own; presenting it as a full-screen
/// modal keeps the lifecycle [ScannerScreen] already expects — start on push,
/// stop on pop — and matches how iOS apps raise a capture surface.
///
/// Built from an [IndexedStack] and a [CupertinoTabBar] rather than a
/// [CupertinoTabScaffold], because with only two resident tabs the scaffold
/// would have to be fought to intercept the middle index. This is fewer moving
/// parts, and each tab keeps its scroll position.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _index = 0;

  @override
  void initState() {
    super.initState();
    // The stage list never changes during a shift and every scan needs it, so
    // fetch it while the preparator is still looking at Home rather than making
    // the first scan of the day wait for it.
    ref.read(stagesProvider);
  }

  Future<void> _openScanner() async {
    await Navigator.of(context, rootNavigator: true).push(
      CupertinoPageRoute(
        fullscreenDialog: true,
        builder: (context) => const ScannerScreen(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;

    return CupertinoPageScaffold(
      backgroundColor: palette.groupedBackground,
      child: Column(
        children: [
          Expanded(
            child: IndexedStack(
              index: _index,
              children: [
                HomeScreen(onScan: _openScanner),
                const SettingsScreen(isTab: true),
              ],
            ),
          ),
          CupertinoTabBar(
            currentIndex: _index == 0 ? 0 : 2,
            // See AppPage: translucency here costs a second backdrop blur.
            backgroundColor: palette.cardBackground,
            border: Border(
              top: BorderSide(color: palette.separator, width: 0.5),
            ),
            activeColor: palette.accent,
            inactiveColor: palette.secondaryLabel,
            onTap: (tapped) {
              // The middle item is an action, not a destination: it raises the
              // scanner and leaves the selected tab where it was.
              if (tapped == 1) {
                _openScanner();
                return;
              }
              setState(() => _index = tapped == 0 ? 0 : 1);
            },
            items: [
              BottomNavigationBarItem(
                icon: const Icon(CupertinoIcons.house),
                activeIcon: const Icon(CupertinoIcons.house_fill),
                label: l10n.tabHome,
              ),
              BottomNavigationBarItem(
                icon: const Icon(CupertinoIcons.qrcode_viewfinder),
                label: l10n.tabScan,
              ),
              BottomNavigationBarItem(
                icon: const Icon(CupertinoIcons.gear),
                activeIcon: const Icon(CupertinoIcons.gear_solid),
                label: l10n.settingsTitle,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
