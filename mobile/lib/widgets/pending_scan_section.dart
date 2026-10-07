import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../models/pending_scan.dart';
import '../providers/pending_scans_provider.dart';
import '../theme/app_theme.dart';
import 'app_primitives.dart';
import '../screens/queue_screen.dart';
import 'ios/app_toast.dart';
import 'ios/inset_section.dart';
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
/// and those the server refused, which need the operator to decide.
class PendingScanSection extends ConsumerWidget {
  const PendingScanSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final scans = ref.watch(pendingScansProvider);
    if (scans.isEmpty) return const SizedBox.shrink();

    final waiting = scans.where((scan) => !scan.hasFailed).toList();
    final failed = scans.where((scan) => scan.hasFailed).toList();

    final waitingShown = waiting.take(kQueueInlineLimit).toList();
    final failedShown = failed.take(kQueueInlineLimit).toList();
    final hasMore = waiting.length > waitingShown.length ||
        failed.length > failedShown.length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (waiting.isNotEmpty)
          InsetSection(
            header: l10n.pendingTitle(waiting.length),
            footer: l10n.pendingDescription,
            children: [
              for (final scan in waitingShown) ScanRow(scan: scan),
              InsetRow(
                title: l10n.syncNow,
                titleStyle: AppText.body.copyWith(color: context.palette.accent),
                onTap: () async {
                  final outcome =
                      await ref.read(pendingScansProvider.notifier).sync();
                  if (!context.mounted || outcome.synced == 0) return;
                  AppToast.show(
                    context,
                    l10n.syncedCount(outcome.synced),
                    icon: CupertinoIcons.checkmark_circle,
                  );
                },
              ),
            ],
          ),
        if (failed.isNotEmpty)
          InsetSection(
            header: l10n.failedTitle(failed.length),
            footer: l10n.failedDescription,
            children: [
              for (final scan in failedShown)
                ScanRow(
                  scan: scan,
                  actions: buildQueueActions(context, ref, scan),
                ),
            ],
          ),
        // The counts in the headers above are always the true ones, so this row
        // is about reaching the rest rather than revealing how many there are.
        if (hasMore)
          InsetSection(
            children: [
              InsetRow(
                title: l10n.queueSeeAll(scans.length),
                titleStyle: AppText.body.copyWith(color: context.palette.accent),
                showChevron: true,
                onTap: () => Navigator.of(context).push(
                  CupertinoPageRoute(builder: (context) => const QueueScreen()),
                ),
              ),
            ],
          ),
      ],
    );
  }
}

/// Retry and Discard for one refused scan.
///
/// Shared with [QueueScreen] so the two lists cannot drift apart in what they
/// let an operator do.
Widget buildQueueActions(BuildContext context, WidgetRef ref, PendingScan scan) {
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
        onPressed: () => ref.read(pendingScansProvider.notifier).discard(scan.id),
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
                style: AppText.footnote.copyWith(color: palette.danger.foreground),
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
