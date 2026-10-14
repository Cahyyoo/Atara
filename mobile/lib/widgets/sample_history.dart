import 'package:flutter/cupertino.dart';

import '../l10n/app_localizations.dart';
import '../models/sample_log_entry.dart';
import '../models/sample_model.dart';
import '../services/time_text.dart';
import '../theme/app_theme.dart';
import 'ios/app_page.dart';
import 'ios/inset_section.dart';
import '../services/stage_label.dart';

/// The last few stages a sample has been through, under its summary.
///
/// Capped on the update screen on purpose. The point of that screen is to
/// record the next stage, and a sample near the end of the workflow can carry a
/// long history — putting all of it inline would push the thing the preparator
/// came to do below the fold, and rebuild it on every tap.
class SampleHistorySection extends StatelessWidget {
  const SampleHistorySection({super.key, required this.sample, this.maxInline = 3});

  final SampleModel sample;
  final int maxInline;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;

    if (sample.logs.isEmpty) {
      return InsetSection(
        header: l10n.historyTitle,
        children: [
          InsetCustomRow(
            child: Text(
              // A sample straight off the printer genuinely has no history; one
              // read from the phone's cache has one the phone never kept. Those
              // are different facts and saying the wrong one is worse than
              // saying nothing.
              sample.isFromCache ? l10n.historyUnknownOnCache : l10n.historyEmpty,
              style: AppText.subhead.copyWith(color: palette.secondaryLabel),
            ),
          ),
        ],
      );
    }

    // Newest first: what happened last is what the preparator is checking against.
    final newestFirst = sample.logs.reversed.toList();
    final shown = newestFirst.take(maxInline).toList();

    return InsetSection(
      header: l10n.historyTitle,
      children: [
        for (final entry in shown) HistoryRow(entry: entry),
        if (newestFirst.length > shown.length)
          InsetRow(
            title: l10n.historySeeAll(newestFirst.length),
            titleStyle: AppText.body.copyWith(color: palette.accent),
            showChevron: true,
            onTap: () => Navigator.of(context).push(
              CupertinoPageRoute(
                builder: (context) => SampleHistoryScreen(sample: sample),
              ),
            ),
          ),
      ],
    );
  }
}

/// The whole history, built as it scrolls.
class SampleHistoryScreen extends StatelessWidget {
  const SampleHistoryScreen({super.key, required this.sample});

  final SampleModel sample;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final newestFirst = sample.logs.reversed.toList();

    return AppPage(
      title: l10n.historyTitle,
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.lg,
            AppSpacing.lg,
            AppSpacing.xxl,
          ),
          sliver: InsetSectionSliver(
            header: sample.sampleCode,
            itemCount: newestFirst.length,
            itemBuilder: (context, index) =>
                HistoryRow(entry: newestFirst[index], transparent: true),
          ),
        ),
      ],
    );
  }
}

/// One stage in the history: what it was, who recorded it, and anything they
/// wrote down at the time.
class HistoryRow extends StatelessWidget {
  const HistoryRow({super.key, required this.entry, this.transparent = false});

  final SampleLogEntry entry;
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
          Row(
            children: [
              Icon(
                entry.isCorrection
                    ? CupertinoIcons.arrow_uturn_left_circle
                    : CupertinoIcons.checkmark_circle,
                size: 18,
                color: entry.isCorrection
                    ? palette.warning.foreground
                    : palette.success.foreground,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  stageLabel(l10n, entry.stageKey, entry.stageName),
                  style: AppText.body.copyWith(
                    color: palette.label,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Text(
                shiftTimeText(entry.scannedAt),
                style: AppText.footnote.copyWith(color: palette.secondaryLabel),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Padding(
            padding: const EdgeInsets.only(left: 26),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.preparatorName,
                  style: AppText.footnote.copyWith(color: palette.secondaryLabel),
                ),
                // The note is the whole reason this screen exists: a preparator
                // could write one and no one could read it back from a phone.
                if (entry.notes != null && entry.notes!.trim().isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.xs),
                  if (entry.isCorrection)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 2),
                      child: Text(
                        l10n.historyCorrection.toUpperCase(),
                        style: AppText.caption.copyWith(
                          color: palette.warning.foreground,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  Text(
                    entry.notes!.trim(),
                    style: AppText.footnote.copyWith(color: palette.label),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
