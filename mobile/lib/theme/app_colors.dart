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

/// The web app's palette, in both appearances.
///
/// These are `web/src/app/globals.css` converted from OKLCH to sRGB, not
/// approximations of it. The two apps are one product and a preparator moves
/// between them during a shift, so the teal that means "this is Atara" has to
/// be the same teal in both — a near miss reads as a different app, or as a
/// rendering fault.
///
/// That claim decays, and it did. The web raised `--muted-foreground` for
/// contrast, named two new surfaces (`--canvas`, `--field`), and moved from
/// Tailwind v3 to v4 — which repainted every status hue. None of it crossed
/// over until it was re-synced by hand. Changing a colour on either side
/// means walking the other.
///
/// Every colour is defined for both appearances in one place, so a new surface
/// cannot be added in light and forgotten in dark — which is the usual way a
/// dark mode ends up with one illegible corner.
///
/// The `hero*` members are the app's only gradient and its only shadow. They
/// come from the same stylesheet as everything else here — `--gradient-hero`,
/// `--gradient-sheen` and `--shadow-hero` — and the web spends them just as
/// sparingly: one KPI tile, the brand chip, the primary button. On the phone
/// they belong to the splash and the guide, which are occasions rather than
/// work surfaces. Everywhere else the rule still holds: no elevation, no
/// shadow, no gradient.
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
    required this.heroEnd,
    required this.heroSheen,
    required this.heroShadow,
    required this.onHero,
    required this.field,
    required this.primaryGradientStart,
    required this.primaryGradientEnd,
  });

  /// The brand teal — `--primary`. Every tappable thing that is not a filled
  /// button, and the fill of the ones that are.
  final Color accent;

  /// `--primary-foreground`: what sits on top of a filled button.
  final Color onAccent;

  final ToneColors success;
  final ToneColors warning;
  final ToneColors danger;

  /// Blue, for work in progress.
  ///
  /// The web pairs a teal brand with a blue "in progress" badge, so this is a
  /// separate role rather than the accent reused — matching it means carrying
  /// the same distinction.
  final ToneColors info;

  /// Primary text — `--foreground`.
  final Color label;

  /// Captions, timestamps, help lines — `--muted-foreground`.
  final Color secondaryLabel;

  /// Placeholders and disabled text.
  final Color tertiaryLabel;

  /// The page itself, behind the cards — `--canvas`.
  ///
  /// This used to borrow `--muted`, because when the palette was first ported
  /// the web set `--background` and `--card` to the same white and separated
  /// them with `bg-muted/40`. The web has since named the surface properly,
  /// and `--canvas` is what its app shell paints. A hair off white in light,
  /// so white reads as raised.
  final Color groupedBackground;

  /// The inset cards that carry almost every row — `--card`.
  final Color cardBackground;

  /// Hairline rules between rows — `--border`.
  final Color separator;

  /// Untinted chips and badges — `--secondary`.
  final Color fill;

  /// The inside of a text box — `--field`.
  ///
  /// A hair darker than the card it sits on. It is also the right ground for
  /// a skeleton placeholder: [fill] used to serve both jobs, but once it was
  /// corrected to `--secondary` it came to 1.09:1 against a white card, which
  /// is present without being visible. This is 1.17:1 light and 1.19:1 dark —
  /// near-symmetric, which is what a placeholder needs.
  final Color field;

  /// The two stops of `--gradient-primary`, top to bottom.
  ///
  /// The web fills its primary button with this rather than a flat colour.
  final Color primaryGradientStart;
  final Color primaryGradientEnd;

  /// The light end of `--gradient-hero`, at the top-left corner.
  final Color heroStart;

  /// Its dark end, at the bottom-right.
  final Color heroEnd;

  /// The opening stop of `--gradient-sheen`: white, low alpha, fading out by
  /// 55%. It is the highlight that keeps the hero from reading as flat paint.
  final Color heroSheen;

  /// `--shadow-hero`. Teal in light, plain black in dark — a coloured shadow
  /// on a near-black page is invisible, so the web swaps it too.
  final Color heroShadow;

  /// What sits on the hero: white in both appearances.
  ///
  /// Not [onAccent], which is the trap this field exists to close. In dark
  /// that one is near-black by design, and near-black on the hero teal is
  /// about 3.5:1 — it reads as a rendering fault rather than as a choice.
  /// Keeping the pairing here is the same reasoning as [ToneColors].
  final Color onHero;

  /// Status tones are the web's own badge colours, so a sample reads the same
  /// on a phone as it does on the dashboard.
  ///
  /// `status-badge.tsx` spells them as Tailwind classes rather than as custom
  /// properties: the `-100`/`-800` pair in light, `-500` at 15% under `-400`
  /// in dark. The web is on Tailwind **v4**, whose palette is a different set
  /// of hues from v3 — emerald-400 alone moved from `#34D399` to `#00D492`.
  /// These are the v4 values.
  static const light = AppColors(
    accent: Color(0xFF00786F),
    // The one value here that is deliberately NOT the web's.
    //
    // `--primary-foreground` is oklch(0.985 0 0) = #FAFAFA, and on the light
    // end of the primary gradient that reads 4.45:1 -- under AA. The web ships
    // that gap. Pure white is 4.64:1 on the same fill and 5.36:1 on the flat
    // accent, and the difference between the two whites is invisible.
    onAccent: Color(0xFFFFFFFF),
    success: ToneColors(
      foreground: Color(0xFF009966), // emerald-600
      background: Color(0xFFD0FAE5), // emerald-100
      onBackground: Color(0xFF006045), // emerald-800
    ),
    warning: ToneColors(
      foreground: Color(0xFFE17100), // amber-600
      background: Color(0xFFFEF3C6), // amber-100
      onBackground: Color(0xFF973C00), // amber-800
    ),
    danger: ToneColors(
      foreground: Color(0xFFE7000B),
      background: Color(0x1AE7000B),
      // The web puts `text-destructive` straight onto `bg-destructive/10`
      // rather than a darker red. Faithful, and worth knowing: this pairing
      // lands at 4.01:1, just under AA. The web has the same gap.
      onBackground: Color(0xFFE7000B),
    ),
    info: ToneColors(
      foreground: Color(0xFF155DFC), // blue-600
      background: Color(0xFFDBEAFE), // blue-100
      onBackground: Color(0xFF193CB8), // blue-800
    ),
    label: Color(0xFF0A0A0A),
    // Raised from #737373 upstream: at that value it read 4.03:1 on a field,
    // just under AA. This is 4.63:1.
    secondaryLabel: Color(0xFF6A6A6A),
    tertiaryLabel: Color(0xFFA3A3A3),
    groupedBackground: Color(0xFFF4F8F7),
    cardBackground: Color(0xFFFFFFFF),
    separator: Color(0xFFE5E5E5),
    fill: Color(0xFFF5F5F5),
    field: Color(0xFFEAEEED),
    primaryGradientStart: Color(0xFF008379),
    primaryGradientEnd: Color(0xFF006D66),
    // oklch(0.50 0.105 184) and oklch(0.38 0.085 191). The light end is capped
    // at L .50 upstream so white stays legible on it; white here is 5.53:1.
    heroStart: Color(0xFF00766A),
    heroEnd: Color(0xFF00504D),
    heroSheen: Color(0x24FFFFFF),
    heroShadow: Color(0x4700655E),
    onHero: Color(0xFFFFFFFF),
  );

  static const dark = AppColors(
    accent: Color(0xFF00BBA7),
    // The web darkens the label on a filled button rather than whitening it:
    // its dark teal is bright enough that white on top would glare.
    onAccent: Color(0xFF0A0A0A),
    success: ToneColors(
      foreground: Color(0xFF00D492), // emerald-400
      background: Color(0x2600BC7D), // emerald-500 at 15%
      onBackground: Color(0xFF00D492),
    ),
    warning: ToneColors(
      foreground: Color(0xFFFFB900), // amber-400
      background: Color(0x26FE9A00), // amber-500 at 15%
      onBackground: Color(0xFFFFB900),
    ),
    danger: ToneColors(
      foreground: Color(0xFFFF6467),
      // 20% in dark, not 15%: `dark:bg-destructive/20` in badge.tsx.
      background: Color(0x33FF6467),
      onBackground: Color(0xFFFF6467),
    ),
    info: ToneColors(
      foreground: Color(0xFF51A2FF), // blue-400
      background: Color(0x262B7FFF), // blue-500 at 15%
      onBackground: Color(0xFF51A2FF),
    ),
    label: Color(0xFFFAFAFA),
    secondaryLabel: Color(0xFFA1A1A1),
    tertiaryLabel: Color(0xFF737373),
    groupedBackground: Color(0xFF060606),
    cardBackground: Color(0xFF171717),
    separator: Color(0x1AFFFFFF),
    fill: Color(0xFF262626),
    field: Color(0xFF242727),
    primaryGradientStart: Color(0xFF00BFAC),
    primaryGradientEnd: Color(0xFF00A696),
    // oklch(0.50 0.10 185) and oklch(0.30 0.07 192); white is 5.59:1 on the
    // light end. The shadow goes black because teal on #0A0A0A shows nothing.
    heroStart: Color(0xFF00756B),
    heroEnd: Color(0xFF003837),
    heroSheen: Color(0x1AFFFFFF),
    heroShadow: Color(0x8C000000),
    onHero: Color(0xFFFFFFFF),
  );

  /// The tint behind the brand mark and other quiet accent grounds — the web's
  /// `bg-primary/10`.
  Color get accentTint => accent.withValues(alpha: 0.10);

  /// The hairline around the brand mark — the web's `ring-primary/15`.
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

  /// `--gradient-primary`, the fill of a primary button. CSS `180deg` is
  /// straight down.
  LinearGradient get primaryGradient => LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [primaryGradientStart, primaryGradientEnd],
      );

  /// `--gradient-hero`.
  ///
  /// Getters rather than stored [Gradient] fields, so that a light/dark
  /// crossfade produces a correct intermediate for free: these read [Color]
  /// fields that [lerp] has already interpolated. A stored gradient would have
  /// to go through `Gradient.lerp`, which is nullable and degrades between
  /// mismatched types.
  ///
  /// CSS `145deg` is a diagonal from the top-left corner. No pair of
  /// [Alignment]s expresses that angle exactly; at the sizes this is painted
  /// the difference is under a pixel.
  LinearGradient get heroGradient => LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [heroStart, heroEnd],
      );

  /// `--gradient-sheen`.
  ///
  /// The second stop is [heroSheen] at zero alpha, never `Colors.transparent`
  /// -- that constant is transparent *black*, and gradients interpolate in
  /// unpremultiplied RGBA, so white to transparent-black darkens through the
  /// middle and leaves a grey smear across the tile.
  LinearGradient get heroSheenGradient => LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [heroSheen, heroSheen.withValues(alpha: 0)],
        stops: const [0.0, 0.55],
      );

  /// `--shadow-hero`: `0 8px 24px`.
  ///
  /// CSS blur-radius is twice the gaussian sigma; Flutter's is
  /// `radius * 0.57735 + 0.5`. 20 here is the web's 24.
  List<BoxShadow> get heroShadows =>
      [BoxShadow(color: heroShadow, blurRadius: 20, offset: const Offset(0, 8))];

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
    Color? heroEnd,
    Color? heroSheen,
    Color? heroShadow,
    Color? onHero,
    Color? field,
    Color? primaryGradientStart,
    Color? primaryGradientEnd,
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
      heroEnd: heroEnd ?? this.heroEnd,
      heroSheen: heroSheen ?? this.heroSheen,
      heroShadow: heroShadow ?? this.heroShadow,
      onHero: onHero ?? this.onHero,
      field: field ?? this.field,
      primaryGradientStart: primaryGradientStart ?? this.primaryGradientStart,
      primaryGradientEnd: primaryGradientEnd ?? this.primaryGradientEnd,
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
      heroEnd: Color.lerp(heroEnd, other.heroEnd, t)!,
      heroSheen: Color.lerp(heroSheen, other.heroSheen, t)!,
      heroShadow: Color.lerp(heroShadow, other.heroShadow, t)!,
      onHero: Color.lerp(onHero, other.onHero, t)!,
      field: Color.lerp(field, other.field, t)!,
      primaryGradientStart:
          Color.lerp(primaryGradientStart, other.primaryGradientStart, t)!,
      primaryGradientEnd:
          Color.lerp(primaryGradientEnd, other.primaryGradientEnd, t)!,
    );
  }
}
