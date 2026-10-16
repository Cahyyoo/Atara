import 'package:flutter/cupertino.dart';

import '../l10n/app_localizations.dart';
import '../services/barcode_check.dart';
import '../theme/app_theme.dart';

/// The answer to "does this barcode have a Sample ID yet", floating over the
/// camera the way the iOS Camera app floats what a code says.
///
/// Read at arm's length in a lab, so it says it plainly: the answer first, in
/// its colour and in capitals, then the Lab Code and the Sample ID, each under
/// its own label. The camera keeps running under it, so a rack of labels is
/// checked by sweeping the phone along it; a tap opens the sample's page.
class ScanCheckPill extends StatelessWidget {
  const ScanCheckPill({
    super.key,
    required this.check,
    required this.onOpen,
    required this.onDismiss,
  });

  final BarcodeCheck check;
  final VoidCallback onOpen;
  final VoidCallback onDismiss;

  static const Color _muted = Color(0xB3FFFFFF);

  /// The values are what is read against the label in hand: large, white.
  static final TextStyle _value = AppText.title2.copyWith(
    color: CupertinoColors.white,
  );

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;

    final (IconData? icon, Color color, String status) = switch (check.state) {
      BarcodeCheckState.checking => (
        null,
        CupertinoColors.white,
        l10n.sampleIdChecking,
      ),
      BarcodeCheckState.hasIdent || BarcodeCheckState.hasIdentHidden => (
        CupertinoIcons.checkmark_seal_fill,
        palette.success.foreground,
        l10n.checkHasIdent,
      ),
      BarcodeCheckState.noIdent => (
        CupertinoIcons.exclamationmark_triangle_fill,
        palette.warning.foreground,
        l10n.todoNoSampleId,
      ),
      BarcodeCheckState.notRegistered => (
        CupertinoIcons.xmark_octagon_fill,
        palette.danger.foreground,
        l10n.checkNotRegistered,
      ),
      BarcodeCheckState.offline => (
        CupertinoIcons.wifi_slash,
        CupertinoColors.white,
        l10n.checkOffline,
      ),
    };

    // What is known about the Sample ID, or null where there is nothing to
    // say under that label: still asking, an unknown barcode, or no way to ask.
    final (String? identValue, TextStyle? identStyle) = switch (check.state) {
      BarcodeCheckState.hasIdent => (
        check.sampleIdent!,
        _value.copyWith(fontFamily: AppText.monoFamily),
      ),
      BarcodeCheckState.hasIdentHidden => (
        l10n.checkIdentHiddenValue,
        AppText.headline.copyWith(
          color: _muted,
          fontStyle: FontStyle.italic,
          fontWeight: FontWeight.w500,
        ),
      ),
      BarcodeCheckState.noIdent => (
        '—',
        _value.copyWith(color: palette.warning.foreground),
      ),
      _ => (null, null),
    };

    final opens =
        check.state != BarcodeCheckState.notRegistered &&
        check.state != BarcodeCheckState.checking;
    final prompt = check.state == BarcodeCheckState.noIdent
        ? l10n.checkTapToFill
        : l10n.checkOpen;
    final codeLabel = check.labCode != null
        ? l10n.checkLabCode
        : l10n.checkBarcode;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.sm,
        AppSpacing.xs,
        AppSpacing.lg,
      ),
      decoration: BoxDecoration(
        color: CupertinoColors.black.withValues(alpha: 0.8),
        borderRadius: BorderRadius.circular(AppRadius.xl),
        border: Border.all(color: color.withValues(alpha: 0.7), width: 1.5),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (icon == null)
                const CupertinoActivityIndicator(
                  radius: 9,
                  color: CupertinoColors.white,
                )
              else
                Icon(icon, size: 20, color: color),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  status.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.subhead.copyWith(
                    color: color,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.4,
                  ),
                ),
              ),
              CupertinoButton(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
                minimumSize: const Size(40, 40),
                onPressed: onDismiss,
                child: Icon(
                  CupertinoIcons.xmark_circle_fill,
                  size: 24,
                  color: _muted,
                  semanticLabel: l10n.checkDismiss,
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(right: AppSpacing.md),
            child: Semantics(
              button: opens,
              liveRegion: true,
              label: [
                status,
                '$codeLabel ${check.displayCode}',
                if (identValue != null) '${l10n.checkSampleId} $identValue',
                if (opens) prompt,
              ].join('. '),
              excludeSemantics: true,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: opens ? onOpen : null,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _Field(
                      label: codeLabel,
                      value: check.displayCode,
                      style: _value.copyWith(fontFamily: AppText.monoFamily),
                    ),
                    if (identValue != null) ...[
                      const SizedBox(height: AppSpacing.md),
                      _Field(
                        label: l10n.checkSampleId,
                        value: identValue,
                        style: identStyle!,
                      ),
                    ],
                    if (opens) ...[
                      const SizedBox(height: AppSpacing.md),
                      Text(
                        '$prompt ›',
                        textAlign: TextAlign.end,
                        style: AppText.footnote.copyWith(
                          color: check.state == BarcodeCheckState.noIdent
                              ? palette.warning.foreground
                              : _muted,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A small label over its value. The value is scaled down rather than wrapped
/// or cut: a Sample ID is checked against a sheet, so it stays in one run.
class _Field extends StatelessWidget {
  const _Field({required this.label, required this.value, required this.style});

  final String label;
  final String value;
  final TextStyle style;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: AppText.caption.copyWith(
            color: ScanCheckPill._muted,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.3,
          ),
        ),
        const SizedBox(height: 2),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: AlignmentDirectional.centerStart,
          child: Text(value, maxLines: 1, softWrap: false, style: style),
        ),
      ],
    );
  }
}
