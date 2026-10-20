import 'dart:ui' as ui;

import 'dart:async';
import 'package:flutter/cupertino.dart';
import 'package:flutter/scheduler.dart';

import '../l10n/app_localizations.dart';
import '../theme/app_motion.dart';
import '../theme/app_theme.dart';
import '../widgets/brand/illustration.dart';
import '../widgets/brand/wordmark.dart';

/// The app arriving, as the redesign reference's opens: a plain warm page, a
/// lab trolley gliding in from the left, the name fading up beneath it, then
/// the line under the name — and, once the app behind is ready, the trolley
/// rolling off to the right while the name blurs away after it.
///
/// **It starts from the native window's own page colour.** The system window
/// is the same off-white with the app icon on it — never blank, because a
/// blank window during a slow boot reads as a hang. At the handoff the icon
/// gives way to an empty page and the trolley glides in, which is also the
/// proof that Flutter is drawing.
///
/// Held for [hold] whether or not the app is ready, because the answers
/// behind [AuthGate] usually land inside a frame or two and a splash that
/// flickers is worse than none. The reference lingers for nearly four seconds;
/// this is the same sequence pressed into three, because it is paid on every
/// cold start of a tool used all shift.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key, required this.onFinished});

  /// How long the whole thing lasts, exit included. Named so the tests can
  /// pump past it without restating the number.
  static const Duration hold = Duration(milliseconds: 3000);

  final VoidCallback onFinished;

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  /// `preserve` is load-bearing, not a preference. Under the default
  /// `AnimationBehavior.normal` Flutter multiplies the duration by 0.05 when
  /// the platform asks for less motion — the splash is gone in two frames, and
  /// it looks exactly like a bug. The motion is dropped in [build] instead,
  /// which is what the setting actually asks for; the timing stays honest.
  late final AnimationController _controller =
      AnimationController(
        duration: SplashScreen.hold,
        animationBehavior: AnimationBehavior.preserve,
        vsync: this,
      )..addStatusListener((status) {
        if (status == AnimationStatus.completed) widget.onFinished();
      });

  // Every stage off the one timeline, in milliseconds of [SplashScreen.hold].
  late final _artIn = _stage(0, 700, AppMotion.enter);
  late final _nameIn = _stage(600, 1000, Curves.easeOut);
  late final _taglineIn = _stage(750, 1150, Curves.easeOut);
  late final _taglineOut = _stage(2250, 2400, Curves.easeIn);
  late final _artOut = _stage(2300, 2800, AppMotion.exit);
  late final _nameOut = _stage(2350, 2750, Curves.easeIn);

  CurvedAnimation _stage(int fromMs, int toMs, Curve curve) {
    final total = SplashScreen.hold.inMilliseconds;
    return CurvedAnimation(
      parent: _controller,
      curve: Interval(fromMs / total, toMs / total, curve: curve),
    );
  }

  @override
  void initState() {
    super.initState();
    // After the first frame, one more: the first frames are the slowest of
    // the app's life — seconds apart on a debug build — and a clock started
    // before them ran out unseen, so all anyone saw was the trolley leaving.
    SchedulerBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _kick = Timer(_kickAfter, _go);
      SchedulerBinding.instance.addPostFrameCallback((_) => _go());
      SchedulerBinding.instance.scheduleFrame();
    });
  }

  /// Starts the timeline, once.
  ///
  /// Nothing here waits on a future. An earlier version waited on the end of a
  /// frame and on the trolley's picture being parsed, and on a phone one of
  /// those never came: the clock never started, the trolley stayed off screen
  /// and the name stayed transparent, and the splash was an empty white page
  /// until the gate's failsafe took it down. The picture is parsed from
  /// main() anyway, and draws itself the moment it is ready if it is late.
  void _go() {
    _kick?.cancel();
    if (!mounted || _controller.isAnimating || _controller.value > 0) return;
    _controller.forward();
  }

  /// If even the second frame does not come, start regardless.
  Timer? _kick;
  static const Duration _kickAfter = Duration(seconds: 1);

  @override
  void dispose() {
    _kick?.cancel();
    // CurvedAnimation holds a listener on its parent; leaving these undisposed
    // leaks one per launch.
    for (final stage in [
      _artIn,
      _nameIn,
      _taglineIn,
      _taglineOut,
      _artOut,
      _nameOut,
    ]) {
      stage.dispose();
    }
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context)!;
    final size = MediaQuery.sizeOf(context);

    // Honoured by dropping the movement, not by dropping the splash. Someone
    // who asked for less motion still needs to see the app start.
    final still = AppMotion.reduced(context);

    final artWidth = (size.width * 0.66).clamp(200.0, 300.0);
    // Far enough that the trolley starts and ends wholly off screen.
    final travel = size.width / 2 + artWidth / 2 + 16;

    return ColoredBox(
      color: palette.groupedBackground,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.only(bottom: 48),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _Glide(
                arrive: _artIn,
                leave: _artOut,
                from: still ? 0 : -travel,
                to: still ? 0 : travel,
                fadeWhenStill: still,
                child: Illustration(Art.splashCart, width: artWidth),
              ),
              const SizedBox(height: AppSpacing.xl),
              _BlurAway(
                arrive: _nameIn,
                leave: _nameOut,
                still: still,
                child: const Wordmark(size: 42),
              ),
              const SizedBox(height: AppSpacing.sm),
              FadeTransition(
                opacity: _taglineIn,
                child: FadeTransition(
                  opacity: ReverseAnimation(_taglineOut),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.xxl,
                    ),
                    child: Text(
                      l10n.splashTagline,
                      textAlign: TextAlign.center,
                      style: AppText.subhead.copyWith(
                        color: palette.secondaryLabel,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Slides in from [from] as [arrive] runs and out to [to] as [leave] runs,
/// in logical pixels along the x axis.
///
/// With motion reduced both distances are zero and the child fades instead,
/// so the sequence still has a beginning and an end.
class _Glide extends StatelessWidget {
  const _Glide({
    required this.arrive,
    required this.leave,
    required this.from,
    required this.to,
    required this.fadeWhenStill,
    required this.child,
  });

  final Animation<double> arrive;
  final Animation<double> leave;
  final double from;
  final double to;
  final bool fadeWhenStill;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    Widget result = AnimatedBuilder(
      animation: Listenable.merge([arrive, leave]),
      child: child,
      builder: (context, child) {
        final dx = from * (1 - arrive.value) + to * leave.value;
        return Transform.translate(offset: Offset(dx, 0), child: child);
      },
    );
    if (fadeWhenStill) {
      result = FadeTransition(
        opacity: arrive,
        child: FadeTransition(opacity: ReverseAnimation(leave), child: result),
      );
    }
    return result;
  }
}

/// Fades the name in, then fades it out while it drifts right and blurs — the
/// reference's name leaves as though left behind by the trolley's speed.
class _BlurAway extends StatelessWidget {
  const _BlurAway({
    required this.arrive,
    required this.leave,
    required this.still,
    required this.child,
  });

  final Animation<double> arrive;
  final Animation<double> leave;
  final bool still;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    Widget moving = child;
    if (!still) {
      moving = AnimatedBuilder(
        animation: leave,
        child: child,
        builder: (context, child) {
          final t = leave.value;
          if (t == 0) return child!;
          final sigma = 6 * t;
          return Transform.translate(
            offset: Offset(28 * t, 0),
            child: ImageFiltered(
              imageFilter: ui.ImageFilter.blur(sigmaX: sigma, sigmaY: sigma),
              child: child,
            ),
          );
        },
      );
    }
    return FadeTransition(
      opacity: arrive,
      child: FadeTransition(opacity: ReverseAnimation(leave), child: moving),
    );
  }
}

/// Whether the splash has finished, for the screen underneath it.
///
/// [SplashGate] builds the app from the first frame — the providers behind it
/// have to start — so the screen it lands on is laid out before anyone can
/// see it. A screen with an entrance of its own reads this to start that
/// entrance when the splash leaves rather than while it is still covered.
class SplashStatus extends InheritedNotifier<ValueNotifier<bool>> {
  const SplashStatus({
    super.key,
    required ValueNotifier<bool> done,
    required super.child,
  }) : super(notifier: done);

  /// True when there is no splash above [context], or it has finished.
  static bool isDone(BuildContext context) {
    final status = context.dependOnInheritedWidgetOfExactType<SplashStatus>();
    return status?.notifier?.value ?? true;
  }
}
