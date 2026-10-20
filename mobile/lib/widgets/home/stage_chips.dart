import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../models/stage_model.dart';
import '../../providers/stages_provider.dart';
import '../../providers/todo_provider.dart';
import '../../services/stage_label.dart';
import '../../theme/app_theme.dart';
import '../brand/illustration.dart';
import '../ios/inset_section.dart';
import '../motion/reveal.dart';
import '../skeleton.dart';

/// Which stage Home is narrowed to, or null for all of them.
///
/// Held as [stageFilterId] rather than a stage id, because the three things
/// it filters — stages, the to-do board and the shift's work — share only the
/// stage's key, and fall back to its name when it has none.
final homeStageFilterProvider = StateProvider<String?>((ref) => null);

/// The identity a stage is filtered by: its stable key, or its name.
String stageFilterId(String? key, String name) => key ?? 'name:$name';

/// The reference's category row, as the lab's stages: a picture tile per
/// stage, the selected one filled green. Picking one narrows the to-do cards
/// and the shift's work below it; "All" lifts the narrowing.
class StageChips extends ConsumerWidget {
  const StageChips({super.key});

  static const double _tileWidth = 72;
  static const double _height = 96;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final stages = ref.watch(stagesProvider).valueOrNull;
    final board = ref.watch(todoProvider);
    final selected = ref.watch(homeStageFilterProvider);

    int waitingIn(StageModel stage) {
      if (board == null) return 0;
      final id = stageFilterId(stage.key, stage.name);
      return board.columns
          .where(
            (c) =>
                !c.isDone && stageFilterId(c.stageKey, c.stageName ?? '') == id,
          )
          .fold(0, (sum, c) => sum + c.count);
    }

    final List<Widget> tiles;
    if (stages == null) {
      tiles = [
        for (var i = 0; i < 5; i++)
          const SizedBox(
            width: _tileWidth,
            height: 84,
            child: SkeletonBar(width: _tileWidth, height: 84),
          ),
      ];
    } else {
      final sorted = [...stages]
        ..sort((a, b) => a.sequenceOrder.compareTo(b.sequenceOrder));
      tiles = [
        _StageTile(
          label: l10n.stageAllChip,
          art: Art.stageAll,
          selected: selected == null,
          onTap: () => ref.read(homeStageFilterProvider.notifier).state = null,
        ),
        for (final stage in sorted)
          _StageTile(
            label: stageLabel(l10n, stage.key, stage.name),
            art: Art.forStage(stage.key),
            count: waitingIn(stage),
            selected: selected == stageFilterId(stage.key, stage.name),
            onTap: () {
              final id = stageFilterId(stage.key, stage.name);
              final notifier = ref.read(homeStageFilterProvider.notifier);
              // A second tap on the selected stage lets it go again.
              notifier.state = notifier.state == id ? null : id;
            },
          ),
      ];
    }

    return Reveal(
      animation: EntranceScope.slice(context, 0, 0.45),
      offset: const Offset(60, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            child: InsetSectionHeading(text: l10n.stagesTitle),
          ),
          SizedBox(
            height: _height,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
              physics: const BouncingScrollPhysics(),
              itemCount: tiles.length,
              separatorBuilder: (_, _) =>
                  const SizedBox(width: AppSpacing.sm + 2),
              itemBuilder: (context, i) => tiles[i],
            ),
          ),
        ],
      ),
    );
  }
}

/// A selection that changes at once. Animating the fill from white to a
/// gradient passed through a washed-out middle that read as a blink, and the
/// press scale on top of it added a second flicker; neither said anything the
/// change of colour does not.
class _StageTile extends StatelessWidget {
  const _StageTile({
    required this.label,
    required this.art,
    required this.selected,
    required this.onTap,
    this.count = 0,
  });

  final String label;
  final Art art;
  final bool selected;
  final VoidCallback onTap;
  final int count;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return Semantics(
      button: true,
      selected: selected,
      label: count > 0 ? '$label, $count' : label,
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: SizedBox(
          width: StageChips._tileWidth,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                height: 84,
                padding: const EdgeInsets.fromLTRB(4, 8, 4, 6),
                decoration: BoxDecoration(
                  color: selected ? null : palette.cardBackground,
                  gradient: selected
                      ? LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [palette.heroMid, palette.heroStart],
                        )
                      : null,
                  borderRadius: BorderRadius.circular(AppRadius.lg),
                ),
                child: Column(
                  children: [
                    Expanded(child: Illustration(art)),
                    const SizedBox(height: 4),
                    // Shrunk rather than cut: "ANALYSIS" is the word, not
                    // "ANALYS…".
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        label,
                        maxLines: 1,
                        style: AppText.caption.copyWith(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: selected
                              ? palette.onHero
                              : palette.secondaryLabel,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              if (count > 0)
                Positioned(
                  top: -4,
                  right: -2,
                  child: Container(
                    constraints: const BoxConstraints(minWidth: 20),
                    height: 20,
                    padding: const EdgeInsets.symmetric(horizontal: 5),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: palette.lime,
                      borderRadius: BorderRadius.circular(AppRadius.pill),
                      border: Border.all(
                        color: palette.groupedBackground,
                        width: 2,
                      ),
                    ),
                    child: Text(
                      count > 99 ? '99+' : '$count',
                      style: AppText.caption.copyWith(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: palette.heroStart,
                        height: 1,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
