import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/announcements_provider.dart';
import '../providers/pending_scans_provider.dart';
import '../providers/my_work_provider.dart';
import '../providers/session_provider.dart';
import '../providers/todo_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/announcement_banner.dart';
import '../widgets/home/home_header.dart';
import '../widgets/home/stage_chips.dart';
import '../widgets/manual_code_dialog.dart';
import '../widgets/my_work_section.dart';
import '../widgets/pending_scan_section.dart';
import '../widgets/todo_section.dart';
import 'update_status_screen.dart';

/// The preparator's own page, laid out as the redesign reference's home: a
/// green header with who is signed in and a banner leading to a scan, the
/// stages as a row of picture tiles, then what is owed, what is waiting, and
/// what this shift has already done.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key, required this.onScan});

  /// Raising the scanner is the shell's job — it presents it over the tab bar
  /// rather than inside a tab, so the camera is not kept alive in the
  /// background. See `HomeShell`.
  final VoidCallback onScan;

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  /// Drives the header's refresh indicator. Only the button sets it.
  bool _isRefreshing = false;

  /// Guards re-entry for both ways in. Separate from [_isRefreshing], which
  /// the pull gesture deliberately leaves alone -- tying the guard to the
  /// indicator would have let a pull start a second refresh on top of the
  /// first.
  bool _isBusy = false;

  /// One path for both ways in — the pull gesture and the button.
  ///
  /// [showInBar] is false for the pull, because the refresh control is already
  /// saying the same thing an inch above: two indicators running at once for
  /// one refresh reads as two things happening.
  Future<void> _refresh({bool showInBar = true}) async {
    if (_isBusy) return;
    _isBusy = true;
    if (showInBar) setState(() => _isRefreshing = true);
    try {
      // Together, not one after the other: the spinner used to stay down for
      // the sum of a round trip and a whole queue drain.
      await Future.wait([
        ref.read(myWorkProvider.notifier).refresh(),
        ref.read(pendingScansProvider.notifier).sync(),
        // Along with the rest: a notice posted mid-shift should arrive on the
        // same pull that fetches the tally, not at the next sign-in.
        ref.read(announcementsProvider.notifier).refresh(),
        ref.read(todoProvider.notifier).refresh(),
      ]);
    } finally {
      _isBusy = false;
      if (mounted && showInBar) setState(() => _isRefreshing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final user = ref.watch(sessionProvider).value;
    final top = MediaQuery.paddingOf(context).top;

    // Slivers rather than one list: the sections below can be long, and as a
    // single list child none of them could be culled.
    return CupertinoPageScaffold(
      backgroundColor: palette.groupedBackground,
      child: CustomScrollView(
        // Without this, pull-to-refresh on Android does nothing at all: the
        // Material host hands Android clamping physics, which refuses to
        // overscroll, and AlwaysScrollable keeps a short Home draggable at the
        // start of a shift.
        physics: const BouncingScrollPhysics(
          parent: AlwaysScrollableScrollPhysics(),
        ),
        slivers: [
          SliverPersistentHeader(
            pinned: true,
            delegate: HomeHeaderDelegate(
              topInset: top,
              bar: HomeTopBar(
                user: user,
                isRefreshing: _isRefreshing,
                onRefresh: _refresh,
              ),
              banner: ScanBanner(
                onScan: widget.onScan,
                onManual: () => _openManualEntry(context),
              ),
            ),
          ),
          CupertinoSliverRefreshControl(
            onRefresh: () => _refresh(showInBar: false),
          ),
          // Above everything else: it is the one thing on this screen that
          // might change what the preparator is about to do.
          const SliverPadding(
            padding: EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.xs,
              AppSpacing.lg,
              0,
            ),
            sliver: SliverToBoxAdapter(child: AnnouncementBanner()),
          ),
          const SliverToBoxAdapter(child: StageChips()),
          const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.xl)),
          const SliverToBoxAdapter(child: PendingScanSection()),
          // What is waiting on the floor comes before what this preparator has
          // already done: it is the answer to "what next".
          const TodoSection(),
          const MyWorkSection(),
          const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.lg)),
        ],
      ),
    );
  }
}

/// Collects a code by hand and opens the same screen the scanner would.
Future<void> _openManualEntry(BuildContext context) async {
  final code = await showManualCodeDialog(context);
  if (code == null || !context.mounted) return;

  await Navigator.of(context).push(
    CupertinoPageRoute(
      builder: (context) => UpdateStatusScreen(sampleCode: code),
    ),
  );
}
