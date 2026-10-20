import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:atara/main.dart';
import 'package:atara/screens/login_screen.dart';
import 'package:atara/screens/onboarding_screen.dart';
import 'package:atara/screens/splash_screen.dart';

void main() {
  testWidgets('App shows the login screen when no session is stored', (tester) async {
    // The guide now stands ahead of the sign-in screen, and an empty store
    // means it has never been shown. This test is about the session, so the
    // guide is marked as already seen.
    SharedPreferences.setMockInitialValues({'atara_onboarding_seen': true});

    await tester.pumpWidget(const ProviderScope(child: AtaraApp()));

    // The splash holds for a fixed stretch before it hands over.
    await tester.pump(SplashScreen.hold + const Duration(milliseconds: 50));

    // The session, the stored locale and the localization delegates all resolve
    // asynchronously. pumpAndSettle would hang on the loading indicator, so
    // pump a few frames and let them settle.
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }

    expect(find.byType(OnboardingScreen), findsNothing);
    expect(find.byType(LoginScreen), findsOneWidget);
    // Email and password, the two fields the sign-in screen exists for.
    expect(find.byType(CupertinoTextField), findsNWidgets(2));
  });
}
