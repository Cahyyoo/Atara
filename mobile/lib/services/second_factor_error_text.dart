import '../l10n/app_localizations.dart';
import 'api_error_text.dart';
import 'api_exception.dart';

/// What the screen should do next, which matters more than the wording.
///
/// Mirrors the web client's `canRetry` idea, and the distinction is the part
/// that actually protects the account: the server treats its refusals very
/// differently, and a client that pops back to the password field on every 401
/// throws away challenges it was allowed to keep.
enum SecondFactorDisposition {
  /// Stay put. The challenge was not spent, so another attempt costs nothing.
  retrySameChallenge,

  /// The challenge is gone. Back to the password field, having said why.
  startAgain,

  /// Nothing here will work. Offer another method if there is one, or leave.
  halt,
}

class SecondFactorRefusal {
  const SecondFactorRefusal(this.message, this.disposition);

  final String message;
  final SecondFactorDisposition disposition;
}

/// Turns a refusal from `/auth/totp`, `/auth/totp/setup` or `/auth/face` into a
/// sentence and a decision.
///
/// Keyed on the machine-readable `code` wherever the server sends one. Matching
/// on message text would be wrong twice over — the text is English only, and it
/// breaks the first time someone rewords it, which is the reason the server grew
/// a `code` field at all.
///
/// One case is honestly undecidable. Both the per-address rate limiter and the
/// five-strike account lock answer **429 with no code**, differing only in their
/// English wording. This returns one sentence that is true of both rather than
/// guessing; saying "15 minutes" when it might be two would be worse than saying
/// neither. Fixing it properly is a one-line `code` argument on the server side.
SecondFactorRefusal secondFactorRefusal(
  AppLocalizations l10n,
  ApiException error,
) {
  // The reading failures. Every one of these leaves the challenge unspent and
  // costs nothing against the five-strike lock, so the preparator may simply try
  // again — which is the whole reason they are 400s and not 401s.
  switch (error.code) {
    case 'totp-mismatch':
      return SecondFactorRefusal(
        l10n.mfaCodeWrong,
        SecondFactorDisposition.retrySameChallenge,
      );
    case 'no-face':
      return SecondFactorRefusal(
        l10n.faceNoFace,
        SecondFactorDisposition.retrySameChallenge,
      );
    case 'not-alive':
      return SecondFactorRefusal(
        l10n.faceNotAlive,
        SecondFactorDisposition.retrySameChallenge,
      );
    case 'poor-quality':
      return SecondFactorRefusal(
        _qualityText(l10n, error.details),
        SecondFactorDisposition.retrySameChallenge,
      );
    case 'service-down':
      // A recognition outage is a hard refusal by design — the server never
      // degrades quietly to password-only — so retrying is pointless and the
      // challenge is deliberately left intact for another method.
      return SecondFactorRefusal(
        l10n.faceServiceDown,
        SecondFactorDisposition.halt,
      );
    case 'service-busy':
      return SecondFactorRefusal(
        l10n.faceServiceDown,
        SecondFactorDisposition.retrySameChallenge,
      );
  }

  // 429 covers two different limits that cannot be told apart from here.
  if (error.statusCode == 429) {
    return SecondFactorRefusal(
      l10n.mfaTooManyAttempts,
      SecondFactorDisposition.halt,
    );
  }

  // No enrolment is pending any more: an administrator changed the account's
  // state while this attempt was open.
  if (error.statusCode == 409) {
    return SecondFactorRefusal(
      l10n.mfaSetupUnavailable,
      SecondFactorDisposition.halt,
    );
  }

  if (error.statusCode == 401) {
    // Check if the refusal explicitly relates to a face mismatch.
    if (error.message.toLowerCase().contains('face') ||
        error.message.toLowerCase().contains('match') ||
        error.code == 'face-mismatch') {
      return SecondFactorRefusal(
        l10n.faceMismatch,
        SecondFactorDisposition.startAgain,
      );
    }
    // A 401 with no code means the challenge itself is unusable — expired, spent.
    return SecondFactorRefusal(
      l10n.mfaExpiredBody,
      SecondFactorDisposition.startAgain,
    );
  }

  // Timeouts and an unreachable server leave the challenge alive, and its own
  // countdown will retire it if the preparator runs out of time.
  if (error.kind == ApiErrorKind.timeout ||
      error.kind == ApiErrorKind.unreachable) {
    return SecondFactorRefusal(
      apiErrorText(l10n, error),
      SecondFactorDisposition.retrySameChallenge,
    );
  }

  return SecondFactorRefusal(
    apiErrorText(l10n, error),
    SecondFactorDisposition.halt,
  );
}

/// The specific thing wrong with the picture, where the server named one.
///
/// The rest of `details.diagnostics` — frame counts, match scores, video
/// dimensions — is for whoever wrote the checker, not for somebody trying to
/// sign in, and it deliberately never reaches the screen.
///
/// The server sends the reason as its own message key (`QUALITY_REASONS` in
/// `web/src/lib/face-quality.ts`), and this used to match only the older
/// hyphenated spellings — so every quality refusal fell through to the generic
/// sentence and nobody was ever told which way to move. Both spellings are
/// accepted, as the camera's own preview hint already does.
String _qualityText(AppLocalizations l10n, Object? details) {
  final reason = details is Map ? details['reason'] : null;
  return switch (reason) {
    'qualityTooFar' || 'too-far' => l10n.faceQualityTooFar,
    'qualityTooClose' || 'too-close' => l10n.faceQualityTooClose,
    'qualityOffCentre' || 'off-centre' => l10n.faceQualityOffCentre,
    'qualityTooDark' || 'too-dark' => l10n.faceQualityTooDark,
    _ => l10n.faceQualityUnsure,
  };
}
