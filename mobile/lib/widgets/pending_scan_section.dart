import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../models/pending_scan.dart';
import '../providers/pending_scans_provider.dart';
import '../theme/app_theme.dart';
import 'app_primitives.dart';
import '../screens/queue_screen.dart';
import 'ios/app_toast.dart';
import 'brand/illustration.dart';
import 'ios/inset_section.dart';
import 'motion/pressable.dart';
import 'motion/reveal.dart';
import '../services/stage_label.dart';

/// How many of each group Home shows before handing the rest to [QueueScreen].
///
/// This is the one collection in the app with no upper bound: the queue only
/// grows while there is no signal, and a whole shift out of range puts every
/// scan of that shift in it. Home laid all of them out in a plain Column with no
/// culling, which is the shape that actually gets heavy when there is a lot of
/// data — My Work never could, because the server caps it at a hundred.
const int kQueueInlineLimit = 5;

/// Shows scans still owed to the server: those merely waiting for a network,
/// and those the server refused, which need the preparator to decide.
///
/// The reference's "Order again" row: compact cards side by side, each with a
/// round action — here the send-again arrow. Refused scans come first and
/// carry the server's reason, because they will not resolve on their own.
class PendingScanSection extends ConsumerWidget {
  const PendingScanSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;
    final scans = ref.watch(pendingScansProvider);
    if (scans.isEmpty) return const SizedBox.shrink();

    final waiting = scans.where((scan) => !scan.hasFailed).toList();
    final failed = scans.where((scan) => scan.hasFailed).toList();

    final shown = [
      ...failed.take(kQueueInlineLimit),
      ...waiting.take(kQueueInlineLimit),
    ];
    final hasMore = shown.length < scans.length;

    Future<void> syncAll() async {
      final outcome = await ref.read(pendingScansProvider.notifier).sync();
      if (!context.mounted || outcome.synced == 0) return;
      AppToast.show(
        context,
        l10n.syncedCount(outcome.synced),
        icon: CupertinoIcons.checkmark_circle,
      );
    }

    void openQueue() => Navigator.of(
      context,
    ).push(CupertinoPageRoute(builder: (context) => const QueueScreen()));

    return Reveal(
      animation: EntranceScope.slice(context, 0.3, 0.75),
      child: Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.xl),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
              child: InsetSectionHeading(
                // The counts are always the true ones, whatever the row holds.
                text: failed.isNotEmpty
                    ? l10n.failedTitle(failed.length)
                    : l10n.pendingTitle(waiting.length),
                actionLabel: waiting.isNotEmpty
                    ? l10n.syncNow
                    : (hasMore ? l10n.seeAllPlain : null),
                onAction: waiting.isNotEmpty ? syncAll : openQueue,
              ),
            ),
            SizedBox(
              height: 92,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                physics: const BouncingScrollPhysics(),
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                itemCount: shown.length + (hasMore ? 1 : 0),
                separatorBuilder: (_, _) =>
                    const SizedBox(width: AppSpacing.md),
                itemBuilder: (context, i) {
                  if (i == shown.length) {
                    return _MoreCard(
                      label: l10n.queueSeeAll(scans.length),
                      onTap: openQueue,
                    );
                  }
                  final scan = shown[i];
                  final notifier = ref.read(pendingScansProvider.notifier);
                  return _PendingCard(
                    scan: scan,
                    onAction: scan.hasFailed
                        ? () => notifier.retry(scan.id)
                        : syncAll,
                    onDiscard: scan.hasFailed
                        ? () => notifier.discard(scan.id)
                        : null,
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg + AppSpacing.xs,
                AppSpacing.sm,
                AppSpacing.lg,
                0,
              ),
              child: Text(
                failed.isNotEmpty
                    ? l10n.failedDescription
                    : l10n.pendingDescription,
                style: AppText.caption.copyWith(color: palette.secondaryLabel),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// One queued scan as a compact card: a picture, the code, where it was headed
/// or why it stopped, and the round send-again button.
class _PendingCard extends StatelessWidget {
  const _PendingCard({
    required this.scan,
    required this.onAction,
    this.onDiscard,
  });

  final PendingScan scan;
  final VoidCallback onAction;
  final VoidCallback? onDiscard;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;
    final failed = scan.hasFailed;

    return Container(
      width: 272,
      padding: const EdgeInsets.all(AppSpacing.sm + 2),
      decoration: BoxDecoration(
        color: palette.cardBackground,
        borderRadius: BorderRadius.circular(AppRadius.lg),
      ),
      child: Row(
        children: [
          Container(
            width: 56,
            height: 56,
            padding: const EdgeInsets.all(AppSpacing.xs + 2),
            decoration: BoxDecoration(
              color: failed ? palette.danger.background : palette.blob,
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
            child: failed
                ? Icon(
                    CupertinoIcons.exclamationmark_triangle_fill,
                    size: 24,
                    color: palette.danger.foreground,
                  )
                : const Illustration(Art.emptyQueue),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SampleCodeText(scan.sampleCode, style: AppText.subhead),
                const SizedBox(height: 2),
                Text(
                  failed && scan.failureReason != null
                      ? scan.failureReason!
                      : stageLabel(l10n, scan.stageKey, scan.stageName),
                  // The server words refusals, and some run to a sentence.
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.caption.copyWith(
                    color: failed
                        ? palette.danger.foreground
                        : palette.secondaryLabel,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.xs),
          Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _RoundAction(
                icon: CupertinoIcons.arrow_clockwise,
                label: failed ? l10n.retry : l10n.syncNow,
                onTap: onAction,
              ),
              if (onDiscard != null)
                _RoundAction(
                  icon: CupertinoIcons.trash,
                  label: l10n.discard,
                  onTap: onDiscard!,
                  destructive: true,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _RoundAction extends StatelessWidget {
  const _RoundAction({
    required this.icon,
    required this.label,
    required this.onTap,
    this.destructive = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final color = destructive ? palette.danger.foreground : palette.accent;
    return Pressable(
      onTap: onTap,
      scale: 0.9,
      semanticLabel: label,
      // 36pt targets: two of these stack on one card, the same exception the
      // queue's row actions already make to the house 44.
      child: SizedBox(
        width: 36,
        height: 36,
        child: Center(
          child: Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(AppRadius.sm),
            ),
            child: Icon(icon, size: 15, color: color),
          ),
        ),
      ),
    );
  }
}

class _MoreCard extends StatelessWidget {
  const _MoreCard({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Pressable(
      onTap: onTap,
      child: Container(
        width: 132,
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: palette.cardBackground,
          borderRadius: BorderRadius.circular(AppRadius.lg),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(CupertinoIcons.arrow_right_circle_fill, color: palette.accent),
            const SizedBox(height: AppSpacing.xs),
            Text(
              label,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: AppText.caption.copyWith(
                color: palette.accent,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Retry and Discard for one refused scan.
///
/// Shared with [QueueScreen] so the two lists cannot drift apart in what they
/// let a preparator do.
Widget buildQueueActions(
  BuildContext context,
  WidgetRef ref,
  PendingScan scan,
) {
  final l10n = AppLocalizations.of(context)!;

  return Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      _RowAction(
        label: l10n.retry,
        onPressed: () => ref.read(pendingScansProvider.notifier).retry(scan.id),
      ),
      _RowAction(
        label: l10n.discard,
        isDestructive: true,
        onPressed: () =>
            ref.read(pendingScansProvider.notifier).discard(scan.id),
      ),
    ],
  );
}

/// One queued scan: the code, where it was headed, and why it stopped.
class ScanRow extends StatelessWidget {
  const ScanRow({
    super.key,
    required this.scan,
    this.actions,
    this.transparent = false,
  });

  final PendingScan scan;
  final Widget? actions;

  /// True inside [InsetSectionSliver], where the card is painted once for the
  /// whole list rather than once per row.
  final bool transparent;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;

    return InsetCustomRow(
      transparent: transparent,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SampleCodeText(scan.sampleCode),
          const SizedBox(height: 2),
          Text(
            stageLabel(l10n, scan.stageKey, scan.stageName),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppText.footnote.copyWith(color: palette.secondaryLabel),
          ),
          if (scan.failureReason != null)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: Text(
                scan.failureReason!,
                // The server words these, and some run to a full sentence.
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: AppText.footnote.copyWith(
                  color: palette.danger.foreground,
                ),
              ),
            ),
          // Beneath the code rather than beside it. Retry and Discard are rigid
          // — they never shrink — so on a narrow screen they won the space
          // fight and squeezed the one string that has to stay readable. Being
          // further apart also makes Discard harder to hit by accident.
          if (actions != null)
            Align(alignment: AlignmentDirectional.centerEnd, child: actions!),
        ],
      ),
    );
  }
}

class _RowAction extends StatelessWidget {
  const _RowAction({
    required this.label,
    required this.onPressed,
    this.isDestructive = false,
  });

  final String label;
  final VoidCallback onPressed;
  final bool isDestructive;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return CupertinoButton(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
      minimumSize: const Size(0, 36),
      onPressed: onPressed,
      child: Text(
        label,
        style: AppText.subhead.copyWith(
          color: isDestructive ? palette.danger.foreground : palette.accent,
        ),
      ),
    );
  }
}
