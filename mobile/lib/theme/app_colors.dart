import 'package:flutter/material.dart';

/// A foreground/background pair carrying one meaning.
///
/// Passing the pair around keeps the two halves together: a caller cannot pick
/// a warning background and then colour the text with the danger foreground,
/// which is what happened when every call site chose its own shades.
@immutable
class ToneColors {
  const ToneColors({
    required this.foreground,
    required this.background,
    required this.onBackground,
  });

  /// For icons and emphasised text on the page's own surface.
  final Color foreground;

  /// For the fill behind a banner or badge.
  final Color background;

  /// For text and icons sitting on [background].
  final Color onBackground;

  ToneColors lerpTo(ToneColors other, double t) {
    return ToneColors(
      foreground: Color.lerp(foreground, other.foreground, t)!,
      background: Color.lerp(background, other.background, t)!,
      onBackground: Color.lerp(onBackground, other.onBackground, t)!,
    );
  }
}

/// The app's palette, in both appearances.
///
/// Olive into lime, taken from the redesign reference frame by frame: a dark
/// olive in the top-left corner of every green surface, running out to a fresh
/// lime at the far edge, on a warm off-white page. The phone no longer borrows
/// the web's teal — the two apps now differ in colour on purpose, and a change
/// here does not need walking across to `globals.css`.
///
/// Every colour is defined for both appearances in one place, so a new surface
/// cannot be added in light and forgotten in dark — which is the usual way a
/// dark mode ends up with one illegible corner.
///
/// The reference spends gradient freely — the header of every brand screen,
/// the primary button, the selected chip — so this palette does too. What it
/// still rations is shadow: one soft lift on cards that float over a green
/// header, none on cards sitting on the page.
@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.accent,
    required this.onAccent,
    required this.success,
    required this.warning,
    required this.danger,
    required this.info,
    required this.label,
    required this.secondaryLabel,
    required this.tertiaryLabel,
    required this.groupedBackground,
    required this.cardBackground,
    required this.separator,
    required this.fill,
    required this.heroStart,
    required this.heroMid,
    required this.heroEnd,
    required this.heroSheen,
    required this.heroShadow,
    required this.onHero,
    required this.field,
    required this.primaryGradientStart,
    required this.primaryGradientEnd,
    required this.lime,
    required this.blob,
  });

  /// The brand green for text and icons: links, "See all", ticks, the active
  /// tab. Dark enough in light to read as text on the page (≥4.5:1).
  final Color accent;

  /// What sits on a filled button: white in both appearances, because both
  /// button gradients are dark where the label sits.
  final Color onAccent;

  final ToneColors success;
  final ToneColors warning;
  final ToneColors danger;

  /// Blue, for work in progress — kept apart from the brand green so "in
  /// progress" and "done" never read as the same badge.
  final ToneColors info;

  /// Primary text.
  final Color label;

  /// Captions, timestamps, help lines.
  ///
  /// Darker than the reference's own grey (#8B8E86 is 3.3:1 on white). The
  /// reference is a marketing clip; this is read with gloves on under lab
  /// lighting, so it holds AA.
  final Color secondaryLabel;

  /// Placeholders and disabled text.
  final Color tertiaryLabel;

  /// The page itself, behind the cards: the reference's warm off-white.
  final Color groupedBackground;

  /// The cards that carry almost every row.
  final Color cardBackground;

  /// Hairline rules between rows.
  final Color separator;

  /// Untinted chips and badges, and the press tint on a row.
  final Color fill;

  /// The inside of a text box and the ground of a skeleton placeholder.
  ///
  /// A shade under the page colour, not equal to it: the reference's fields
  /// are the page colour, which against a white card is 1.12:1 — a skeleton
  /// on that is present without being visible.
  final Color field;

  /// The two stops of the primary button, left to right.
  final Color primaryGradientStart;
  final Color primaryGradientEnd;

  /// The green header: dark olive at the top-left corner…
  final Color heroStart;

  /// …through a mid green, which is about where the header's text ends…
  final Color heroMid;

  /// …out to lime at the bottom-right, behind the illustration.
  final Color heroEnd;

  /// A white highlight at low alpha, fading out by 55%.
  final Color heroSheen;

  /// The soft lift under a card floating over a green header.
  final Color heroShadow;

  /// What sits on the header: white in both appearances.
  final Color onHero;

  /// The bright brand lime: the dot in the wordmark, the selected tab's pip,
  /// the ring behind an illustration. Never text — it is too light to read.
  final Color lime;

  /// The soft blob painted behind every illustration.
  final Color blob;

  static const light = AppColors(
    accent: Color(0xFF4F7622),
    onAccent: Color(0xFFFFFFFF),
    success: ToneColors(
      foreground: Color(0xFF3F8A1F),
      background: Color(0xFFE2F4CF),
      onBackground: Color(0xFF2C5A12),
    ),
    warning: ToneColors(
      foreground: Color(0xFFE17100), // amber-600
      background: Color(0xFFFEF3C6), // amber-100
      onBackground: Color(0xFF973C00), // amber-800
    ),
    danger: ToneColors(
      foreground: Color(0xFFDC2626),
      background: Color(0x1ADC2626),
      onBackground: Color(0xFFC81E1E),
    ),
    info: ToneColors(
      foreground: Color(0xFF155DFC), // blue-600
      background: Color(0xFFDBEAFE), // blue-100
      onBackground: Color(0xFF193CB8), // blue-800
    ),
    label: Color(0xFF1A1A19),
    secondaryLabel: Color(0xFF62665C),
    tertiaryLabel: Color(0xFFA6AA9F),
    groupedBackground: Color(0xFFF0F3EB),
    cardBackground: Color(0xFFFFFFFF),
    separator: Color(0xFFE3E7DC),
    fill: Color(0xFFF0F3EB),
    field: Color(0xFFEBEFE4),
    // The reference runs #364117 into #9BD246 behind a white label. Measured
    // where the label actually sits — the middle fifth — that is 3.7–4.0:1.
    // The lime end is pulled in until the whole middle fifth clears 4.5, and
    // the bar still reads as olive-into-lime.
    primaryGradientStart: Color(0xFF2F3A14),
    primaryGradientEnd: Color(0xFF78AD35),
    heroStart: Color(0xFF2A3A12),
    heroMid: Color(0xFF5E8627),
    heroEnd: Color(0xFF9BD246),
    heroSheen: Color(0x24FFFFFF),
    heroShadow: Color(0x1F2A3A12),
    onHero: Color(0xFFFFFFFF),
    lime: Color(0xFF8CC63F),
    blob: Color(0xFFDCF2B4),
  );

  static const dark = AppColors(
    accent: Color(0xFF9BD246),
    onAccent: Color(0xFFFFFFFF),
    success: ToneColors(
      foreground: Color(0xFF8BD45A),
      background: Color(0x2670B83A),
      onBackground: Color(0xFF9EDC72),
    ),
    warning: ToneColors(
      foreground: Color(0xFFFFB900), // amber-400
      background: Color(0x26FE9A00), // amber-500 at 15%
      onBackground: Color(0xFFFFB900),
    ),
    danger: ToneColors(
      foreground: Color(0xFFFF6467),
      background: Color(0x33FF6467),
      onBackground: Color(0xFFFF6467),
    ),
    info: ToneColors(
      foreground: Color(0xFF51A2FF), // blue-400
      background: Color(0x262B7FFF), // blue-500 at 15%
      onBackground: Color(0xFF51A2FF),
    ),
    label: Color(0xFFF4F6EF),
    secondaryLabel: Color(0xFFA4A99B),
    tertiaryLabel: Color(0xFF6E7366),
    groupedBackground: Color(0xFF0E110B),
    cardBackground: Color(0xFF171B13),
    separator: Color(0x1AFFFFFF),
    fill: Color(0xFF20251A),
    field: Color(0xFF232A1B),
    primaryGradientStart: Color(0xFF1E2A0C),
    primaryGradientEnd: Color(0xFF6F9E2E),
    heroStart: Color(0xFF1A2509),
    heroMid: Color(0xFF3F6118),
    heroEnd: Color(0xFF79AE34),
    heroSheen: Color(0x1AFFFFFF),
    heroShadow: Color(0x8C000000),
    onHero: Color(0xFFFFFFFF),
    lime: Color(0xFF9BD246),
    blob: Color(0xFF2B3A18),
  );

  /// The tint behind the brand mark and other quiet accent grounds.
  Color get accentTint => accent.withValues(alpha: 0.10);

  /// The hairline around the brand mark.
  Color get accentRing => accent.withValues(alpha: 0.15);

  /// The untinted badge: an accent glyph on the plain fill.
  ///
  /// A getter rather than a stored tone, because all three parts already
  /// exist and must move with them. It replaces the identical ToneColors that
  /// My Work and Home each assembled inline.
  ToneColors get neutral => ToneColors(
        foreground: accent,
        background: fill,
        onBackground: secondaryLabel,
      );

  /// The primary button and the selected chip: olive on the left into lime on
  /// the right, as in the reference.
  ///
  /// Getters rather than stored [Gradient] fields, so that a light/dark
  /// crossfade produces a correct intermediate for free: these read [Color]
  /// fields that [lerp] has already interpolated.
  LinearGradient get primaryGradient => LinearGradient(
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
        colors: [primaryGradientStart, primaryGradientEnd],
      );

  /// The green header: a diagonal from the top-left corner.
  LinearGradient get heroGradient => LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [heroStart, heroMid, heroEnd],
        stops: const [0.0, 0.5, 1.0],
      );

  /// A highlight laid over the header so it does not read as flat paint.
  ///
  /// The second stop is [heroSheen] at zero alpha, never `Colors.transparent`
  /// -- that constant is transparent *black*, and gradients interpolate in
  /// unpremultiplied RGBA, so white to transparent-black darkens through the
  /// middle and leaves a grey smear.
  LinearGradient get heroSheenGradient => LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [heroSheen, heroSheen.withValues(alpha: 0)],
        stops: const [0.0, 0.55],
      );

  /// The one soft lift: a card floating over a green header.
  List<BoxShadow> get heroShadows =>
      [BoxShadow(color: heroShadow, blurRadius: 24, offset: const Offset(0, 10))];

  /// The colour of [heroGradient] at [t] along its diagonal (0 = top-left).
  ///
  /// For the contrast test, which has to judge white text where it is
  /// actually drawn rather than at the lime end nobody writes on.
  Color heroAt(double t) => t <= 0.5
      ? Color.lerp(heroStart, heroMid, t / 0.5)!
      : Color.lerp(heroMid, heroEnd, (t - 0.5) / 0.5)!;

  /// The colour of [primaryGradient] at [t] from the left.
  Color primaryAt(double t) =>
      Color.lerp(primaryGradientStart, primaryGradientEnd, t)!;

  @override
  AppColors copyWith({
    Color? accent,
    Color? onAccent,
    ToneColors? success,
    ToneColors? warning,
    ToneColors? danger,
    ToneColors? info,
    Color? label,
    Color? secondaryLabel,
    Color? tertiaryLabel,
    Color? groupedBackground,
    Color? cardBackground,
    Color? separator,
    Color? fill,
    Color? heroStart,
    Color? heroMid,
    Color? heroEnd,
    Color? heroSheen,
    Color? heroShadow,
    Color? onHero,
    Color? field,
    Color? primaryGradientStart,
    Color? primaryGradientEnd,
    Color? lime,
    Color? blob,
  }) {
    return AppColors(
      accent: accent ?? this.accent,
      onAccent: onAccent ?? this.onAccent,
      success: success ?? this.success,
      warning: warning ?? this.warning,
      danger: danger ?? this.danger,
      info: info ?? this.info,
      label: label ?? this.label,
      secondaryLabel: secondaryLabel ?? this.secondaryLabel,
      tertiaryLabel: tertiaryLabel ?? this.tertiaryLabel,
      groupedBackground: groupedBackground ?? this.groupedBackground,
      cardBackground: cardBackground ?? this.cardBackground,
      separator: separator ?? this.separator,
      fill: fill ?? this.fill,
      heroStart: heroStart ?? this.heroStart,
      heroMid: heroMid ?? this.heroMid,
      heroEnd: heroEnd ?? this.heroEnd,
      heroSheen: heroSheen ?? this.heroSheen,
      heroShadow: heroShadow ?? this.heroShadow,
      onHero: onHero ?? this.onHero,
      field: field ?? this.field,
      primaryGradientStart: primaryGradientStart ?? this.primaryGradientStart,
      primaryGradientEnd: primaryGradientEnd ?? this.primaryGradientEnd,
      lime: lime ?? this.lime,
      blob: blob ?? this.blob,
    );
  }

  @override
  AppColors lerp(AppColors? other, double t) {
    if (other == null) return this;
    return AppColors(
      accent: Color.lerp(accent, other.accent, t)!,
      onAccent: Color.lerp(onAccent, other.onAccent, t)!,
      success: success.lerpTo(other.success, t),
      warning: warning.lerpTo(other.warning, t),
      danger: danger.lerpTo(other.danger, t),
      info: info.lerpTo(other.info, t),
      label: Color.lerp(label, other.label, t)!,
      secondaryLabel: Color.lerp(secondaryLabel, other.secondaryLabel, t)!,
      tertiaryLabel: Color.lerp(tertiaryLabel, other.tertiaryLabel, t)!,
      groupedBackground: Color.lerp(groupedBackground, other.groupedBackground, t)!,
      cardBackground: Color.lerp(cardBackground, other.cardBackground, t)!,
      separator: Color.lerp(separator, other.separator, t)!,
      fill: Color.lerp(fill, other.fill, t)!,
      heroStart: Color.lerp(heroStart, other.heroStart, t)!,
      heroMid: Color.lerp(heroMid, other.heroMid, t)!,
      heroEnd: Color.lerp(heroEnd, other.heroEnd, t)!,
      heroSheen: Color.lerp(heroSheen, other.heroSheen, t)!,
      heroShadow: Color.lerp(heroShadow, other.heroShadow, t)!,
      onHero: Color.lerp(onHero, other.onHero, t)!,
      field: Color.lerp(field, other.field, t)!,
      primaryGradientStart:
          Color.lerp(primaryGradientStart, other.primaryGradientStart, t)!,
      primaryGradientEnd:
          Color.lerp(primaryGradientEnd, other.primaryGradientEnd, t)!,
      lime: Color.lerp(lime, other.lime, t)!,
      blob: Color.lerp(blob, other.blob, t)!,
    );
  }
}
