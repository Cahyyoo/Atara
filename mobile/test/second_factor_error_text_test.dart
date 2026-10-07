import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/services/api_exception.dart';
import 'package:atara/services/second_factor_error_text.dart';

/// A `poor-quality` refusal says which way to move.
///
/// The server sends `details.reason` as its own message key —
/// `QUALITY_REASONS` in web/src/lib/face-quality.ts — and this mapping used to
/// know only the older hyphenated spellings, so every one of those keys fell
/// through to the generic "not clear yet" and the advice never reached anyone.
void main() {
  final l10n = lookupAppLocalizations(const Locale('en'));

  SecondFactorRefusal refusalFor(Object? reason) => secondFactorRefusal(
    l10n,
    ApiException(
      'Frame quality issue.',
      statusCode: 400,
      kind: ApiErrorKind.server,
      code: 'poor-quality',
      details: {'reason': reason},
    ),
  );

  test("the server's own keys map to their specific advice", () {
    expect(refusalFor('qualityTooFar').message, l10n.faceQualityTooFar);
    expect(refusalFor('qualityTooClose').message, l10n.faceQualityTooClose);
    expect(refusalFor('qualityOffCentre').message, l10n.faceQualityOffCentre);
    expect(refusalFor('qualityTooDark').message, l10n.faceQualityTooDark);
    expect(refusalFor('qualityUnsure').message, l10n.faceQualityUnsure);
  });

  test('the older hyphenated spellings are still understood', () {
    expect(refusalFor('too-far').message, l10n.faceQualityTooFar);
    expect(refusalFor('too-close').message, l10n.faceQualityTooClose);
    expect(refusalFor('off-centre').message, l10n.faceQualityOffCentre);
    expect(refusalFor('too-dark').message, l10n.faceQualityTooDark);
  });

  test('an unknown or missing reason falls back, and stays retryable', () {
    for (final reason in ['qualityBlurry', null]) {
      final refusal = refusalFor(reason);
      expect(refusal.message, l10n.faceQualityUnsure);
      expect(
        refusal.disposition,
        SecondFactorDisposition.retrySameChallenge,
        reason: 'a bad frame never spends the challenge',
      );
    }
  });
}
