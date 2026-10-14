import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// A sample code, set the one way it is set everywhere.
///
/// The preparator compares these against a printed label character by character,
/// so the face is monospaced and the letters never run together.
class SampleCodeText extends StatelessWidget {
  const SampleCodeText(this.code, {super.key, this.style, this.large = false});

  final String code;
  final TextStyle? style;

  /// For the one place the code is the subject of the screen rather than a
  /// label on a row.
  final bool large;

  @override
  Widget build(BuildContext context) {
    // Resolved only when the caller supplies nothing. This used to be computed
    // unconditionally and then thrown away one line below, taking a Theme
    // dependency with it — and WorkRow, the caller that renders hundreds of
    // these down a ninety-day list, always passes a style.
    //
    // Worth doing because the allocation was entirely DEAD, not because it
    // would have cost a relayout. It would not have: TextStyle has value
    // equality, so an identically-valued copyWith leaves RenderParagraph at
    // RenderComparison.identical. This is not a licence to hoist the app's
    // other per-build styles to statics in the name of performance.
    //
    // One consequence, because it looks like a dark-mode bug if it surprises
    // you: when a style IS passed, this widget no longer depends on the theme.
    // That is fine — the style came from the caller, and every caller reads
    // context.palette in its own build and so rebuilds on a theme change.
    final resolved = style ??
        (large
            ? AppText.title2.copyWith(color: context.palette.label)
            : AppText.body.copyWith(color: context.palette.label));

    // Scaled down to fit rather than wrapped or ellipsised.
    //
    // Both of the usual answers are wrong for this string. Wrapping split it
    // mid-code -- `SMPL-2026-` on one line and `00001` on the next -- and an
    // ellipsis would hide characters outright. It is compared against a printed
    // label character by character, so every character has to be there and in
    // one run. scaleDown only ever shrinks, so a short code is unaffected.
    return FittedBox(
      fit: BoxFit.scaleDown,
      alignment: AlignmentDirectional.centerStart,
      child: Text(
        code,
        maxLines: 1,
        softWrap: false,
        style: resolved.copyWith(
          fontFamily: AppText.monoFamily,
          fontWeight: FontWeight.w700,
          letterSpacing: large ? 0.5 : 0,
        ),
      ),
    );
  }
}

/// A small tinted capsule carrying one word: a status, a role, a tally.
///
/// iOS leans on these instead of bordered chips — the fill says "this is a
/// state", and dropping the border is most of what makes the screen quieter.
class AppBadge extends StatelessWidget {
  const AppBadge({super.key, required this.label, required this.tone});

  final String label;
  final ToneColors tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: 3,
      ),
      decoration: BoxDecoration(
        color: tone.background,
        borderRadius: BorderRadius.circular(AppRadius.sm),
      ),
      child: Text(
        label,
        style: AppText.caption.copyWith(
          color: tone.onBackground,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
