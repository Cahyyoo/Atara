import 'package:flutter/widgets.dart';

import '../theme/app_theme.dart';

/// The grey stand-ins a screen shows while its content is on the way.
///
/// A spinner in the middle of an empty page says "something is happening"; it
/// does not say what, or how much of it. These say both, and because they are
/// laid out to the real thing's measurements the page does not jump when the
/// data lands.
///
/// Always [AppColors.field] on [AppColors.cardBackground] — 1.17:1 in light
/// and 1.19:1 in dark, near-symmetric, so a placeholder does not feel heavier
/// in one appearance than the other. This was [AppColors.fill] until that
/// token was corrected to the web's `--secondary`, which is 1.09:1 on a white
/// card: present without being visible.
///
/// On `groupedBackground` any of these greys is about 1.07:1 in light, which
/// is nothing at all — that is why every skeleton below belongs inside a real
/// `InsetSection`, which paints the card for it.
class SkeletonBar extends StatelessWidget {
  const SkeletonBar({super.key, required this.width, this.height = 14});

  final double width;
  final double height;

  @override
  Widget build(BuildContext context) => _SkeletonShape(
        width: width,
        height: height,
        radius: BorderRadius.circular(height / 2),
      );
}

class SkeletonCircle extends StatelessWidget {
  const SkeletonCircle({super.key, required this.size});

  final double size;

  @override
  Widget build(BuildContext context) => _SkeletonShape(
        width: size,
        height: size,
        radius: BorderRadius.circular(size / 2),
      );
}

/// A capsule the size of an [AppBadge], for the stage tallies.
class SkeletonBadge extends StatelessWidget {
  const SkeletonBadge({super.key, required this.width});

  final double width;

  @override
  Widget build(BuildContext context) => _SkeletonShape(
        width: width,
        height: 22,
        radius: BorderRadius.circular(AppRadius.sm),
      );
}

/// The pulse, and the only repeating animation in the app.
///
/// Opacity rather than a gradient sweep: the house rule keeps gradients to the
/// splash and the guide, and a shimmer would break it for no gain. The pulse
/// stops entirely when the platform asks for less motion — which is also what
/// keeps `pumpAndSettle` usable in tests, since a forever-repeating animation
/// never lets it settle.
class _SkeletonShape extends StatefulWidget {
  const _SkeletonShape({
    required this.width,
    required this.height,
    required this.radius,
  });

  final double width;
  final double height;
  final BorderRadius radius;

  @override
  State<_SkeletonShape> createState() => _SkeletonShapeState();
}

class _SkeletonShapeState extends State<_SkeletonShape>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    duration: const Duration(milliseconds: 900),
    vsync: this,
  );

  late final Animation<double> _pulse = Tween<double>(begin: 1, end: 0.55)
      .animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));

  bool _running = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final shouldRun = !MediaQuery.disableAnimationsOf(context);
    if (shouldRun == _running) return;
    _running = shouldRun;
    if (shouldRun) {
      _controller.repeat(reverse: true);
    } else {
      _controller.stop();
      _controller.value = 0;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // FadeTransition rather than a builder: its render object subscribes to
    // the animation itself and only updates the layer's alpha, so a page full
    // of these never enters the build phase.
    return FadeTransition(
      opacity: _pulse,
      child: SizedBox(
        width: widget.width,
        height: widget.height,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: context.palette.field,
            borderRadius: widget.radius,
          ),
        ),
      ),
    );
  }
}
