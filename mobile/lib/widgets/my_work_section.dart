import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../models/work_summary.dart';
import '../providers/my_work_provider.dart';
import '../screens/scan_history_screen.dart';
import '../screens/update_status_screen.dart';
import '../services/time_text.dart';
import '../theme/app_theme.dart';
import 'skeletons.dart';
import 'app_primitives.dart';
import 'ios/inset_section.dart';
import '../services/stage_label.dart';

/// How many entries Home shows before handing the rest to [MyWorkScreen].
///
/// The server sends up to a hundred, and rendering all of them on the screen an
/// preparator opens most often is work for nothing: the ones that matter are the
/// ones just recorded. The rest are one tap away.
const int kMyWorkInlineLimit = 10;

/// What this preparator has recorded during the current shift, as the server has
/// it — so it survives a reinstall and covers work done from another phone.
///
/// Only sent work appears here. Anything still queued is shown by
/// PendingScanSection just above, so between the two the picture is complete.
class MyWorkSection extends ConsumerWidget {
  const MyWorkSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final summary = ref.watch(myWorkProvider);
    final palette = context.palette;

    if (summary == null) {
      // Shaped like what is coming, not a dot in the middle of 68px of
      // nothing. The warm path seeds this from disk inside a frame or two, so
      // LoadingSwap usually swallows it entirely; the flag marks the cold
      // install, where it is a real request and worth showing at once.
      // No LoadingSwap: `isLoading` could only ever be the literal true here,
      // so it never transitioned and never held -- it just built a Stack and a
      // FadeTransition around a placeholder that was already correct.
      return SliverMainAxisGroup(
        slivers: [MyWorkSkeleton(header: l10n.myWorkTitle)],
      );
    }

    if (summary.entries.isEmpty) {
      return SliverToBoxAdapter(
        child: InsetSection(
          header: l10n.myWorkTitle,
          children: [
            InsetCustomRow(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.lg,
                vertical: AppSpacing.xl,
              ),
              child: Center(
                child: Text(
                  l10n.myWorkEmpty,
                  style: AppText.subhead.copyWith(
                    color: palette.secondaryLabel,
                  ),
                ),
              ),
            ),
            _HistoryRow(),
          ],
        ),
      );
    }

    final shown = summary.entries.take(kMyWorkInlineLimit).toList();

    // The tallies lead, then the recent rows, then the way to the rest.
    //
    // The history row is unconditional, where the old "See all" row appeared
    // only once the shift overflowed ten entries. That gate hid the way out
    // at the start of a shift, which is precisely when the question is "what
    // did I do yesterday".
    final hasTallies = summary.byStage.isNotEmpty;
    final leading = hasTallies ? 1 : 0;
    final rowCount = leading + shown.length + 1;

    return InsetSectionSliver(
      header: l10n.myWorkTitle,
      // `total` is counted by the server across the whole shift while the list
      // it sends is capped, so this number can exceed the rows above it. Both
      // being visible is the point: this many recorded, this many kept to look
      // at.
      footer: l10n.myWorkSummary(summary.total),
      itemCount: rowCount,
      itemBuilder: (context, index) {
        if (hasTallies && index == 0) {
          return InsetCustomRow(
            transparent: true,
            child: _StageTallies(byStage: summary.byStage),
          );
        }

        final entryIndex = index - leading;
        if (entryIndex < shown.length) {
          return WorkRow(entry: shown[entryIndex]);
        }

        return _HistoryRow();
      },
    );
  }
}

/// The way off this card and into every shift before this one.
///
/// It replaced a "See all (N)" row that opened a screen showing the same
/// entries again under a different title. The history screen's first group is
/// this card, with "Today" above it — two near-identical screens meant an
/// preparator had to guess which one held their week.
class _HistoryRow extends StatelessWidget {
  const _HistoryRow();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return InsetRow(
      title: l10n.scanHistoryOpen,
      titleStyle: AppText.body.copyWith(color: context.palette.accent),
      showChevron: true,
      onTap: () => Navigator.of(context).push(
        CupertinoPageRoute(builder: (context) => const ScanHistoryScreen()),
      ),
    );
  }
}

/// How the shift breaks down by stage, as a row of counted capsules.
class _StageTallies extends StatelessWidget {
  const _StageTallies({required this.byStage});

  final List<StageTally> byStage;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;
    final tone = palette.neutral;

    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      children: [
        for (final tally in byStage)
          AppBadge(
            label:
                '${stageLabel(l10n, tally.stageKey, tally.stageName)}  ${tally.count}',
            tone: tone,
          ),
      ],
    );
  }
}

/// One recorded stage, and the way into the sample behind it.
///
/// These rows used to be inert: a preparator could see that they had recorded a
/// stage but had no way to look at what they had recorded — who else had moved
/// the sample, when, or what anyone wrote down. A [WorkEntry] carries four
/// fields and no id of any kind, so the only thing to navigate by is the sample
/// code, which is all [UpdateStatusScreen] needs.
class WorkRow extends StatefulWidget {
  const WorkRow({super.key, required this.entry, this.tintRadius});

  final WorkEntry entry;

  /// The corner the press tint has to respect.
  ///
  /// On Home the card is painted once for the whole section, so a square tint
  /// never reaches a corner and this stays null. On the history list every row
  /// carries its own slice of the card, and the first and last of each day are
  /// rounded — a square tint there would spill over the curve.
  final BorderRadius? tintRadius;

  @override
  State<WorkRow> createState() => _WorkRowState();
}

class _WorkRowState extends State<WorkRow> {
  /// A notifier rather than a field, so a press repaints one box instead of
  /// rebuilding the row.
  ///
  /// setState here rebuilt the whole ~26-widget subtree — five TextStyle
  /// merges, two Icons, five RenderParagraph span comparisons — to change one
  /// colour. And it fired while SCROLLING, not only on taps: hold a finger
  /// still for kPressTimeout before dragging and the sequence is onTapDown →
  /// rebuild → onTapCancel → rebuild, so every slow drag start paid two full
  /// row rebuilds. A long list is scrolled in flicks, so that was once per
  /// flick, for as long as the preparator kept going.
  ///
  /// The content is built in build() and handed to ValueListenableBuilder as
  /// its `child`, which is the part that does the work: `child` is passed
  /// straight through to the builder and is never rebuilt when the value
  /// changes. An outer rebuild — a page landing, a theme or locale change —
  /// still rebuilds everything, exactly as before.
  final ValueNotifier<bool> _isPressed = ValueNotifier<bool>(false);

  @override
  void dispose() {
    // Load-bearing, not boilerplate. The history list sets
    // addAutomaticKeepAlives: false, so rows are unmounted continuously while
    // scrolling — an undisposed notifier per row would be a steady leak on
    // precisely the screen this exists for.
    _isPressed.dispose();
    super.dispose();
  }

  void _open() {
    Navigator.of(context).push(
      CupertinoPageRoute(
        builder: (context) =>
            UpdateStatusScreen(sampleCode: widget.entry.sampleCode),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;
    final entry = widget.entry;

    final content = InsetCustomRow(
      transparent: true,
      child: Row(
        children: [
          Icon(
            entry.isCorrection
                ? CupertinoIcons.arrow_uturn_left_circle
                : CupertinoIcons.checkmark_circle,
            size: 20,
            color: entry.isCorrection
                ? palette.warning.foreground
                : palette.success.foreground,
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SampleCodeText(entry.sampleCode, style: AppText.subhead),
                const SizedBox(height: 2),
                Text(
                  stageLabel(l10n, entry.stageKey, entry.stageName),
                  style: AppText.footnote.copyWith(
                    color: palette.secondaryLabel,
                  ),
                ),
              ],
            ),
          ),
          Text(
            shiftTimeText(entry.scannedAt),
            style: AppText.footnote.copyWith(color: palette.secondaryLabel),
          ),
          const SizedBox(width: AppSpacing.xs),
          Icon(
            CupertinoIcons.chevron_forward,
            size: 16,
            color: palette.tertiaryLabel,
          ),
        ],
      ),
    );

    // The same press tint InsetRow uses, so a tappable row answers a touch the
    // same way everywhere. The card behind this list is painted by the sliver,
    // hence the transparent row and the explicit fill here.
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: _open,
      onTapDown: (_) => _isPressed.value = true,
      onTapUp: (_) => _isPressed.value = false,
      onTapCancel: () => _isPressed.value = false,
      child: ValueListenableBuilder<bool>(
        valueListenable: _isPressed,
        // Read inside the builder so both call sites keep their behaviour:
        // Home passes no radius, the history list passes the day card's.
        // `palette` is captured from the build above, so a theme change makes a
        // new closure and the tint colour cannot go stale.
        child: content,
        builder: (context, isPressed, child) => DecoratedBox(
          decoration: BoxDecoration(
            color: isPressed ? palette.fill : const Color(0x00000000),
            borderRadius: widget.tintRadius,
          ),
          child: child,
        ),
      ),
    );
  }
}
