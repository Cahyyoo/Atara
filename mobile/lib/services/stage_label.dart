import '../l10n/app_localizations.dart';

/// What to call a stage on screen.
///
/// The wording lives in the translations, the same as on the web; the row
/// carries a stable key and the server sends that key along with the stored
/// name. The server has no locale, so it cannot be the thing that picks the
/// words.
///
/// An unrecognised key falls back to the stored name rather than showing
/// nothing: a stage added later, or one whose key this build has never heard
/// of, is still worth naming. The same reason the cached entries below can
/// carry no key at all — an app updated mid-shift must keep reading what the
/// old build wrote.
String stageLabel(AppLocalizations l10n, String? key, String fallbackName) {
  switch (key) {
    case 'RECEIVED':
      return l10n.stageReceived;
    case 'WET_PREP':
      return l10n.stageWetPrep;
    case 'DRY_PREP':
      return l10n.stageDryPrep;
    case 'ANALYSIS':
      return l10n.stageAnalysis;
    case 'REPORT':
      return l10n.stageReport;
    default:
      return fallbackName;
  }
}
