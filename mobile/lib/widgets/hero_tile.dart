import 'package:flutter/widgets.dart';

import '../theme/app_theme.dart';

/// The brand square in its loud treatment: the web's `--gradient-hero`, its
/// sheen and its shadow, on the same iOS app-icon curve [BrandMark] uses.
///
/// This app has no other gradient and no other shadow, deliberately — see the
/// note on [AppColors]. Two screens are allowed the exception because they are
/// occasions rather than work surfaces: the splash, and the guide. The sign-in
/// screen keeps [BrandMark]'s flat tint, because that is what the web's own
/// sign-in header wears and the two have to match.
class HeroTile extends StatelessWidget {
  const HeroTile({super.key, this.size = 112, required this.child});

  final double size;

  /// Painted in [AppColors.onHero].
  ///
  /// An [Icon] takes its colour and size from the [IconTheme] installed here,
  /// so a caller writes `HeroTile(child: Icon(...))` and cannot reach for
  /// `onAccent` — which is near-black in dark mode — by mistake. [BrandGlyph]
  /// needs its colour passed directly, since it is not an [Icon].
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final radius = BorderRadius.circular(size * 0.24);

    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        gradient: palette.heroGradient,
        borderRadius: radius,
        boxShadow: palette.heroShadows,
      ),
      // A second fill painted over the first, clipped to the same curve, with
      // no Stack, no extra clip and no saveLayer.
      foregroundDecoration: BoxDecoration(
        gradient: palette.heroSheenGradient,
        borderRadius: radius,
      ),
      child: IconTheme(
        data: IconThemeData(color: palette.onHero, size: size * 0.46),
        child: child,
      ),
    );
  }
}
