import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';

import 'package:atara/theme/app_colors.dart';

/// Guards the relationships in the palette, not its values.
///
/// Asserting the hexes here would only restate them. What a test can hold is
/// the thing a re-colour can quietly break: a skeleton that stops being
/// visible on its card, a grey that slips under AA, white text drifting onto
/// the light end of a gradient.

/// WCAG relative luminance.
double _luminance(Color c) {
  double channel(double v) =>
      v <= 0.04045 ? v / 12.92 : math.pow((v + 0.055) / 1.055, 2.4).toDouble();
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/// [a] and [b] must both be opaque; use [_over] first if either is not.
double contrast(Color a, Color b) {
  final la = _luminance(a);
  final lb = _luminance(b);
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
}

/// Flattens a translucent colour onto an opaque one, which is what the screen
/// does and what a naive contrast check forgets.
Color _over(Color fg, Color bg) {
  final a = fg.a;
  return Color.from(
    alpha: 1,
    red: fg.r * a + bg.r * (1 - a),
    green: fg.g * a + bg.g * (1 - a),
    blue: fg.b * a + bg.b * (1 - a),
  );
}

void main() {
  const appearances = {'light': AppColors.light, 'dark': AppColors.dark};

  group('text stays readable', () {
    for (final entry in appearances.entries) {
      final name = entry.key;
      final p = entry.value;

      test('$name: body and secondary text clear AA on both surfaces', () {
        for (final ground in [p.groupedBackground, p.cardBackground]) {
          expect(contrast(p.label, ground), greaterThanOrEqualTo(4.5));
          expect(contrast(p.secondaryLabel, ground), greaterThanOrEqualTo(4.5));
        }
      });

      test('$name: secondary text clears AA inside a text field', () {
        // The pairing the web raised --muted-foreground for: at #737373 it
        // read 4.03:1 here, just under.
        expect(
          contrast(p.secondaryLabel, p.field),
          greaterThanOrEqualTo(4.5),
        );
      });

      test('$name: the status tones are legible on their own fills', () {
        final tones = {
          'success': p.success,
          'warning': p.warning,
          'info': p.info,
        };
        tones.forEach((label, tone) {
          final ground = _over(tone.background, p.cardBackground);
          expect(
            contrast(tone.onBackground, ground),
            greaterThanOrEqualTo(4.5),
            reason: '$name $label badge text on its own background',
          );
        });
      });
    }
  });

  group('surfaces stay distinguishable', () {
    for (final entry in appearances.entries) {
      final name = entry.key;
      final p = entry.value;

      test('$name: a card is visible against the page behind it', () {
        expect(
          contrast(p.cardBackground, p.groupedBackground),
          greaterThan(1.02),
          reason: 'an inset grouped list needs the two to differ or the '
              'cards vanish',
        );
      });

      test('$name: a skeleton is visible on the card it sits in', () {
        // The regression this file exists for. Both appearances have to land
        // in the same band, or a placeholder feels heavier in one theme.
        final ratio = contrast(p.field, p.cardBackground);
        expect(ratio, greaterThanOrEqualTo(1.12));
        expect(ratio, lessThanOrEqualTo(1.30));
      });

      test('$name: white stays legible where the header writes it', () {
        // The header runs out to lime, which no white text could sit on. Its
        // title and subtitle live in the top-left and never reach past 45% of
        // the diagonal; the illustration owns the rest.
        for (final t in [0.0, 0.15, 0.3, 0.45]) {
          expect(
            contrast(p.onHero, p.heroAt(t)),
            greaterThanOrEqualTo(4.5),
            reason: '$name header at $t',
          );
        }
      });

      test('$name: a filled button label is legible where it sits', () {
        // The label is centred; the longest one spans about the middle fifth
        // of a full-width button.
        for (final t in [0.4, 0.5, 0.6]) {
          expect(
            contrast(p.onAccent, p.primaryAt(t)),
            greaterThanOrEqualTo(4.5),
            reason: '$name button at $t',
          );
        }
      });

      test('$name: brand green text reads on the page and on a card', () {
        expect(contrast(p.accent, p.groupedBackground), greaterThanOrEqualTo(4.5));
        expect(contrast(p.accent, p.cardBackground), greaterThanOrEqualTo(4.5));
      });
    }
  });

  test('every appearance defines every colour', () {
    // lerp runs for real on a theme switch, and a field left out of it makes
    // the surface flash mid-transition. This catches one added to the class
    // and forgotten in lerp.
    final mid = AppColors.light.lerp(AppColors.dark, 0.5);
    expect(mid.field, isNot(AppColors.light.field));
    expect(mid.primaryGradientStart, isNot(AppColors.light.primaryGradientStart));
    expect(mid.groupedBackground, isNot(AppColors.light.groupedBackground));
  });
}
