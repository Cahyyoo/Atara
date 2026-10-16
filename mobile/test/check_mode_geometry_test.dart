import 'package:flutter_test/flutter_test.dart';

import 'package:atara/widgets/check_mode_geometry.dart';

/// The scanner's check mode keeps its answer card just above the frame and
/// centres the pair between the bar and the controls — on every phone size.
void main() {
  // Height of the screen, and where the navigation bar ends on it.
  const phones = {
    'Android 360×640': (640.0, 68.0),
    'iPhone 390×844': (844.0, 91.0),
    'Android 412×915': (915.0, 80.0),
  };

  phones.forEach((name, size) {
    final (height, topInset) = size;
    final g = checkModeGeometry(height: height, topInset: topInset);
    final top = topInset + kCheckTopMargin;
    final bottom = height - kCheckControlsReserve;

    group(name, () {
      test('keeps the card out from under the bar', () {
        expect(g.slotTop, greaterThanOrEqualTo(top));
      });

      test('keeps the frame clear of the controls', () {
        expect(g.frameBottom, lessThanOrEqualTo(bottom));
      });

      test('puts the card right against the frame', () {
        expect(g.frameTop - (g.slotTop + g.slotHeight), kCheckGap);
      });

      test('gives the card its full slot and a frame of a useful size', () {
        expect(g.slotHeight, kCheckSlotHeight);
        expect(g.frameSize, greaterThanOrEqualTo(150));
      });

      test('centres the pair between the bar and the controls', () {
        expect(g.slotTop - top, closeTo(bottom - g.frameBottom, 0.5));
      });
    });
  });

  test('on a tall phone the pair sits mid-screen, not at the top', () {
    final g = checkModeGeometry(height: 915, topInset: 80);
    expect(g.slotTop, greaterThan(150));
  });

  test('on a very short screen the slot shrinks rather than overlap', () {
    final g = checkModeGeometry(height: 480, topInset: 68);
    expect(g.slotTop, greaterThanOrEqualTo(68 + kCheckTopMargin));
    expect(g.frameBottom, lessThanOrEqualTo(480 - kCheckControlsReserve + 0.5));
    expect(g.slotHeight, lessThan(kCheckSlotHeight));
  });
}
