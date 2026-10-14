import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../models/user_model.dart';
import '../providers/announcements_provider.dart';
import '../providers/pending_scans_provider.dart';
import '../providers/my_work_provider.dart';
import '../providers/session_provider.dart';
import '../providers/todo_provider.dart';
import '../services/sample_status_text.dart';
import '../theme/app_theme.dart';
import '../widgets/announcement_banner.dart';
import '../widgets/app_primitives.dart';
import '../widgets/ios/app_page.dart';
import '../widgets/ios/inset_section.dart';
import '../widgets/ios/ios_button.dart';
import '../widgets/manual_code_dialog.dart';
import '../widgets/my_work_section.dart';
import '../widgets/pending_scan_section.dart';
import '../widgets/todo_section.dart';
import 'update_status_screen.dart';

/// The preparator's own page: who they are, the way to a scan, and what they
/// still owe the server.
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
  /// Drives the navigation-bar indicator. Only the button sets it.
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
    final l10n = AppLocalizations.of(context)!;
    final user = ref.watch(sessionProvider).value;

    // Slivers rather than one list: My Work can hold a hundred rows, and as a
    // single list child none of them could be culled. See InsetSectionSliver.
    return AppPage(
      title: l10n.tabHome,
      automaticallyImplyLeading: false,
      onRefresh: () => _refresh(showInBar: false),
      // A pull gesture announces itself to nobody. The button is how an
      // preparator who has never been told about it finds the same thing.
      trailing: _isRefreshing
          ? const Padding(
              padding: EdgeInsets.symmetric(horizontal: AppSpacing.sm),
              child: CupertinoActivityIndicator(),
            )
          : NavBarAction(
              icon: CupertinoIcons.arrow_clockwise,
              onPressed: _refresh,
            ),
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.lg,
            AppSpacing.lg,
            0,
          ),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              // Above everything: it is the one thing on this screen that
              // might change what the preparator is about to do.
              const AnnouncementBanner(),
              if (user != null) _ProfileSection(user: user),
              AppButton(
                label: l10n.scanButton,
                icon: CupertinoIcons.qrcode_viewfinder,
                onPressed: widget.onScan,
              ),
              const SizedBox(height: AppSpacing.sm),
              // The way out when the camera is the thing that is broken. It
              // has to live here rather than inside the scanner, which in that
              // case may never render anything usable.
              AppButton(
                label: l10n.manualEntry,
                icon: CupertinoIcons.keyboard,
                style: AppButtonStyle.plain,
                onPressed: () => _openManualEntry(context),
              ),
              const SizedBox(height: AppSpacing.xl),
              const PendingScanSection(),
            ]),
          ),
        ),
        // What is waiting on the floor comes before what this preparator has
        // already done: it is the answer to "what next".
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
          sliver: const TodoSection(),
        ),
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
          sliver: const MyWorkSection(),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.xxl)),
      ],
    );
  }
}

class _ProfileSection extends StatelessWidget {
  const _ProfileSection({required this.user});

  final UserModel user;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;
    final initial = user.name.isNotEmpty ? user.name[0].toUpperCase() : '?';

    return InsetSection(
      children: [
        InsetRow(
          title: user.name,
          titleStyle: AppText.headline.copyWith(color: palette.label),
          subtitle: user.email,
          subtitleMaxLines: 1,
          padding: const EdgeInsets.all(AppSpacing.lg),
          leading: Container(
            width: 44,
            height: 44,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: palette.accent.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Text(
              initial,
              style: AppText.headline.copyWith(color: palette.accent),
            ),
          ),
          // The role used to be shown as the raw Dart enum name — PREPARATOR —
          // which is a detail of how the app is written, not a word anyone
          // chose to put in front of someone.
          trailing: AppBadge(
            label: userRoleText(l10n, user.role),
            tone: palette.neutral,
          ),
        ),
      ],
    );
  }
}

/// Collects a code by hand and opens the same screen the scanner would.
Future<void> _openManualEntry(BuildContext context) async {
  final code = await showManualCodeDialog(context);
  if (code == null || !context.mounted) return;

  await Navigator.of(context).push(
    CupertinoPageRoute(builder: (context) => UpdateStatusScreen(sampleCode: code)),
  );
}
