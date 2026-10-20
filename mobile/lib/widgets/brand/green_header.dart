import 'package:flutter/widgets.dart';

import '../../theme/app_theme.dart';

/// The reference's green panel: olive in the top-left corner into lime at the
/// bottom-right, with rounded bottom corners, running up under the status bar.
///
/// Login, Home and the brand sub-pages all start with one at the same place,
/// which is what lets the login header shrink into the home header without
/// the eye seeing two different things.
class GreenHeader extends StatelessWidget {
  const GreenHeader({
    super.key,
    this.height,
    this.child,
    this.radius = AppRadius.header,
  });

  /// Including the status bar. Null sizes to [child].
  final double? height;
  final Widget? child;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final shape = BorderRadius.vertical(bottom: Radius.circular(radius));
    return SizedBox(
      height: height,
      width: double.infinity,
      child: DecoratedBox(
        decoration: BoxDecoration(gradient: palette.heroGradient, borderRadius: shape),
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: palette.heroSheenGradient,
            borderRadius: shape,
          ),
          child: ClipRRect(borderRadius: shape, child: child),
        ),
      ),
    );
  }
}

/// Heights shared by every screen whose green header has to line up with
/// another's.
abstract final class GreenHeaderMetrics {
  /// Home's top bar — avatar, name, bell — under the status bar.
  static const double homeBar = 64;

  /// How far Home's gradient runs below its bar, behind the top of the
  /// banner.
  static const double homeUnderBanner = 92;

  /// Home's header at rest, including the status bar. The login header
  /// shrinks to exactly this before handing over.
  static double homeExpanded(double topInset) =>
      topInset + homeBar + homeUnderBanner;

  /// Home's header fully collapsed while scrolling.
  static double homeCollapsed(double topInset) => topInset + homeBar;
}
