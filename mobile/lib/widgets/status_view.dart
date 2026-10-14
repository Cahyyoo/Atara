import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// A whole-screen outcome: not found, could not load, saved.
///
/// The three of these on the update screen were once written three separate
/// times with three icon sizes, three circle diameters and three greys. They
/// say the same kind of thing and now look like it.
///
/// The iOS version drops the filled circle behind the glyph: a large tinted
/// symbol on the page's own ground is quieter, and quieter is the point.
///
/// [liveRegion] announces the message to a screen reader the way `role="alert"`
/// does on the web, so a failure is heard and not only recoloured.
class StatusView extends StatelessWidget {
  const StatusView({
    super.key,
    required this.icon,
    required this.tone,
    required this.title,
    this.message,
    this.detail,
    this.action,
    this.secondaryAction,
    this.liveRegion = false,
  });

  final IconData icon;
  final ToneColors tone;
  final String title;
  final String? message;

  /// Extra content under the message — an address, a shortcut, a hint.
  final Widget? detail;
  final Widget? action;
  final Widget? secondaryAction;
  final bool liveRegion;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    final content = Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Icon(icon, color: tone.foreground, size: 56),
        const SizedBox(height: AppSpacing.xl),
        Text(
          title,
          textAlign: TextAlign.center,
          style: AppText.title2.copyWith(color: palette.label),
        ),
        if (message != null) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(
            message!,
            textAlign: TextAlign.center,
            style: AppText.subhead.copyWith(color: palette.secondaryLabel),
          ),
        ],
        if (detail != null) ...[
          const SizedBox(height: AppSpacing.lg),
          Align(alignment: Alignment.center, child: detail!),
        ],
        if (action != null) ...[
          const SizedBox(height: AppSpacing.xl),
          action!,
        ],
        if (secondaryAction != null) ...[
          const SizedBox(height: AppSpacing.sm),
          secondaryAction!,
        ],
      ],
    );

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.xxl),
        child: liveRegion
            ? Semantics(liveRegion: true, container: true, child: content)
            : content,
      ),
    );
  }
}

/// An inline strip of context above or below the thing it qualifies — the
/// sample came off the phone, the server could not be asked.
///
/// Unlike [StatusView] this does not take over the screen: the preparator can
/// still act, and the banner only says what they should know while doing so.
class ToneBanner extends StatelessWidget {
  const ToneBanner({
    super.key,
    required this.icon,
    required this.tone,
    required this.title,
    this.message,
    this.detail,
    this.dense = false,
  });

  final IconData icon;
  final ToneColors tone;
  final String title;
  final String? message;
  final Widget? detail;

  /// One quiet line rather than a filled card — for a note that qualifies
  /// something already on screen instead of interrupting it.
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    if (dense) {
      return Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.md),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 16, color: palette.secondaryLabel),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                title,
                style: AppText.footnote.copyWith(color: palette.secondaryLabel),
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: tone.background,
        borderRadius: BorderRadius.circular(AppRadius.lg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, size: 20, color: tone.foreground),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Text(
                  title,
                  style: AppText.headline.copyWith(color: tone.onBackground),
                ),
              ),
            ],
          ),
          if (message != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              message!,
              style: AppText.footnote.copyWith(color: tone.onBackground),
            ),
          ],
          if (detail != null) ...[
            const SizedBox(height: AppSpacing.md),
            detail!,
          ],
        ],
      ),
    );
  }
}
