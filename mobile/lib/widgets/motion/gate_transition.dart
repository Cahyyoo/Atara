import 'package:flutter/widgets.dart';

/// The animation of a swap between two of the app's top-level states — login
/// to home, home back to login — handed down to the screens taking part.
///
/// The reference never "pushes" from login to home: the login header shrinks
/// into the home header in place while the form leaves and the home content
/// arrives. Those are two screens, so the swap's one animation has to reach
/// both. [AuthGate] runs it; each screen reads it here and maps it onto its
/// own exit or entrance.
///
/// [animation] runs 0 → 1 for the screen coming in, and 1 → 0 for the one
/// going out (an [AnimatedSwitcher] reverses the outgoing child's), so a
/// screen can tell which it is from [entering].
///
/// Absent when a screen is shown on its own — a test, the first frame after
/// the splash — and then a screen should simply appear at rest, or run its
/// own entrance.
class GateTransition extends InheritedWidget {
  const GateTransition({
    super.key,
    required this.animation,
    required super.child,
  });

  final Animation<double> animation;

  /// Where Home takes over from an outgoing Login: by then the login header
  /// has shrunk to exactly Home's, so the cut between them cannot be seen.
  static const double handover = 0.45;

  /// True while this screen is the one arriving.
  bool get entering =>
      animation.status == AnimationStatus.forward ||
      animation.status == AnimationStatus.completed;

  static GateTransition? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<GateTransition>();

  @override
  bool updateShouldNotify(GateTransition oldWidget) =>
      animation != oldWidget.animation;
}
