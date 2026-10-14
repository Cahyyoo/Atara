import 'package:flutter_test/flutter_test.dart';

import 'package:atara/l10n/app_localizations_id.dart';
import 'package:atara/services/api_error_text.dart';
import 'package:atara/services/api_exception.dart';

/// The server refuses to move a sample with no Sample ID in English; the
/// preparator reads it in their own language, whichever path it arrives by.
void main() {
  test('a missing Sample ID is said in Indonesian', () {
    final l10n = AppLocalizationsId();
    const error = ApiException(
      'This sample has no Sample ID yet. Fill it in before moving it to a stage.',
      statusCode: 422,
      kind: ApiErrorKind.server,
      code: 'SAMPLE_IDENT_REQUIRED',
    );

    expect(error.isSampleIdentMissing, isTrue);
    expect(
      apiErrorText(l10n, error),
      'Isi Sample ID dulu sebelum memperbarui tahap.',
    );
  });
}
