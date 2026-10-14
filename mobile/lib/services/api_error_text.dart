import '../l10n/app_localizations.dart';
import 'api_exception.dart';

/// Turns an [ApiException] into something the preparator can read in their own
/// language. Anything the server itself worded is passed through: it is more
/// specific than a generic translation, even though it arrives in English.
String apiErrorText(AppLocalizations l10n, ApiException error) {
  // A refusal common enough on the floor to be said in the preparator's own
  // language rather than passed through in the server's English.
  if (error.isSampleIdentMissing) return l10n.sampleIdRequired;
  switch (error.kind) {
    case ApiErrorKind.timeout:
      return l10n.errorTimeout;
    case ApiErrorKind.unreachable:
      return l10n.errorUnreachable;
    case ApiErrorKind.server:
      return error.message;
    case ApiErrorKind.malformed:
      // Deliberately not unexpectedError. "An unexpected error occurred" is the
      // exact message this whole change exists to stop showing: it told the
      // preparator nothing and sent them nowhere.
      return l10n.errorUnreadableAnswer;
    case ApiErrorKind.unknown:
      return l10n.unexpectedError;
  }
}
