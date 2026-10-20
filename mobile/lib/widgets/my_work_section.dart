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
import 'brand/illustration.dart';
import 'home/stage_chips.dart';
import 'ios/inset_section.dart';
import 'motion/pressable.dart';
import 'motion/reveal.dart';
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
/// PendingScanSection above, so between the two the picture is complete.
///
/// Laid out as the reference's two-column product grid: a card per recorded
/// stage with the stage's picture, the code, the time and a round arrow into
/// the sample. Narrowed to the stage picked in [StageChips].
class MyWorkSection extends ConsumerWidget {
  const MyWorkSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final summary = ref.watch(myWorkProvider);
    final filter = ref.watch(homeStageFilterProvider);
    final palette = context.palette;

    if (summary == null) {
      // Shaped like what is coming, not a dot in the middle of 68px of
      // nothing. The warm path seeds this from disk inside a frame or two; the
      // cold install is a real request and worth showing at once.
      return SliverMainAxisGroup(
        slivers: [MyWorkSkeleton(header: l10n.myWorkTitle)],
      );
    }

    final matching = filter == null
        ? summary.entries
        : summary.entries
              .where((e) => stageFilterId(e.stageKey, e.stageName) == filter)
              .toList();
    final shown = matching.take(kMyWorkInlineLimit).toList();

    final appear = EntranceScope.slice(context, 0.5, 1);

    // The history link is unconditional, where an old "See all" row appeared
    // only once the shift overflowed ten entries. That gate hid the way out
    // at the start of a shift, which is precisely when the question is "what
    // did I do yesterday".
    final heading = SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
        child: InsetSectionHeading(
          text: l10n.myWorkTitle,
          actionLabel: l10n.scanHistoryOpen,
          onAction: () => Navigator.of(context).push(
            CupertinoPageRoute(builder: (context) => const ScanHistoryScreen()),
          ),
        ),
      ),
    );

    if (shown.isEmpty) {
      return SliverFadeTransition(
        opacity: appear,
        sliver: SliverMainAxisGroup(
          slivers: [
            heading,
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg,
                  0,
                  AppSpacing.lg,
                  AppSpacing.xl,
                ),
                child: Container(
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  decoration: BoxDecoration(
                    color: palette.cardBackground,
                    borderRadius: BorderRadius.circular(AppRadius.lg),
                  ),
                  child: Column(
                    children: [
                      const Illustration(Art.stageAll, height: 64),
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        l10n.myWorkEmpty,
                        textAlign: TextAlign.center,
                        style: AppText.subhead.copyWith(
                          color: palette.secondaryLabel,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      );
    }

    return SliverFadeTransition(
      opacity: appear,
      sliver: SliverMainAxisGroup(
        slivers: [
          heading,
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            sliver: SliverGrid.builder(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: AppSpacing.md,
                crossAxisSpacing: AppSpacing.md,
                mainAxisExtent: 188,
              ),
              itemCount: shown.length,
              itemBuilder: (context, i) => WorkCard(entry: shown[i]),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg + AppSpacing.xs,
                AppSpacing.md,
                AppSpacing.lg,
                AppSpacing.xl,
              ),
              // `total` is counted by the server across the whole shift while
              // the list it sends is capped, so this number can exceed the
              // cards above it. Both being visible is the point.
              child: Text(
                l10n.myWorkSummary(summary.total),
                style: AppText.caption.copyWith(color: palette.secondaryLabel),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// One recorded stage as a grid card, and the way into the sample behind it.
///
/// A [WorkEntry] carries no id of any kind, so the only thing to navigate by
/// is the sample code, which is all [UpdateStatusScreen] needs.
class WorkCard extends StatelessWidget {
  const WorkCard({super.key, required this.entry});

  final WorkEntry entry;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;

    return Pressable(
      onTap: () => Navigator.of(context).push(
        CupertinoPageRoute(
          builder: (context) =>
              UpdateStatusScreen(sampleCode: entry.sampleCode),
        ),
      ),
      child: Container(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.md,
          AppSpacing.md,
          AppSpacing.md,
          AppSpacing.sm + 2,
        ),
        decoration: BoxDecoration(
          color: palette.cardBackground,
          borderRadius: BorderRadius.circular(AppRadius.lg),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              stageLabel(l10n, entry.stageKey, entry.stageName),
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppText.subhead.copyWith(
                color: palette.label,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 2),
            Center(
              child: SampleCodeText(
                entry.sampleCode,
                style: AppText.caption.copyWith(color: palette.secondaryLabel),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                child: Illustration(Art.forStage(entry.stageKey)),
              ),
            ),
            Row(
              children: [
                Icon(
                  entry.isCorrection
                      ? CupertinoIcons.arrow_uturn_left
                      : CupertinoIcons.checkmark_seal_fill,
                  size: 13,
                  color: entry.isCorrection
                      ? palette.warning.foreground
                      : palette.success.foreground,
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    entry.isCorrection
                        ? l10n.historyCorrection
                        : shiftTimeText(entry.scannedAt),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.caption.copyWith(
                      color: palette.secondaryLabel,
                    ),
                  ),
                ),
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    gradient: palette.primaryGradient,
                    borderRadius: BorderRadius.circular(AppRadius.sm),
                  ),
                  child: Icon(
                    CupertinoIcons.arrow_right,
                    size: 15,
                    color: palette.onAccent,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
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
