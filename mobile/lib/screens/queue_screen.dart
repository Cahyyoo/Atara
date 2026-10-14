import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../providers/pending_scans_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/ios/app_page.dart';
import '../widgets/ios/inset_section.dart';
import '../widgets/pending_scan_section.dart';
import '../widgets/status_view.dart';

/// Every scan the phone still owes the server, built as it scrolls.
///
/// Home shows only the first few of each group. This matters more than the My
/// Work cap does: the queue is the one collection in the app with **no upper
/// bound at all** — `PendingScanService.add` only ever appends, and a whole
/// shift spent out of signal puts every one of those scans here. Nothing is
/// dropped to keep it small, because dropping a queued scan loses a preparator's
/// work; only the rendering is bounded.
class QueueScreen extends ConsumerWidget {
  const QueueScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final scans = ref.watch(pendingScansProvider);

    final waiting = scans.where((scan) => !scan.hasFailed).toList();
    final failed = scans.where((scan) => scan.hasFailed).toList();

    return AppPage(
      title: l10n.queueAllTitle,
      onRefresh: () => ref.read(pendingScansProvider.notifier).sync(),
      slivers: [
        // Reachable, and reached by discarding: the preparator clears the last
        // refused scan from this very screen and would otherwise be left facing
        // a blank page, unsure whether the queue emptied or the list broke.
        if (scans.isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: StatusView(
              icon: CupertinoIcons.checkmark_circle,
              tone: context.palette.success,
              title: l10n.queueEmptyTitle,
              message: l10n.queueEmptyMessage,
            ),
          ),
        if (waiting.isNotEmpty)
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.lg,
              AppSpacing.lg,
              0,
            ),
            sliver: InsetSectionSliver(
              header: l10n.pendingTitle(waiting.length),
              footer: l10n.pendingDescription,
              itemCount: waiting.length,
              itemBuilder: (context, index) =>
                  ScanRow(scan: waiting[index], transparent: true),
            ),
          ),
        if (failed.isNotEmpty)
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.lg,
              AppSpacing.lg,
              0,
            ),
            sliver: InsetSectionSliver(
              header: l10n.failedTitle(failed.length),
              footer: l10n.failedDescription,
              itemCount: failed.length,
              itemBuilder: (context, index) => ScanRow(
                scan: failed[index],
                transparent: true,
                actions: buildQueueActions(context, ref, failed[index]),
              ),
            ),
          ),
        const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.xxl)),
      ],
    );
  }
}
