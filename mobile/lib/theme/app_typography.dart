import 'package:flutter/material.dart';

/// The iOS type scale, on Inter.
///
/// Apple's sizes and weights, not approximations of them. The scale is short on
/// purpose — seven steps for the whole app — because the previous screens each
/// invented their own (`fontSize: 15`, `17`, `20`, `13`, `11`) and the result
/// had no hierarchy an eye could follow.
///
/// Sizes stay fixed rather than scaling with the device text setting; the
/// framework applies the user's scale factor on top, which is the behaviour to
/// want in a lab where phones are handled with gloves.
abstract final class AppText {
  static const String family = 'Inter';

  /// Sample codes and anything compared character by character against a
  /// printed label.
  ///
  /// Deliberately still the platform generic. This app ships as an Android APK,
  /// where `monospace` resolves to Roboto Mono — a good mono that costs nothing
  /// to bundle. Shipping a second family for a platform we do not target would
  /// have added more weight than Inter itself.
  static const String monoFamily = 'monospace';

  /// Tight tracking on the big sizes is what makes large type read as iOS
  /// rather than as a heading in a browser.
  static const TextStyle largeTitle = TextStyle(
    fontFamily: family,
    fontSize: 34,
    height: 41 / 34,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.4,
  );

  static const TextStyle title1 = TextStyle(
    fontFamily: family,
    fontSize: 28,
    height: 34 / 28,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.3,
  );

  static const TextStyle title2 = TextStyle(
    fontFamily: family,
    fontSize: 22,
    height: 28 / 22,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.2,
  );

  /// Row titles and anything that leads a group.
  static const TextStyle headline = TextStyle(
    fontFamily: family,
    fontSize: 17,
    height: 22 / 17,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.1,
  );

  /// The default. iOS body text is 17, which is larger than most Android
  /// defaults and is the single biggest reason iOS screens feel roomy.
  static const TextStyle body = TextStyle(
    fontFamily: family,
    fontSize: 17,
    height: 22 / 17,
    fontWeight: FontWeight.w400,
    letterSpacing: -0.1,
  );

  static const TextStyle subhead = TextStyle(
    fontFamily: family,
    fontSize: 15,
    height: 20 / 15,
    fontWeight: FontWeight.w400,
  );

  /// Help lines, timestamps, and the uppercase headers over a grouped section.
  static const TextStyle footnote = TextStyle(
    fontFamily: family,
    fontSize: 13,
    height: 18 / 13,
    fontWeight: FontWeight.w400,
  );

  static const TextStyle caption = TextStyle(
    fontFamily: family,
    fontSize: 12,
    height: 16 / 12,
    fontWeight: FontWeight.w400,
  );

  /// Maps the scale onto the slots Flutter's own widgets read, so a stray
  /// `Text` with no explicit style still lands somewhere sensible.
  static TextTheme themeFor(Color label) {
    return TextTheme(
      displayLarge: largeTitle.copyWith(color: label),
      headlineLarge: largeTitle.copyWith(color: label),
      headlineMedium: title1.copyWith(color: label),
      headlineSmall: title2.copyWith(color: label),
      titleLarge: title2.copyWith(color: label),
      titleMedium: headline.copyWith(color: label),
      titleSmall: headline.copyWith(color: label),
      bodyLarge: body.copyWith(color: label),
      bodyMedium: body.copyWith(color: label),
      bodySmall: footnote.copyWith(color: label),
      labelLarge: headline.copyWith(color: label),
      labelMedium: subhead.copyWith(color: label),
      labelSmall: caption.copyWith(color: label),
    );
  }
}
