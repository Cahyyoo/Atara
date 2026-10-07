import 'package:flutter/widgets.dart';

import '../theme/app_theme.dart';

/// The Atara mountain, drawn from the same outline the web uses.
///
/// The web renders lucide's `mountain`, whose path on a 24-unit square is
/// `m8 3 4 8 5-5 5 15H2L8 3z`, stroked rather than filled. Material's own
/// mountain glyph is a solid shape, so reaching for it left the phone showing a
/// different mark from the dashboard and from the launcher icon. The five
/// points below are that path, and the stroke is what makes it read as a
/// mountain rather than a triangle.
class BrandGlyph extends StatelessWidget {
  const BrandGlyph({
    super.key,
    required this.size,
    required this.color,
    this.progress = 1,
  });

  final double size;
  final Color color;

  /// How much of the outline to draw, 0 to 1.
  ///
  /// The splash walks this from 0 to 1 so the mountain draws itself. It lives
  /// here rather than in a second painter because the five points below are
  /// also the launcher icon and the web's mark; a copy of them would drift.
  final double progress;

  @override
  Widget build(BuildContext context) {
    return SizedBox.square(
      dimension: size,
      child: CustomPaint(painter: _MountainPainter(color, progress)),
    );
  }
}

class _MountainPainter extends CustomPainter {
  const _MountainPainter(this.color, this.progress);

  final Color color;
  final double progress;

  /// lucide draws on a 24-unit square with a 2-unit stroke.
  static const _viewBox = 24.0;
  static const _strokeWidth = 2.0;
  static const _points = [
    Offset(8, 3),
    Offset(12, 11),
    Offset(17, 6),
    Offset(22, 21),
    Offset(2, 21),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / _viewBox;

    final path = Path()..moveTo(_points.first.dx * scale, _points.first.dy * scale);
    for (final point in _points.skip(1)) {
      path.lineTo(point.dx * scale, point.dy * scale);
    }
    path.close();

    canvas.drawPath(
      progress >= 1 ? path : _partial(path, progress),
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = _strokeWidth * scale
        ..strokeJoin = StrokeJoin.round
        ..strokeCap = StrokeCap.round,
    );
  }

  /// The first [fraction] of the outline, measured along its length.
  ///
  /// One metric covers the whole thing: the path is closed, so the segment
  /// back up to the peak is part of the same contour and the stroke arrives
  /// where it started.
  static Path _partial(Path path, double fraction) {
    final metric = path.computeMetrics().first;
    return metric.extractPath(0, metric.length * fraction.clamp(0.0, 1.0));
  }

  @override
  bool shouldRepaint(_MountainPainter oldDelegate) =>
      // progress, not just colour: without it the draw-on animation would set
      // a new value every frame and repaint on none of them.
      oldDelegate.color != color || oldDelegate.progress != progress;
}

/// The brand mark as the web's sign-in header sets it: the mountain in the
/// brand teal, on a tenth-opacity teal ground with a hairline ring.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 76});

  final double size;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: palette.accentTint,
        // The iOS app-icon curve, not a circle and not a plain rounded box.
        borderRadius: BorderRadius.circular(size * 0.24),
        border: Border.all(color: palette.accentRing),
      ),
      child: BrandGlyph(size: size * 0.5, color: palette.accent),
    );
  }
}
