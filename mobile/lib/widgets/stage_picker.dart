import 'package:flutter/cupertino.dart';

import '../l10n/app_localizations.dart';
import '../models/stage_model.dart';
import '../theme/app_motion.dart';
import '../theme/app_theme.dart';
import 'brand/illustration.dart';
import 'ios/inset_section.dart';
import '../services/stage_label.dart';

/// The list of stages the preparator chooses from.
///
/// A single choice is stated with a tick against the chosen row, not with a
/// column of radio circles: the unchosen rows carry no control at all, so the
/// list reads as content with one thing marked rather than as a form.
class StagePicker extends StatelessWidget {
  const StagePicker({
    super.key,
    required this.stages,
    required this.selectedId,
    required this.onChanged,
  });

  final List<StageModel> stages;
  final String? selectedId;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;

    return InsetSection(
      children: [
        for (final stage in stages)
          InsetRow(
            title: stageLabel(l10n, stage.key, stage.name),
            subtitle: stage.description,
            onTap: () => onChanged(stage.id),
            leading: _SequenceBadge(
              order: stage.sequenceOrder,
              stageKey: stage.key,
              isSelected: stage.id == selectedId,
            ),
            titleStyle: AppText.body.copyWith(
              color: palette.label,
              fontWeight: stage.id == selectedId
                  ? FontWeight.w700
                  : FontWeight.w500,
            ),
            trailing: AnimatedSwitcher(
              duration: AppMotion.fast,
              transitionBuilder: (child, animation) =>
                  ScaleTransition(scale: animation, child: child),
              child: stage.id == selectedId
                  ? Icon(
                      CupertinoIcons.checkmark_circle_fill,
                      key: const ValueKey(true),
                      size: 24,
                      color: palette.accent,
                    )
                  : const SizedBox(key: ValueKey(false), width: 24, height: 24),
            ),
          ),
      ],
    );
  }
}

/// The stage's picture, with its place in the pipeline on a small badge.
///
/// The workflow is strictly ordered, and seeing the number makes "which one
/// comes next" answerable without counting down the list; the picture makes
/// the stage recognisable before the word is read.
class _SequenceBadge extends StatelessWidget {
  const _SequenceBadge({
    required this.order,
    required this.stageKey,
    required this.isSelected,
  });

  final int order;
  final String? stageKey;
  final bool isSelected;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return SizedBox(
      width: 48,
      height: 48,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          AnimatedContainer(
            duration: AppMotion.base,
            curve: AppMotion.move,
            width: 48,
            height: 48,
            padding: const EdgeInsets.all(AppSpacing.xs + 2),
            decoration: BoxDecoration(
              color: palette.blob.withValues(alpha: isSelected ? 1 : 0.55),
              borderRadius: BorderRadius.circular(AppRadius.md),
              border: Border.all(
                color: isSelected ? palette.accent : const Color(0x00000000),
                width: 2,
              ),
            ),
            child: Illustration(Art.forStage(stageKey)),
          ),
          Positioned(
            right: -4,
            bottom: -4,
            child: AnimatedContainer(
              duration: AppMotion.base,
              width: 20,
              height: 20,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                gradient: isSelected ? palette.primaryGradient : null,
                color: isSelected ? null : palette.cardBackground,
                shape: BoxShape.circle,
                border: Border.all(color: palette.cardBackground, width: 2),
              ),
              child: Text(
                '$order',
                style: AppText.caption.copyWith(
                  fontSize: 10,
                  height: 1,
                  color: isSelected ? palette.onAccent : palette.secondaryLabel,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Shown in place of the list when the server has no stages configured.
class StagePickerEmpty extends StatelessWidget {
  const StagePickerEmpty({super.key});

  @override
  Widget build(BuildContext context) {
    return InsetSection(
      children: [
        InsetCustomRow(
          child: Text(
            AppLocalizations.of(context)!.stageListEmpty,
            style: AppText.subhead.copyWith(
              color: context.palette.danger.foreground,
            ),
          ),
        ),
      ],
    );
  }
}
