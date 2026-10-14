import 'package:flutter/cupertino.dart';

import '../l10n/app_localizations.dart';
import '../models/sample_model.dart';
import '../services/sample_status_text.dart';
import '../theme/app_theme.dart';
import 'app_primitives.dart';
import 'ios/inset_section.dart';

/// What the operator is holding: the code, its identity, where it has reached.
///
/// The barcode leads, because it is the one thing being checked against the
/// label in the operator's hand. Everything else is context under it.
class SampleSummaryCard extends StatelessWidget {
  const SampleSummaryCard({
    super.key,
    required this.sample,
    this.showIdent = true,
  });

  final SampleModel sample;

  /// False where SampleIdentityCard follows, which shows the Sample ID with
  /// its parts — the same id twice, one card apart, is one too many.
  final bool showIdent;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;

    return InsetSection(
      children: [
        InsetCustomRow(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(child: SampleCodeText(sample.sampleCode, large: true)),
              const SizedBox(width: AppSpacing.sm),
              AppBadge(
                label: sampleStatusText(l10n, sample.status),
                tone: _statusTone(context, sample.status),
              ),
            ],
          ),
        ),
        // Left out entirely when there is none, rather than shown as a dash.
        // Most samples are barcoded before their identity is known, and this
        // card is read standing in front of the container — an empty row is one
        // more thing for the eye to step over.
        if (showIdent && sample.sampleIdent != null)
          InsetCustomRow(
            child: Row(
              children: [
                Icon(CupertinoIcons.tag, size: 18, color: palette.secondaryLabel),
                const SizedBox(width: AppSpacing.sm),
                // Scaled rather than wrapped, for the same reason as the code
                // above: a full identity like MOL/LIM/S3/PA4/B42/919.3/25 needs
                // more width than the row has, and it is being checked against
                // a lab sheet — so it has to stay in one readable run.
                Expanded(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: AlignmentDirectional.centerStart,
                    child: Text(
                      l10n.sampleIdent(sample.sampleIdent!),
                      maxLines: 1,
                      softWrap: false,
                      style: AppText.body.copyWith(
                        color: palette.label,
                        fontFamily: AppText.monoFamily,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        InsetRow(
          title: l10n.currentStage(sample.currentStage?.name ?? l10n.notStarted),
          leading: Icon(
            CupertinoIcons.square_stack_3d_up,
            size: 18,
            color: palette.secondaryLabel,
          ),
        ),
      ],
    );
  }

  /// The status is derived by the server from the stage reached and is never
  /// chosen here, so it reads as a state of the sample and is styled like one.
  ToneColors _statusTone(BuildContext context, SampleStatus status) {
    final palette = context.palette;
    return switch (status) {
      SampleStatus.completed => palette.success,
      SampleStatus.inProgress => palette.info,
      SampleStatus.pending => palette.warning,
    };
  }
}
