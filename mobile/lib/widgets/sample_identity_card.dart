import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../models/master_option.dart';
import '../models/sample_identity.dart';
import '../models/sample_model.dart';
import '../providers/master_options_provider.dart';
import '../theme/app_theme.dart';
import 'ios/inset_section.dart';

/// What a barcode says about its sample: the Sample ID, the Lab Code, and the
/// parts the id was composed from — or, plainly, that it has none yet.
///
/// The preparator checks this against the label and the sheet in hand, so a
/// barcode with no Sample ID is said out loud rather than left as a missing
/// row: that is the thing to fix, and the way to fix it sits right under it.
class SampleIdentityCard extends ConsumerWidget {
  const SampleIdentityCard({super.key, required this.sample, this.onEdit});

  final SampleModel sample;

  /// Opens the identity form. Null hides the action.
  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;
    final ident = sample.sampleIdent;
    final identity = sample.identity;

    // The master lists are only asked for when there is a code to name: most
    // barcodes on the floor have no identity yet, and those need no request.
    final needsCodes =
        identity != null &&
        [
          identity.placeId,
          identity.rockTypeId,
          identity.nonProdId,
          identity.sirId,
          identity.pitId,
        ].any((id) => id != null);
    final options = needsCodes ? ref.watch(masterOptionsProvider) : null;

    final parts = identity == null
        ? const <_Part>[]
        : _partsOf(l10n, identity, options?.valueOrNull);

    return InsetSection(
      header: l10n.barcodeInfoTitle,
      footer: options?.hasError == true ? l10n.identityCodesUnavailable : null,
      children: [
        if (!sample.hasSampleIdent)
          InsetCustomRow(
            child: Row(
              children: [
                Icon(
                  CupertinoIcons.exclamationmark_triangle_fill,
                  size: 18,
                  color: palette.warning.foreground,
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    l10n.noSampleIdYet,
                    style: AppText.body.copyWith(color: palette.label),
                  ),
                ),
              ],
            ),
          )
        else if (ident == null)
          // The lab admin keeps the Sample ID itself off the app: it is said
          // to exist, and the form still shows it to whoever edits it.
          InsetCustomRow(
            child: Row(
              children: [
                Icon(
                  CupertinoIcons.checkmark_seal_fill,
                  size: 18,
                  color: palette.success.foreground,
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    l10n.checkHasIdent,
                    style: AppText.body.copyWith(color: palette.label),
                  ),
                ),
              ],
            ),
          )
        else
          InsetCustomRow(
            child: Row(
              children: [
                Icon(
                  CupertinoIcons.tag,
                  size: 18,
                  color: palette.secondaryLabel,
                ),
                const SizedBox(width: AppSpacing.sm),
                // Scaled rather than wrapped: a full identity needs more width
                // than the row has, and it is checked against a lab sheet, so it
                // has to stay in one readable run.
                Expanded(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: AlignmentDirectional.centerStart,
                    child: Text(
                      l10n.sampleIdent(ident),
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
        if (identity != null)
          _PartRow(label: l10n.labCodeLabel, value: identity.labCode),
        for (final part in parts)
          _PartRow(label: part.label, value: part.value),
        if (onEdit != null)
          InsetRow(
            title: sample.hasSampleIdent
                ? l10n.editSampleId
                : l10n.fillSampleId,
            titleStyle: AppText.body.copyWith(color: palette.accent),
            leading: Icon(
              sample.hasSampleIdent
                  ? CupertinoIcons.pencil
                  : CupertinoIcons.plus_circle,
              size: 20,
              color: palette.accent,
            ),
            showChevron: true,
            onTap: onEdit,
          ),
      ],
    );
  }

  /// The parts that are filled in, in the order the website's form shows
  /// them. A coded part whose code cannot be named — the lists did not load —
  /// is left out rather than shown as an id nobody can read.
  static List<_Part> _partsOf(
    AppLocalizations l10n,
    SampleIdentity identity,
    List<MasterOption>? options,
  ) {
    String? code(String? id) => options == null ? null : codeOf(options, id);
    final parts = <_Part>[
      _Part(l10n.identityPlace, code(identity.placeId)),
      _Part(l10n.identityRockType, code(identity.rockTypeId)),
      _Part(l10n.identityNonProd, code(identity.nonProdId)),
      _Part(l10n.identitySir, code(identity.sirId)),
      _Part(l10n.identityPit, code(identity.pitId)),
      _Part(l10n.identityBargingNo, identity.bargingNo),
      _Part(l10n.identitySequenceNo, identity.sequenceNo?.toString()),
      _Part(l10n.identitySampleNo, identity.sampleNo?.toString()),
      _Part(l10n.identitySackCount, identity.sackCount?.toString()),
    ];
    return parts.where((part) => part.value != null).toList();
  }
}

class _Part {
  const _Part(this.label, this.value);

  final String label;
  final String? value;
}

/// A label on the left and its value on the right, the value in the same
/// monospace as the codes so it reads against the label in hand.
class _PartRow extends StatelessWidget {
  const _PartRow({required this.label, required this.value});

  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return InsetCustomRow(
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: AppText.subhead.copyWith(color: palette.secondaryLabel),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Text(
            value ?? '',
            style: AppText.body.copyWith(
              color: palette.label,
              fontFamily: AppText.monoFamily,
            ),
          ),
        ],
      ),
    );
  }
}
