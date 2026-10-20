import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import 'app_colors.dart';
import 'app_typography.dart';

export 'app_colors.dart' show AppColors, ToneColors;
export 'app_typography.dart' show AppText;

/// One vertical and horizontal rhythm for the whole app.
///
/// Spacing used to be written in place, and drifted: 2, 4, 6, 8, 10, 12, 14,
/// 16, 20, 24, 32 and 40 all appeared, often within one column. Snapping to a
/// scale is what makes unrelated screens look like the same product.
abstract final class AppSpacing {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 32;

  /// The gutter every full screen uses. iOS insets grouped content by 16.
  static const EdgeInsets page = EdgeInsets.all(lg);
}

abstract final class AppRadius {
  /// Badges and small chips.
  static const double sm = 10;

  /// Icon tiles and inner blocks inside a card.
  static const double md = 14;

  /// The cards that carry almost every row — the reference's soft 18.
  static const double lg = 18;

  /// Sheets, dialogs, the home banner.
  static const double xl = 24;

  /// The bottom corners of a green header.
  static const double header = 28;

  /// Text fields: a pill at their 52 height.
  static const double field = 26;

  /// Buttons, capsules: always fully round, whatever their height.
  static const double pill = 999;
}

/// Shorthand for the lookups nearly every widget here needs.
///
/// Spelling out `Theme.of(context).colorScheme.primary` three times in one
/// build method buries the layout it is meant to describe.
extension AppThemeContext on BuildContext {
  TextTheme get texts => Theme.of(this).textTheme;

  /// Falls back to the light palette rather than asserting.
  ///
  /// These are constants, not data a theme must supply, and a widget built
  /// under a plain [MaterialApp] — a test, a preview, a screen embedded
  /// somewhere new — should render rather than throw a null check.
  AppColors get palette => Theme.of(this).extension<AppColors>() ?? AppColors.light;

  bool get isDark => Theme.of(this).brightness == Brightness.dark;
}

class AppTheme {
  /// The brand green, for the places outside the widget tree that need it —
  /// the launcher icon, a platform channel. Read from the palette rather than
  /// written out again, so it cannot go stale.
  static final Color brand = AppColors.light.accent;

  /// Built once, not per rebuild.
  ///
  /// These were getters, and the root widget watches the locale — so changing
  /// language rebuilt two whole ThemeData and ran the HCT tonal-palette solver
  /// inside ColorScheme.fromSeed twice, to swap a Locale.
  static final ThemeData light = _build(AppColors.light, Brightness.light);
  static final ThemeData dark = _build(AppColors.dark, Brightness.dark);

  static ThemeData _build(AppColors palette, Brightness brightness) {
    final scheme = ColorScheme.fromSeed(
      seedColor: palette.accent,
      brightness: brightness,
    ).copyWith(
      primary: palette.accent,
      surface: palette.cardBackground,
      error: palette.danger.foreground,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: palette.groupedBackground,
      canvasColor: palette.groupedBackground,
      extensions: [palette],
      fontFamily: AppText.family,
      textTheme: AppText.themeFor(palette.label),
      // iOS transitions on every platform, deliberately. This ships as an
      // Android APK, and the horizontal slide is half of what makes the app
      // read as iOS — it also brings the swipe-from-the-left-edge gesture,
      // which Android's own back button then complements rather than replaces.
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: CupertinoPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.fuchsia: CupertinoPageTransitionsBuilder(),
          TargetPlatform.linux: CupertinoPageTransitionsBuilder(),
          TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.windows: CupertinoPageTransitionsBuilder(),
        },
      ),
      // Nothing in this design uses a ripple: iOS answers a touch by dimming
      // what was touched, and a spreading ink circle is the single clearest
      // tell that an interface was built with Material.
      splashFactory: NoSplash.splashFactory,
      highlightColor: Colors.transparent,
      splashColor: Colors.transparent,
      dividerTheme: DividerThemeData(
        color: palette.separator,
        space: 0,
        thickness: 0.5,
      ),
      cupertinoOverrideTheme: CupertinoThemeData(
        brightness: brightness,
        primaryColor: palette.accent,
        scaffoldBackgroundColor: palette.groupedBackground,
        barBackgroundColor: palette.cardBackground,
        // Every nav-bar style is set, and navActionTextStyle is the one that
        // matters most even though it is the least visible.
        //
        // It was the only one left unset, so it fell through to Cupertino's own
        // default -- CupertinoSystemText, letterSpacing -0.41, and critically
        // `inherit: false`, where every AppText style here is `inherit: true`.
        // A nav bar transition morphs the outgoing route's title into the
        // incoming route's back label, which means TextStyle.lerp got one style
        // of each kind, and lerping across `inherit` is an ASSERTION failure:
        //
        //   Failed to interpolate TextStyles with different inherit values.
        //
        // Thrown while building the bar, so Flutter healed the subtree with an
        // ErrorWidget -- a red box with yellow text, at the top, for the frames
        // the transition lasted. Being an assert, it fired in debug only, which
        // is why release looked fine and why it read as a flash rather than a
        // crash. Pushing the sample detail screen from a history row is how it
        // was reported; every push in the app was doing it.
        //
        // Setting it also ends a real inconsistency: the back label was the one
        // piece of chrome still rendering in CupertinoSystemText while the title
        // beside it was the app face.
        textTheme: CupertinoTextThemeData(
          primaryColor: palette.accent,
          textStyle: AppText.body.copyWith(color: palette.label),
          navTitleTextStyle: AppText.headline.copyWith(color: palette.label),
          navLargeTitleTextStyle: AppText.largeTitle.copyWith(color: palette.label),
          actionTextStyle: AppText.body.copyWith(color: palette.accent),
          navActionTextStyle: AppText.body.copyWith(color: palette.accent),
        ),
      ),
    );
  }
}
