import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../providers/pending_scans_provider.dart';
import '../providers/stages_provider.dart';
import '../theme/app_motion.dart';
import '../theme/app_theme.dart';
import '../widgets/motion/gate_transition.dart';
import '../widgets/motion/reveal.dart';
import 'home_screen.dart';
import 'queue_screen.dart';
import 'scan_history_screen.dart';
import 'scanner_screen.dart';
import 'settings_screen.dart';
import 'splash_screen.dart';

/// The signed-in app: four destinations and the scanner, under the
/// reference's five-item bar.
///
/// Scan sits in the middle as an action, not a destination: it raises the
/// scanner over everything and leaves the selected tab where it was.
///
/// The shell also owns Home's entrance. Coming from the sign-in screen it
/// waits for the login header to hand over, then plays chips, header, banner,
/// sections and finally this bar rising from the bottom, as the reference does.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

/// The bar's slots. [scan] is the action in the middle.
enum _Tab { home, history, scan, queue, settings }

class _HomeShellState extends ConsumerState<HomeShell>
    with SingleTickerProviderStateMixin {
  _Tab _tab = _Tab.home;

  /// Tabs are built the first time they are opened, not all at launch: the
  /// history tab fetches a page of scans as soon as it exists, and nobody
  /// asked for that by opening the app.
  final Set<_Tab> _visited = {_Tab.home};

  late final AnimationController _enter = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
    animationBehavior: AnimationBehavior.preserve,
  );

  Animation<double>? _gate;

  @override
  void initState() {
    super.initState();
    // The stage list never changes during a shift and every scan needs it, so
    // fetch it while the preparator is still looking at Home rather than making
    // the first scan of the day wait for it.
    ref.read(stagesProvider);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _maybeEnter();
  }

  /// Starts the entrance at the right moment, once.
  void _maybeEnter() {
    if (_enter.status != AnimationStatus.dismissed || _gate != null) return;
    // Under the splash on a cold start: wait for it to leave, whatever else
    // is happening underneath. This method runs again when it does, because
    // SplashStatus is depended on here.
    if (!SplashStatus.isDone(context)) return;
    final gate = GateTransition.maybeOf(context)?.animation;
    if (gate != null && gate.status == AnimationStatus.forward) {
      // Arriving from another screen: wait for the handover.
      _gate = gate..addListener(_onGate);
      _onGate();
      return;
    }
    _enter.forward();
  }

  void _onGate() {
    final gate = _gate;
    if (gate == null) return;
    if (gate.value >= GateTransition.handover ||
        gate.status == AnimationStatus.completed) {
      gate.removeListener(_onGate);
      if (mounted) _enter.forward();
    }
  }

  @override
  void dispose() {
    _gate?.removeListener(_onGate);
    _enter.dispose();
    super.dispose();
  }

  Future<void> _openScanner() async {
    await Navigator.of(context, rootNavigator: true).push(
      CupertinoPageRoute(
        fullscreenDialog: true,
        builder: (context) => const ScannerScreen(),
      ),
    );
  }

  void _select(_Tab tab) {
    if (tab == _Tab.scan) {
      _openScanner();
      return;
    }
    setState(() {
      _tab = tab;
      _visited.add(tab);
    });
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    const stack = [_Tab.home, _Tab.history, _Tab.queue, _Tab.settings];

    Widget page(_Tab tab) {
      if (!_visited.contains(tab)) return const SizedBox.shrink();
      return switch (tab) {
        _Tab.home => HomeScreen(onScan: _openScanner),
        _Tab.history => const ScanHistoryScreen(isTab: true),
        _Tab.queue => const QueueScreen(isTab: true),
        _Tab.settings => const SettingsScreen(isTab: true),
        _Tab.scan => const SizedBox.shrink(),
      };
    }

    return EntranceScope(
      animation: _enter,
      child: CupertinoPageScaffold(
        backgroundColor: palette.groupedBackground,
        child: Column(
          children: [
            Expanded(
              child: IndexedStack(
                index: stack.indexOf(_tab),
                children: [for (final tab in stack) page(tab)],
              ),
            ),
            Reveal(
              animation: CurvedAnimation(
                parent: _enter,
                curve: const Interval(0.45, 0.9, curve: AppMotion.enter),
              ),
              offset: const Offset(0, 90),
              child: _TabBar(selected: _tab, onSelect: _select),
            ),
          ],
        ),
      ),
    );
  }
}

/// The reference's bottom bar: white, five equal slots, the current one a
/// filled green icon over a green label, the rest outlined grey.
class _TabBar extends ConsumerWidget {
  const _TabBar({required this.selected, required this.onSelect});

  final _Tab selected;
  final ValueChanged<_Tab> onSelect;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;
    final queued = ref.watch(pendingScansProvider).length;

    Widget item(
      _Tab tab,
      IconData icon,
      IconData activeIcon,
      String label, {
      int badge = 0,
    }) {
      return Expanded(
        child: _TabItem(
          icon: icon,
          activeIcon: activeIcon,
          label: label,
          active: tab == selected,
          badge: badge,
          onTap: () => onSelect(tab),
        ),
      );
    }

    return DecoratedBox(
      decoration: BoxDecoration(
        color: palette.cardBackground,
        border: Border(top: BorderSide(color: palette.separator, width: 0.5)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 60,
          child: Row(
            children: [
              item(
                _Tab.home,
                CupertinoIcons.house,
                CupertinoIcons.house_fill,
                l10n.tabHome,
              ),
              item(
                _Tab.history,
                CupertinoIcons.clock,
                CupertinoIcons.clock_fill,
                l10n.tabHistory,
              ),
              item(
                _Tab.scan,
                CupertinoIcons.qrcode_viewfinder,
                CupertinoIcons.qrcode_viewfinder,
                l10n.tabScan,
              ),
              item(
                _Tab.queue,
                CupertinoIcons.tray,
                CupertinoIcons.tray_fill,
                l10n.tabQueue,
                badge: queued,
              ),
              item(
                _Tab.settings,
                CupertinoIcons.gear,
                CupertinoIcons.gear_solid,
                l10n.tabSettings,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TabItem extends StatelessWidget {
  const _TabItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.active,
    required this.onTap,
    this.badge = 0,
  });

  final IconData icon;
  final IconData activeIcon;
  final String label;
  final bool active;
  final VoidCallback onTap;
  final int badge;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final color = active ? palette.accent : palette.secondaryLabel;

    return Semantics(
      button: true,
      selected: active,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                AnimatedSwitcher(
                  duration: AppMotion.fast,
                  transitionBuilder: (child, animation) => ScaleTransition(
                    scale: Tween<double>(begin: 0.8, end: 1).animate(animation),
                    child: FadeTransition(opacity: animation, child: child),
                  ),
                  child: Icon(
                    active ? activeIcon : icon,
                    key: ValueKey(active),
                    size: 24,
                    color: color,
                  ),
                ),
                if (badge > 0)
                  Positioned(
                    top: -4,
                    right: -10,
                    child: Container(
                      constraints: const BoxConstraints(minWidth: 18),
                      height: 18,
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: palette.danger.foreground,
                        borderRadius: BorderRadius.circular(AppRadius.pill),
                        border: Border.all(
                          color: palette.cardBackground,
                          width: 2,
                        ),
                      ),
                      child: Text(
                        badge > 99 ? '99+' : '$badge',
                        style: AppText.caption.copyWith(
                          fontSize: 9.5,
                          height: 1,
                          fontWeight: FontWeight.w700,
                          color: const Color(0xFFFFFFFF),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 3),
            AnimatedDefaultTextStyle(
              duration: AppMotion.fast,
              style: AppText.caption.copyWith(
                fontSize: 11,
                color: color,
                fontWeight: active ? FontWeight.w700 : FontWeight.w500,
              ),
              child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
          ],
        ),
      ),
    );
  }
}
