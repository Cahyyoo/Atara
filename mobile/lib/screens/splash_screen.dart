import 'package:flutter/cupertino.dart';

import '../l10n/app_localizations.dart';
import '../theme/app_theme.dart';
import '../widgets/brand_mark.dart';

/// The app arriving: the mark is already here, then its name, then a line
/// that fills while the stored answers are read.
///
/// **The mark does not animate in, and that is the point.** The native launch
/// window already shows it — the launcher's adaptive icon on this same teal —
/// so by the time Flutter draws its first frame the operator has been looking
/// at the mountain for however long the app took to boot. Fading it in here
/// would mean drawing it twice. Starting with it in place means the handoff
/// from the system window to the first Flutter frame is seamless.
///
/// **The loading line is what says the handoff happened.** Seamless cut both
/// ways: the system window and this screen were pixel-identical at rest —
/// same teal, same mountain, nothing moving — so several seconds of Android
/// holding its own splash and this screen doing its job read as one long
/// frozen green field. The line is the only thing the system window does not
/// have, so it moves from the very first frame. Before it: still booting.
/// After it: Flutter is drawing.
///
/// That also makes the next failure diagnosable. Three fixes went into this
/// screen against a symptom that could not distinguish "the app has not
/// started" from "the splash is frozen".
///
/// Held for [hold] whether or not the app is ready. The answers behind
/// [AuthGate] are one shared-preferences round trip and usually land inside a
/// frame or two, so without a floor this would be a flicker — which is worse
/// than no splash at all. The cost is real and deliberate: [hold] is added to
/// every cold start, which is why it is as short as it can be and still be
/// read.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key, required this.onFinished});

  /// How long the whole thing lasts, fade-out included. Named so the tests can
  /// pump past it without restating the number.
  ///
  /// 600ms was right on paper and wrong on a phone: after several seconds of
  /// the system holding an identical teal screen, six-tenths of a second of
  /// anything happening went by unseen. The wait this sits in front of is
  /// long; the part that says so has to last long enough to be read.
  static const Duration hold = Duration(milliseconds: 1400);

  final VoidCallback onFinished;

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  /// The only AnimationController in the app.
  ///
  /// Everything else animates implicitly, which is the right default. It does
  /// not work here: four stages off one timeline, and nothing to hang an
  /// implicit animation on.
  ///
  /// `preserve` is load-bearing, not a preference. Under the default
  /// `AnimationBehavior.normal` Flutter multiplies the duration by 0.05 when
  /// the platform asks for less motion — 900ms becomes 45ms, the splash is
  /// gone in two frames, and it looks exactly like a bug. It looked exactly
  /// like a bug. The motion is dropped in [build] instead, which is what the
  /// setting actually asks for; the timing stays honest.
  late final AnimationController _controller = AnimationController(
    duration: SplashScreen.hold,
    animationBehavior: AnimationBehavior.preserve,
    vsync: this,
  )..addStatusListener((status) {
      if (status == AnimationStatus.completed) widget.onFinished();
    });

  /// One stage each, off the shared timeline. Handing an `Animation` to a
  /// `*Transition` is what keeps this off the build phase entirely:
  /// `FadeTransition`'s render object subscribes to the animation itself and
  /// only updates its layer's alpha. An `AnimatedBuilder` would rebuild the
  /// subtree 54 times instead.
  /// The mark settles first: it is already on screen, handed over from the
  /// launch window, so it does not arrive — it comes to rest. A small
  /// contraction reads as exactly that, where a fade-in would read as a
  /// second mountain appearing on top of the first.
  late final _settle = _stage(0, 380, Curves.easeOutCubic);

  // Then the line, which is the proof of life, and the name behind it.
  late final _line = _stage(120, 900, Curves.easeInOut);
  late final _name = _stage(360, 980, Curves.easeOut);
  late final _exit = _stage(1180, 1400, Curves.easeIn);

  CurvedAnimation _stage(int fromMs, int toMs, Curve curve) {
    const total = 1400.0;
    return CurvedAnimation(
      parent: _controller,
      curve: Interval(fromMs / total, toMs / total, curve: curve),
    );
  }

  @override
  void initState() {
    super.initState();
    _controller.forward();
  }

  @override
  void dispose() {
    // CurvedAnimation holds a listener on its parent; leaving these undisposed
    // leaks one per launch.
    for (final stage in [_settle, _line, _name, _exit]) {
      stage.dispose();
    }
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context)!;

    // Honoured by dropping the movement, not by dropping the splash. Someone
    // who asked for less motion still needs to see the app start.
    final still = MediaQuery.disableAnimationsOf(context);

    return DecoratedBox(
      // Built once, outside every transition, so this full-screen shader is
      // rasterised exactly once for the whole splash.
      decoration: BoxDecoration(gradient: palette.heroGradient),
      child: Center(
        child: FadeTransition(
          opacity: Tween<double>(begin: 1, end: 0).animate(_exit),
          child: _Rise(
            animation: _exit,
            distance: still ? 0 : -8,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Never a fade: it is already on screen, handed over from
                // the launch window, and it stays there for the whole splash.
                // The scale only settles it — 6% is enough to be felt as the
                // moment Flutter took over, and small enough that nobody
                // reads it as a second mountain.
                ScaleTransition(
                  scale: still
                      ? const AlwaysStoppedAnimation(1.0)
                      : Tween<double>(begin: 1.06, end: 1).animate(_settle),
                  child: BrandGlyph(size: 88, color: palette.onHero),
                ),
                const SizedBox(height: AppSpacing.xl),
                FadeTransition(
                  opacity: _name,
                  child: _Rise(
                    animation: _name,
                    distance: still ? 0 : 12,
                    child: Text(
                      l10n.appTitle,
                      style: AppText.title2.copyWith(color: palette.onHero),
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.xl),
                _LoadingLine(animation: _line, color: palette.onHero),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Lifts its child into place as [animation] runs.
///
/// `SlideTransition` measures its offset as a fraction of the child's own
/// size, which makes a fixed 12pt rise depend on how tall the text happens to
/// be. This is the same thing in logical pixels.
class _Rise extends AnimatedWidget {
  const _Rise({
    required Animation<double> animation,
    required this.distance,
    required this.child,
  }) : super(listenable: animation);

  final double distance;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final t = (listenable as Animation<double>).value;
    return Transform.translate(offset: Offset(0, distance * (1 - t)), child: child);
  }
}

/// A hairline that fills left to right while the app reads its stored state.
///
/// It says *why* there is a pause, and — because the system launch window has
/// no line — it is also the one thing on screen that proves Flutter is the one
/// drawing. The track stays visible at rest so the line has somewhere to go
/// rather than appearing from nothing.
class _LoadingLine extends StatelessWidget {
  const _LoadingLine({required this.animation, required this.color});

  static const double _width = 96;
  static const double _height = 2;

  final Animation<double> animation;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(_height);

    return SizedBox(
      width: _width,
      height: _height,
      child: DecoratedBox(
        decoration: BoxDecoration(
          // Legible as a track being filled, not as a stray scratch. At 0.24
          // it was easy to miss, and missing it is what left the whole screen
          // looking identical to the system window before it.
          color: color.withValues(alpha: 0.35),
          borderRadius: radius,
        ),
        child: Align(
          alignment: Alignment.centerLeft,
          // Only this 96x2 strip rebuilds per frame; the rest of the splash
          // never enters the build phase at all.
          child: AnimatedBuilder(
            animation: animation,
            builder: (context, child) => FractionallySizedBox(
              widthFactor: animation.value,
              child: child,
            ),
            child: DecoratedBox(
              decoration: BoxDecoration(color: color, borderRadius: radius),
            ),
          ),
        ),
      ),
    );
  }
}
