import 'package:flutter/widgets.dart';

/// One set of speeds and curves for the whole app.
///
/// Timed from the redesign reference at 30 fps: things arrive on a long,
/// decelerating curve and leave on a short, accelerating one, and a group of
/// elements never arrives at once — each follows the last by [stagger].
///
/// The crossfade speed the app already had (180 ms) stays [fast]; every
/// skeleton swap and toast is tuned to it.
abstract final class AppMotion {
  /// Crossfades, a label swapping for a spinner, a toast.
  static const Duration fast = Duration(milliseconds: 180);

  /// A section or card revealing itself.
  static const Duration base = Duration(milliseconds: 320);

  /// A header growing, an illustration gliding in.
  static const Duration slow = Duration(milliseconds: 450);

  /// How far behind the previous element the next one starts.
  static const Duration stagger = Duration(milliseconds: 60);

  /// How far a revealed element travels, in logical pixels.
  static const double rise = 16;

  /// Arrivals: fast out of the gate, settling softly.
  static const Curve enter = Curves.easeOutCubic;

  /// Departures: gathering speed as they go.
  static const Curve exit = Curves.easeInCubic;

  /// Something moving from one resting place to another.
  static const Curve move = Curves.easeInOutCubic;

  /// Whether movement should be dropped.
  ///
  /// The house rule: with animations disabled, nothing travels, scales or
  /// blurs — but fades keep their timing, so a sequence still reads as a
  /// sequence rather than as everything appearing at once.
  static bool reduced(BuildContext context) =>
      MediaQuery.maybeDisableAnimationsOf(context) ?? false;

  /// The [Interval] for item [index] of [count], each lasting [share] of the
  /// whole and starting [stagger] after the last, all inside `[begin, end]`.
  static Interval staggered(
    int index,
    int count, {
    double begin = 0,
    double end = 1,
    double share = 0.55,
    Curve curve = enter,
  }) {
    final span = end - begin;
    final itemSpan = span * share;
    final step = count <= 1 ? 0.0 : (span - itemSpan) / (count - 1);
    final start = begin + step * index;
    return Interval(
      start.clamp(0.0, 1.0),
      (start + itemSpan).clamp(0.0, 1.0),
      curve: curve,
    );
  }
}
