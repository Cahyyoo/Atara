import 'package:flutter/cupertino.dart';

import '../l10n/app_localizations.dart';
import '../models/stage_model.dart';
import '../theme/app_theme.dart';
import 'ios/inset_section.dart';
import '../services/stage_label.dart';

/// The list of stages the preparator chooses from.
///
/// iOS states a single choice with a tick against the chosen row, not with a
/// column of radio circles: the unchosen rows carry no control at all, so the
/// list reads as content with one thing marked rather than as a form. That is
/// most of why this screen got quieter.
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
              isSelected: stage.id == selectedId,
            ),
            titleStyle: AppText.body.copyWith(
              color: palette.label,
              fontWeight:
                  stage.id == selectedId ? FontWeight.w600 : FontWeight.w400,
            ),
            trailing: stage.id == selectedId
                ? Icon(CupertinoIcons.check_mark, size: 20, color: palette.accent)
                : null,
          ),
      ],
    );
  }
}

/// The stage's place in the pipeline.
///
/// The workflow is strictly ordered, and seeing the number makes "which one
/// comes next" answerable without counting down the list.
class _SequenceBadge extends StatelessWidget {
  const _SequenceBadge({required this.order, required this.isSelected});

  final int order;
  final bool isSelected;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return Container(
      width: 26,
      height: 26,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: isSelected ? palette.accent : palette.fill,
        shape: BoxShape.circle,
      ),
      child: Text(
        '$order',
        style: AppText.caption.copyWith(
          color: isSelected ? palette.onAccent : palette.secondaryLabel,
          fontWeight: FontWeight.w600,
        ),
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
