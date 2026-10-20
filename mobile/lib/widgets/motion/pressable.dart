import 'package:flutter/widgets.dart';

import '../../theme/app_motion.dart';

/// Answers a touch the way the reference's cards and tiles do: they give a
/// little under the finger, and spring back.
///
/// A plain implicit scale only moved while the finger was down. A quick tap
/// is down and up inside one frame, and the page it opened was pushed in that
/// same frame, so the press was never seen and the card seemed to vanish.
/// Here a tap always plays the press: the card goes down, [onTap] runs once it
/// has, and it comes back up while the next page slides in.
///
/// With motion reduced the card does not shrink; it only dims.
class Pressable extends StatefulWidget {
  const Pressable({
    super.key,
    required this.onTap,
    required this.child,
    this.scale = 0.96,
    this.semanticLabel,
  });

  final VoidCallback? onTap;
  final Widget child;

  /// How far it gives. Small things (icon buttons) give more.
  final double scale;

  final String? semanticLabel;

  @override
  State<Pressable> createState() => _PressableState();
}

class _PressableState extends State<Pressable>
    with SingleTickerProviderStateMixin {
  static const Duration _down = Duration(milliseconds: 90);
  static const Duration _up = Duration(milliseconds: 160);

  // preserve: the press keeps its timing when the platform asks for less
  // motion; the shrink is dropped in build instead.
  late final AnimationController _press = AnimationController(
    vsync: this,
    duration: _down,
    reverseDuration: _up,
    animationBehavior: AnimationBehavior.preserve,
  );

  late final Animation<double> _curved = CurvedAnimation(
    parent: _press,
    curve: Curves.easeOut,
  );
  late final Animation<double> _opacity = Tween<double>(
    begin: 1,
    end: 0.85,
  ).animate(_curved);

  /// Set while a tap is being played out, so a second tap inside it cannot
  /// open the same page twice.
  bool _tapping = false;

  @override
  void dispose() {
    _press.dispose();
    super.dispose();
  }

  void _pressDown() {
    if (!_tapping) _press.forward();
  }

  void _release() {
    if (!_tapping) _press.reverse();
  }

  Future<void> _tap() async {
    final onTap = widget.onTap;
    if (onTap == null || _tapping) return;
    _tapping = true;
    try {
      // Finish going down first, however brief the touch was.
      await _press.forward().orCancel;
    } on TickerCanceled {
      return;
    }
    if (!mounted) return;
    onTap();
    if (!mounted) return;
    _tapping = false;
    _press.reverse();
  }

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onTap != null;
    final reduced = AppMotion.reduced(context);
    Widget body = FadeTransition(opacity: _opacity, child: widget.child);
    if (!reduced) {
      body = ScaleTransition(
        scale: Tween<double>(begin: 1, end: widget.scale).animate(_curved),
        child: body,
      );
    }

    return Semantics(
      button: true,
      enabled: enabled,
      label: widget.semanticLabel,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: enabled ? _tap : null,
        onTapDown: enabled ? (_) => _pressDown() : null,
        onTapCancel: enabled ? _release : null,
        child: body,
      ),
    );
  }
}
