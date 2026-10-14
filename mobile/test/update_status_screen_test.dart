import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/screens/update_status_screen.dart';

import 'support/finders.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('leaves the loading state instead of spinning for ever', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          locale: Locale('id'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: UpdateStatusScreen(sampleCode: 'NKL-2026-00031'),
        ),
      ),
    );

    // Let the first frame and the fetch attempt settle. There is no server in a
    // test, so this must end in an error state — but it must *end*.
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 200));
    }

    expect(
      tester.takeException(),
      isNull,
      reason: 'opening the screen must not throw',
    );
    expect(
      anyBusyIndicator,
      findsNothing,
      reason: 'the spinner must resolve into something the preparator can act on',
    );
  });
}
