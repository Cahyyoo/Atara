import 'package:flutter/widgets.dart';

import '../theme/app_theme.dart';
import 'ios/inset_section.dart';
import 'skeleton.dart';

/// The stand-ins, each laid out to the measurements of the thing it stands in
/// for, so nothing jumps when the data lands.
///
/// Every one of these builds inside a real [InsetSection] or
/// [InsetSectionSliver]: that is what paints the card the grey has to sit on,
/// and it brings the right radius and clipping with it. A skeleton on the
/// page's own ground would be 1.07:1 in light — there, but not visible.
///
/// The row counts are deliberately short of what a full screen holds. Four
/// rows fill the fold; ten would promise a list the preparator may not have.

/// A work row: leading glyph, a code over a stage line, a time on the right.
/// Matches `WorkRow` at 64 high.
class WorkRowSkeleton extends StatelessWidget {
  const WorkRowSkeleton({super.key, this.width = 130});

  final double width;

  @override
  Widget build(BuildContext context) {
    return InsetCustomRow(
      transparent: true,
      child: Row(
        children: [
          const SkeletonCircle(size: 20),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                SkeletonBar(width: width, height: 18),
                const SizedBox(height: 2),
                const SkeletonBar(width: 90),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          const SkeletonBar(width: 38),
        ],
      ),
    );
  }
}

/// The stage tallies: a wrap of badge-sized capsules.
class TallyWrapSkeleton extends StatelessWidget {
  const TallyWrapSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return const InsetCustomRow(
      transparent: true,
      child: Wrap(
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.sm,
        children: [
          SkeletonBadge(width: 64),
          SkeletonBadge(width: 78),
          SkeletonBadge(width: 70),
          SkeletonBadge(width: 86),
          SkeletonBadge(width: 58),
        ],
      ),
    );
  }
}

/// My Work, whole section: tallies then four rows. Stands in for a card that
/// is otherwise 68px tall while loading and ~813px once it lands.
class MyWorkSkeleton extends StatelessWidget {
  const MyWorkSkeleton({
    super.key,
    this.header,
    this.rows = 4,
    this.showTallies = true,
  });

  final String? header;
  final int rows;

  /// False on the history screen, which has no stage-tally row to stand in for.
  final bool showTallies;

  @override
  Widget build(BuildContext context) {
    return InsetSectionSliver(
      header: header,
      itemCount: showTallies ? rows + 1 : rows,
      itemBuilder: (context, index) => showTallies && index == 0
          ? const TallyWrapSkeleton()
          // Ragged widths: every code the same length reads as a rendering
          // artefact rather than as content on its way.
          : WorkRowSkeleton(width: [130.0, 118.0, 136.0, 124.0][index % 4]),
    );
  }
}

/// A title-over-subtitle row with a leading mark — the stage picker's shape,
/// and `HistoryRow`'s. 66 high.
class DetailRowSkeleton extends StatelessWidget {
  const DetailRowSkeleton({
    super.key,
    this.leadingSize = 26,
    this.titleWidth = 110,
    this.subtitleWidth = 200,
    this.transparent = false,
  });

  final double leadingSize;
  final double titleWidth;
  final double subtitleWidth;
  final bool transparent;

  @override
  Widget build(BuildContext context) {
    return InsetCustomRow(
      transparent: transparent,
      child: Row(
        children: [
          SkeletonCircle(size: leadingSize),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                SkeletonBar(width: titleWidth, height: 18),
                const SizedBox(height: 2),
                SkeletonBar(width: subtitleWidth),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// The stage picker: five rows, each a numbered mark with a name and a
/// description. The closest match of any skeleton here.
class StagePickerSkeleton extends StatelessWidget {
  const StagePickerSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return const InsetSection(
      children: [
        DetailRowSkeleton(titleWidth: 96, subtitleWidth: 210),
        DetailRowSkeleton(titleWidth: 118, subtitleWidth: 186),
        DetailRowSkeleton(titleWidth: 104, subtitleWidth: 204),
        DetailRowSkeleton(titleWidth: 92, subtitleWidth: 172),
        DetailRowSkeleton(titleWidth: 110, subtitleWidth: 196),
      ],
    );
  }
}

/// `SampleSummaryCard`: a large code with a badge beside it, then two rows.
class SampleSummarySkeleton extends StatelessWidget {
  const SampleSummarySkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return const InsetSection(
      children: [
        InsetCustomRow(
          padding: EdgeInsets.all(AppSpacing.lg),
          child: Row(
            children: [
              Expanded(child: SkeletonBar(width: 180, height: 28)),
              SizedBox(width: AppSpacing.sm),
              SkeletonBadge(width: 74),
            ],
          ),
        ),
        DetailRowSkeleton(leadingSize: 18, titleWidth: 150, subtitleWidth: 0),
        DetailRowSkeleton(leadingSize: 18, titleWidth: 168, subtitleWidth: 0),
      ],
    );
  }
}

/// Sample detail while the server is asked: the summary card, then history.
class SampleDetailSkeleton extends StatelessWidget {
  const SampleDetailSkeleton({super.key, this.historyHeader});

  final String? historyHeader;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.lg,
        AppSpacing.lg,
        AppSpacing.xxl,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SampleSummarySkeleton(),
          InsetSection(
            header: historyHeader,
            children: const [
              DetailRowSkeleton(leadingSize: 20, titleWidth: 124, subtitleWidth: 160),
              DetailRowSkeleton(leadingSize: 20, titleWidth: 108, subtitleWidth: 188),
              DetailRowSkeleton(leadingSize: 20, titleWidth: 132, subtitleWidth: 146),
              DetailRowSkeleton(leadingSize: 20, titleWidth: 116, subtitleWidth: 174),
            ],
          ),
        ],
      ),
    );
  }
}

/// Settings, which is a pure preferences read and so nearly always resolves
/// before [LoadingSwap] would even reveal this. It exists for the launch where
/// the platform channel is slow, and it keeps the large title in place — the
/// old whole-screen spinner took the title with it.
class SettingsSkeleton extends StatelessWidget {
  const SettingsSkeleton({super.key, this.showAccount = false});

  final bool showAccount;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const InsetSection(
          children: [
            InsetCustomRow(
              padding: EdgeInsets.symmetric(
                horizontal: AppSpacing.lg,
                vertical: 15,
              ),
              child: SkeletonBar(width: 220, height: 22),
            ),
            InsetCustomRow(child: SkeletonBar(width: 56, height: 22)),
            InsetCustomRow(child: SkeletonBar(width: 132, height: 22)),
          ],
        ),
        const InsetSection(
          children: [
            InsetCustomRow(child: SkeletonBar(width: 110, height: 22)),
            InsetCustomRow(child: SkeletonBar(width: 74, height: 22)),
            InsetCustomRow(child: SkeletonBar(width: 62, height: 22)),
          ],
        ),
        const InsetSection(
          children: [
            InsetCustomRow(child: SkeletonBar(width: 128, height: 22)),
            InsetCustomRow(child: SkeletonBar(width: 88, height: 22)),
          ],
        ),
        if (showAccount)
          const InsetSection(
            children: [
              InsetCustomRow(child: SkeletonBar(width: 64, height: 22)),
            ],
          ),
      ],
    );
  }
}
