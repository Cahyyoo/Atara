import 'dart:math' as math;

import 'package:flutter/cupertino.dart';

/// The circular border guide showing where a face should sit.
///
/// Drawn as a true circle (not an oval) so the camera overlay provides a clean,
/// round framing boundary.
class FaceGuidePainter extends CustomPainter {
  const FaceGuidePainter({
    required this.isGood,
    required this.accentColor,
    this.circleFraction = 0.74,
  });

  final bool isGood;
  final Color accentColor;
  final double circleFraction;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final diameter = math.min(size.width, size.height) * circleFraction;
    final radius = diameter / 2;
    final circleRect = Rect.fromCircle(center: center, radius: radius);

    // Everything outside the circle is dimmed with a dark scrim.
    final scrimPath = Path()
      ..addRect(Rect.fromLTWH(0, 0, size.width, size.height))
      ..addOval(circleRect)
      ..fillType = PathFillType.evenOdd;

    final scrimPaint = Paint()
      ..color = const Color(0x66000000)
      ..style = PaintingStyle.fill;
    canvas.drawPath(scrimPath, scrimPaint);

    // Circular outline: green/accent when good, semi-transparent white otherwise.
    final strokePaint = Paint()
      ..color = isGood ? accentColor : const Color(0xB3FFFFFF)
      ..style = PaintingStyle.stroke
      ..strokeWidth = isGood ? 3.5 : 2.5;

    canvas.drawCircle(center, radius, strokePaint);
  }

  @override
  bool shouldRepaint(FaceGuidePainter oldDelegate) =>
      oldDelegate.isGood != isGood ||
      oldDelegate.accentColor != accentColor ||
      oldDelegate.circleFraction != circleFraction;
}
