import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../models/stage_board.dart';
import '../providers/todo_provider.dart';
import '../screens/todo_stage_screen.dart';
import '../services/stage_label.dart';
import '../theme/app_theme.dart';
import 'app_primitives.dart';
import 'ios/inset_section.dart';
import 'skeletons.dart';

/// Home's to-do list: each stage with samples sitting in it, how many, and how
/// many have waited past the SLA. A row opens that stage's samples.
class TodoSection extends ConsumerWidget {
  const TodoSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final board = ref.watch(todoProvider);
    final palette = context.palette;

    if (board == null) {
      return SliverMainAxisGroup(
        slivers: [
          MyWorkSkeleton(header: l10n.todoTitle, rows: 3, showTallies: false),
        ],
      );
    }

    final waiting = board.waiting;
    if (waiting.isEmpty) {
      return SliverToBoxAdapter(
        child: InsetSection(
          header: l10n.todoTitle,
          children: [
            InsetCustomRow(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.lg,
                vertical: AppSpacing.xl,
              ),
              child: Center(
                child: Text(
                  l10n.todoEmpty,
                  style: AppText.subhead.copyWith(
                    color: palette.secondaryLabel,
                  ),
                ),
              ),
            ),
          ],
        ),
      );
    }

    return SliverToBoxAdapter(
      child: InsetSection(
        header: l10n.todoTitle,
        footer: l10n.todoFooter,
        children: [for (final column in waiting) _StageRow(column: column)],
      ),
    );
  }
}

class _StageRow extends StatelessWidget {
  const _StageRow({required this.column});

  final BoardColumn column;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;
    final name = stageLabel(l10n, column.stageKey, column.stageName ?? '');

    return InsetRow(
      title: name,
      subtitle: l10n.todoCount(column.count),
      leading: Icon(
        CupertinoIcons.tray_full,
        size: 20,
        color: column.overdue > 0 ? palette.danger.foreground : palette.accent,
      ),
      trailing: column.overdue > 0
          ? AppBadge(
              label: l10n.todoOverdue(column.overdue),
              tone: palette.danger,
            )
          : null,
      showChevron: true,
      onTap: () => Navigator.of(context).push(
        CupertinoPageRoute(
          builder: (context) =>
              TodoStageScreen(columnId: column.id, title: name),
        ),
      ),
    );
  }
}
