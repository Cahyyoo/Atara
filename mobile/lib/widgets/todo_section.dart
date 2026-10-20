import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../models/stage_board.dart';
import '../providers/todo_provider.dart';
import '../screens/todo_stage_screen.dart';
import '../services/stage_label.dart';
import '../theme/app_theme.dart';
import 'brand/illustration.dart';
import 'home/stage_chips.dart';
import 'ios/inset_section.dart';
import 'motion/pressable.dart';
import 'motion/reveal.dart';
import 'skeletons.dart';

/// Home's to-do: each stage with samples sitting in it, how many, and how many
/// have waited past the SLA. A card opens that stage's samples.
///
/// One row in the reference's shapes. Stages with anything overdue lead, as
/// dark "deal" cards with the overdue count large — it is the answer to "what
/// first". The other waiting stages follow as picture cards. Each count is said
/// once. Narrowed to the stage picked in [StageChips].
class TodoSection extends ConsumerWidget {
  const TodoSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final board = ref.watch(todoProvider);
    final filter = ref.watch(homeStageFilterProvider);
    final palette = context.palette;

    if (board == null) {
      return SliverMainAxisGroup(
        slivers: [
          MyWorkSkeleton(header: l10n.todoTitle, rows: 3, showTallies: false),
        ],
      );
    }

    final waiting = board.waiting
        .where(
          (c) =>
              filter == null ||
              stageFilterId(c.stageKey, c.stageName ?? '') == filter,
        )
        .toList();
    // Overdue first, most overdue first; the rest keep the stage order.
    final ordered = [
      ...waiting.where((c) => c.overdue > 0).toList()
        ..sort((a, b) => b.overdue.compareTo(a.overdue)),
      ...waiting.where((c) => c.overdue == 0),
    ];

    final appear = EntranceScope.slice(context, 0.35, 0.85);

    if (waiting.isEmpty) {
      return SliverToBoxAdapter(
        child: Reveal(
          animation: appear,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            child: InsetSection(
              header: l10n.todoTitle,
              children: [
                InsetCustomRow(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.lg,
                    vertical: AppSpacing.lg,
                  ),
                  child: Column(
                    children: [
                      const Illustration(Art.emptyDone, height: 88),
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        l10n.todoEmpty,
                        textAlign: TextAlign.center,
                        style: AppText.subhead.copyWith(
                          color: palette.secondaryLabel,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return SliverToBoxAdapter(
      child: Reveal(
        animation: appear,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _Heading(text: l10n.todoTitle),
            SizedBox(
              height: 196,
              child: _HorizontalCards(
                count: ordered.length,
                builder: (i) => ordered[i].overdue > 0
                    ? _AttentionCard(column: ordered[i])
                    : _StageCard(column: ordered[i]),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg + AppSpacing.xs,
                AppSpacing.sm,
                AppSpacing.lg,
                AppSpacing.xl,
              ),
              child: Text(
                l10n.todoFooter,
                style: AppText.caption.copyWith(color: palette.secondaryLabel),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

void _openStage(BuildContext context, BoardColumn column, String name) {
  Navigator.of(context).push(
    CupertinoPageRoute(
      builder: (context) => TodoStageScreen(columnId: column.id, title: name),
    ),
  );
}

class _Heading extends StatelessWidget {
  const _Heading({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
    child: InsetSectionHeading(text: text),
  );
}

class _HorizontalCards extends StatelessWidget {
  const _HorizontalCards({required this.count, required this.builder});

  final int count;
  final Widget Function(int) builder;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      scrollDirection: Axis.horizontal,
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
      itemCount: count,
      separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.md),
      itemBuilder: (context, i) => builder(i),
    );
  }
}

/// A stage with samples past the SLA, as the reference's dark deal card.
class _AttentionCard extends StatelessWidget {
  const _AttentionCard({required this.column});

  final BoardColumn column;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;
    final name = stageLabel(l10n, column.stageKey, column.stageName ?? '');
    const white = Color(0xFFFFFFFF);

    return Pressable(
      onTap: () => _openStage(context, column, name),
      child: Container(
        width: 248,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppRadius.lg),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF1C2311), Color(0xFF34431C)],
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          children: [
            Positioned(
              right: -12,
              bottom: -10,
              child: Opacity(
                opacity: 0.9,
                child: Illustration(Art.forStage(column.stageKey), width: 112),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.md + 2),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name.toUpperCase(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.caption.copyWith(
                      color: white.withValues(alpha: 0.75),
                      letterSpacing: 0.6,
                      fontSize: 10,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    l10n.todoOverdue(column.overdue),
                    style: AppText.title2.copyWith(color: white, fontSize: 22),
                  ),
                  const Spacer(),
                  // A Wrap, not a Row: two pills of translated text do not
                  // always fit side by side on a 248pt card at a large type
                  // size, and the second can take the next line instead.
                  Wrap(
                    spacing: AppSpacing.xs + 2,
                    runSpacing: AppSpacing.xs + 2,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.sm,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: white.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(AppRadius.pill),
                        ),
                        child: Text(
                          l10n.todoCount(column.count),
                          style: AppText.caption.copyWith(
                            color: white,
                            fontWeight: FontWeight.w700,
                            fontSize: 11,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.sm + 2,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: palette.lime,
                          borderRadius: BorderRadius.circular(AppRadius.pill),
                        ),
                        child: Text(
                          l10n.seeAllPlain,
                          style: AppText.caption.copyWith(
                            color: const Color(0xFF1C2311),
                            fontWeight: FontWeight.w700,
                            fontSize: 11,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A waiting stage, as the reference's restaurant card: a tinted picture
/// panel with the count on a badge, then the name and the way in.
class _StageCard extends StatelessWidget {
  const _StageCard({required this.column});

  final BoardColumn column;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;
    final name = stageLabel(l10n, column.stageKey, column.stageName ?? '');
    return Pressable(
      onTap: () => _openStage(context, column, name),
      child: Container(
        width: 184,
        padding: const EdgeInsets.all(AppSpacing.sm),
        decoration: BoxDecoration(
          color: palette.cardBackground,
          borderRadius: BorderRadius.circular(AppRadius.lg),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  color: palette.blob.withValues(
                    alpha: context.isDark ? 1 : 0.7,
                  ),
                  borderRadius: BorderRadius.circular(AppRadius.md),
                ),
                child: Stack(
                  children: [
                    Center(
                      child: Padding(
                        padding: const EdgeInsets.only(top: AppSpacing.md),
                        child: Illustration(
                          Art.forStage(column.stageKey),
                          height: 72,
                        ),
                      ),
                    ),
                    Positioned(
                      top: AppSpacing.sm,
                      left: AppSpacing.sm,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.sm,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: palette.cardBackground,
                          borderRadius: BorderRadius.circular(AppRadius.pill),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              CupertinoIcons.tray_full_fill,
                              size: 12,
                              color: palette.accent,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              l10n.todoCount(column.count),
                              style: AppText.caption.copyWith(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w700,
                                color: palette.label,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
              child: Text(
                name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.subhead.copyWith(
                  color: palette.label,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const SizedBox(height: 2),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.xs,
                0,
                AppSpacing.xs,
                AppSpacing.xs,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      l10n.seeAllPlain,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.caption.copyWith(
                        color: palette.accent,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  Container(
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      gradient: palette.primaryGradient,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      CupertinoIcons.arrow_right,
                      size: 14,
                      color: palette.onAccent,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
