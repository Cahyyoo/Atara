import 'package:flutter/cupertino.dart';

import '../l10n/app_localizations.dart';
import '../services/barcode_check.dart';
import '../theme/app_theme.dart';

/// The answer to "does this barcode have a Sample ID yet", floating over the
/// camera the way the iOS Camera app floats what a code says: the barcode,
/// and on the line under it the Sample ID or the plain fact about it.
///
/// Nothing else. The camera keeps running under it, so a rack of labels is
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

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;

    final (
      IconData? icon,
      Color color,
      String text,
      bool mono,
    ) = switch (check.state) {
      BarcodeCheckState.checking => (
        null,
        CupertinoColors.white,
        l10n.sampleIdChecking,
        false,
      ),
      BarcodeCheckState.hasIdent => (
        CupertinoIcons.checkmark_seal_fill,
        palette.success.foreground,
        check.sampleIdent!,
        true,
      ),
      BarcodeCheckState.hasIdentHidden => (
        CupertinoIcons.checkmark_seal_fill,
        palette.success.foreground,
        l10n.checkHasIdent,
        false,
      ),
      BarcodeCheckState.noIdent => (
        CupertinoIcons.exclamationmark_triangle_fill,
        palette.warning.foreground,
        l10n.todoNoSampleId,
        false,
      ),
      BarcodeCheckState.notRegistered => (
        CupertinoIcons.xmark_octagon_fill,
        palette.danger.foreground,
        l10n.checkNotRegistered,
        false,
      ),
      BarcodeCheckState.offline => (
        CupertinoIcons.wifi_slash,
        CupertinoColors.white,
        l10n.checkOffline,
        false,
      ),
    };

    final opens = check.state != BarcodeCheckState.notRegistered;

    return Container(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.md,
        AppSpacing.xs,
        AppSpacing.md,
      ),
      decoration: BoxDecoration(
        color: CupertinoColors.black.withValues(alpha: 0.72),
        borderRadius: BorderRadius.circular(AppRadius.xl),
        border: Border.all(color: color.withValues(alpha: 0.6)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(
            child: Semantics(
              button: opens,
              liveRegion: true,
              label: opens
                  ? '${check.code}. $text. ${l10n.checkOpen}'
                  : '${check.code}. $text.',
              excludeSemantics: true,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: opens ? onOpen : null,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      check.code,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.headline.copyWith(
                        color: CupertinoColors.white,
                        fontFamily: AppText.monoFamily,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (icon == null)
                          const CupertinoActivityIndicator(
                            radius: 7,
                            color: CupertinoColors.white,
                          )
                        else
                          Icon(icon, size: 15, color: color),
                        const SizedBox(width: AppSpacing.xs),
                        // A long Sample ID is scaled to fit rather than cut:
                        // it is read against the label in hand.
                        Flexible(
                          child: FittedBox(
                            fit: BoxFit.scaleDown,
                            alignment: AlignmentDirectional.centerStart,
                            child: Text(
                              text,
                              maxLines: 1,
                              softWrap: false,
                              style: AppText.subhead.copyWith(
                                color: color,
                                fontWeight: FontWeight.w600,
                                fontFamily: mono ? AppText.monoFamily : null,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
          CupertinoButton(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
            minimumSize: const Size(36, 36),
            onPressed: onDismiss,
            child: Icon(
              CupertinoIcons.xmark_circle_fill,
              size: 22,
              color: CupertinoColors.white.withValues(alpha: 0.7),
              semanticLabel: l10n.checkDismiss,
            ),
          ),
        ],
      ),
    );
  }
}
