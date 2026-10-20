import 'package:flutter/widgets.dart';

import '../../theme/app_motion.dart';

/// Fades [child] in while it travels [offset] back to its place, driven by
/// [animation] running 0 → 1.
///
/// The building block of every entrance in the app. Driven from outside so
/// one controller can choreograph a whole screen through [Interval]s, which
/// is how the reference's sequences stay in step.
///
/// With animations disabled the travel is dropped and the fade kept — the
/// house rule in [AppMotion.reduced].
class Reveal extends StatelessWidget {
  const Reveal({
    super.key,
    required this.animation,
    required this.child,
    this.offset = const Offset(0, AppMotion.rise),
    this.scale,
  });

  final Animation<double> animation;
  final Widget child;

  /// Where [child] starts from, relative to where it rests, in pixels.
  final Offset offset;

  /// Optional starting scale (e.g. 0.96) that grows to 1 with the fade.
  final double? scale;

  @override
  Widget build(BuildContext context) {
    final reduced = AppMotion.reduced(context);
    Widget result = child;
    if (!reduced && (offset != Offset.zero || scale != null)) {
      result = AnimatedBuilder(
        animation: animation,
        child: child,
        builder: (context, child) {
          final t = animation.value;
          final dx = offset.dx * (1 - t);
          final dy = offset.dy * (1 - t);
          Widget moved = Transform.translate(
            offset: Offset(dx, dy),
            child: child,
          );
          if (scale != null) {
            moved = Transform.scale(
              scale: scale! + (1 - scale!) * t,
              child: moved,
            );
          }
          return moved;
        },
      );
    }
    return FadeTransition(opacity: animation, child: result);
  }
}

/// A [Reveal] that plays itself once, [delay] after it first appears.
///
/// For entrances that belong to one widget rather than to a choreographed
/// screen: a card arriving in a list, a banner on a sub-page.
class EnterReveal extends StatefulWidget {
  const EnterReveal({
    super.key,
    required this.child,
    this.delay = Duration.zero,
    this.duration = AppMotion.base,
    this.offset = const Offset(0, AppMotion.rise),
    this.scale,
    this.curve = AppMotion.enter,
  });

  final Widget child;
  final Duration delay;
  final Duration duration;
  final Offset offset;
  final double? scale;
  final Curve curve;

  @override
  State<EnterReveal> createState() => _EnterRevealState();
}

class _EnterRevealState extends State<EnterReveal>
    with SingleTickerProviderStateMixin {
  // The delay is the front of the controller's own run rather than a timer:
  // a pending Future.delayed outlives a widget test and fails it.
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: widget.delay + widget.duration,
    // Timing is kept with animations disabled; Reveal drops the travel.
    animationBehavior: AnimationBehavior.preserve,
  )..forward();
  late final Animation<double> _curved = CurvedAnimation(
    parent: _controller,
    curve: Interval(
      widget.delay.inMicroseconds /
          (widget.delay + widget.duration).inMicroseconds,
      1,
      curve: widget.curve,
    ),
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Reveal(
      animation: _curved,
      offset: widget.offset,
      scale: widget.scale,
      child: widget.child,
    );
  }
}

/// Reveals [children] one after another, [AppMotion.stagger] apart, as a
/// column. Plays once on first build.
///
/// The reference's form and section entrances: each line arrives a beat
/// after the one above it.
class StaggeredColumn extends StatefulWidget {
  const StaggeredColumn({
    super.key,
    required this.children,
    this.crossAxisAlignment = CrossAxisAlignment.stretch,
    this.initialDelay = Duration.zero,
    this.itemDuration = AppMotion.base,
    this.animation,
  });

  final List<Widget> children;
  final CrossAxisAlignment crossAxisAlignment;
  final Duration initialDelay;
  final Duration itemDuration;

  /// Drive the column from outside instead of playing on mount. The children
  /// are spread across the whole of it.
  final Animation<double>? animation;

  @override
  State<StaggeredColumn> createState() => _StaggeredColumnState();
}

class _StaggeredColumnState extends State<StaggeredColumn>
    with SingleTickerProviderStateMixin {
  AnimationController? _controller;

  Duration get _run =>
      widget.itemDuration +
      AppMotion.stagger * (widget.children.length - 1).clamp(0, 1 << 20);

  @override
  void initState() {
    super.initState();
    if (widget.animation == null) {
      _controller = AnimationController(
        vsync: this,
        duration: widget.initialDelay + _run,
        animationBehavior: AnimationBehavior.preserve,
      )..forward();
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final count = widget.children.length;
    final Animation<double> parent;
    final double begin;
    if (widget.animation != null) {
      parent = widget.animation!;
      begin = 0;
    } else {
      parent = _controller!;
      begin =
          widget.initialDelay.inMicroseconds /
          (widget.initialDelay + _run).inMicroseconds;
    }
    final share = count <= 1
        ? 1.0
        : widget.itemDuration.inMicroseconds / _run.inMicroseconds;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: widget.crossAxisAlignment,
      children: [
        for (var i = 0; i < count; i++)
          Reveal(
            animation: CurvedAnimation(
              parent: parent,
              curve: AppMotion.staggered(i, count, begin: begin, share: share),
            ),
            child: widget.children[i],
          ),
      ],
    );
  }
}

/// One screen-wide entrance, handed down to the parts of a screen that take
/// their cue from it.
///
/// Home arrives as one choreography — chips, then the header's words, then
/// the banner, then the sections, then the tab bar — but those live in
/// different widgets. The shell owns the controller; each part reads it here
/// and takes its own [Interval] of it.
///
/// Absent, a part reads a finished animation and simply shows.
class EntranceScope extends InheritedWidget {
  const EntranceScope({
    super.key,
    required this.animation,
    required super.child,
  });

  final Animation<double> animation;

  static Animation<double> of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<EntranceScope>()?.animation ??
      kAlwaysCompleteAnimation;

  /// [of], narrowed to [interval] and curved.
  static Animation<double> slice(
    BuildContext context,
    double begin,
    double end, {
    Curve curve = AppMotion.enter,
  }) => CurvedAnimation(
    parent: of(context),
    curve: Interval(begin, end, curve: curve),
  );

  @override
  bool updateShouldNotify(EntranceScope oldWidget) =>
      animation != oldWidget.animation;
}
