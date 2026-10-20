import 'package:flutter/material.dart';

/// The type scale, on Plus Jakarta Sans.
///
/// Apple's sizes, kept from the previous scale so every screen keeps its
/// hierarchy; the face is the geometric sans the redesign reference is set in.
/// The scale is short on purpose — eight steps for the whole app — because the
/// earliest screens each invented their own (`fontSize: 15`, `17`, `20`, `13`,
/// `11`) and the result had no hierarchy an eye could follow.
///
/// Headings are bolder and tighter than iOS's own, which is the reference's
/// look: "Welcome Back" and "Categories" are heavy and close-set.
///
/// Sizes stay fixed rather than scaling with the device text setting; the
/// framework applies the user's scale factor on top, which is the behaviour to
/// want in a lab where phones are handled with gloves.
abstract final class AppText {
  static const String family = 'PlusJakartaSans';

  /// Sample codes and anything compared character by character against a
  /// printed label.
  ///
  /// Deliberately still the platform generic. This app ships as an Android APK,
  /// where `monospace` resolves to Roboto Mono — a good mono that costs nothing
  /// to bundle.
  static const String monoFamily = 'monospace';

  static const TextStyle largeTitle = TextStyle(
    fontFamily: family,
    fontSize: 32,
    height: 40 / 32,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.6,
  );

  /// "Welcome Back", the wordmark on a header.
  static const TextStyle title1 = TextStyle(
    fontFamily: family,
    fontSize: 26,
    height: 32 / 26,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.5,
  );

  static const TextStyle title2 = TextStyle(
    fontFamily: family,
    fontSize: 21,
    height: 27 / 21,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.3,
  );

  /// Row titles and section headings ("Categories", "Order again").
  static const TextStyle headline = TextStyle(
    fontFamily: family,
    fontSize: 17,
    height: 22 / 17,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.2,
  );

  /// The default.
  static const TextStyle body = TextStyle(
    fontFamily: family,
    fontSize: 16,
    height: 22 / 16,
    fontWeight: FontWeight.w500,
    letterSpacing: -0.1,
  );

  static const TextStyle subhead = TextStyle(
    fontFamily: family,
    fontSize: 14,
    height: 20 / 14,
    fontWeight: FontWeight.w500,
  );

  /// Help lines, timestamps, card subtitles.
  static const TextStyle footnote = TextStyle(
    fontFamily: family,
    fontSize: 13,
    height: 18 / 13,
    fontWeight: FontWeight.w500,
  );

  static const TextStyle caption = TextStyle(
    fontFamily: family,
    fontSize: 12,
    height: 16 / 12,
    fontWeight: FontWeight.w500,
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
