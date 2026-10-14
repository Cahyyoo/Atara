import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../models/stage_board.dart';
import '../providers/todo_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/app_primitives.dart';
import '../widgets/ios/app_page.dart';
import '../widgets/ios/inset_section.dart';
import 'update_status_screen.dart';

/// The samples sitting in one stage, longest-waiting first: the bags to pick
/// up next. Tapping one opens the update screen for it, as scanning it would.
///
/// Reads the board from [todoProvider] by the column's id, so a pull here and
/// a scan elsewhere both show up without the list being handed around.
class TodoStageScreen extends ConsumerWidget {
  const TodoStageScreen({
    super.key,
    required this.columnId,
    required this.title,
  });

  final String columnId;
  final String title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;
    final board = ref.watch(todoProvider);
    final column = board?.columns.where((c) => c.id == columnId).firstOrNull;
    final cards = column?.cards ?? const <BoardCard>[];

    return AppPage(
      title: title,
      onRefresh: () => ref.read(todoProvider.notifier).refresh(),
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.lg,
            AppSpacing.lg,
            AppSpacing.xxl,
          ),
          sliver: cards.isEmpty
              ? SliverToBoxAdapter(
                  child: InsetSection(
                    children: [
                      InsetCustomRow(
                        child: Text(
                          l10n.todoEmpty,
                          style: AppText.subhead.copyWith(
                            color: palette.secondaryLabel,
                          ),
                        ),
                      ),
                    ],
                  ),
                )
              : InsetSectionSliver(
                  footer: l10n.todoStageFooter(cards.length, column!.count),
                  itemCount: cards.length,
                  itemBuilder: (context, index) => _CardRow(card: cards[index]),
                ),
        ),
      ],
    );
  }
}

class _CardRow extends ConsumerWidget {
  const _CardRow({required this.card});

  final BoardCard card;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;
    final hours = card.hours >= 10
        ? card.hours.round().toString()
        : card.hours.toStringAsFixed(1);

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () async {
        final saved = await Navigator.of(context).push<bool>(
          CupertinoPageRoute(
            builder: (context) =>
                UpdateStatusScreen(sampleCode: card.sampleCode),
          ),
        );
        if (saved == true) await ref.read(todoProvider.notifier).refresh();
      },
      child: InsetCustomRow(
        transparent: true,
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SampleCodeText(card.sampleCode, style: AppText.subhead),
                  const SizedBox(height: 2),
                  Text(
                    card.sampleIdent ?? l10n.todoNoSampleId,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.footnote.copyWith(
                      color: card.sampleIdent == null
                          ? palette.warning.foreground
                          : palette.secondaryLabel,
                      fontFamily: card.sampleIdent == null
                          ? null
                          : AppText.monoFamily,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            AppBadge(
              label: l10n.todoWaitingHours(hours),
              tone: card.overdue ? palette.danger : palette.neutral,
            ),
            const SizedBox(width: AppSpacing.xs),
            Icon(
              CupertinoIcons.chevron_forward,
              size: 16,
              color: palette.tertiaryLabel,
            ),
          ],
        ),
      ),
    );
  }
}
