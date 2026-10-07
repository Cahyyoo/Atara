import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_platform_interface.dart';
import 'package:shared_preferences_platform_interface/types.dart';

import 'package:atara/main.dart';
import 'package:atara/screens/onboarding_screen.dart';
import 'package:atara/screens/splash_screen.dart';

import 'support/finders.dart';

/// A settings store that fails every read, standing in for a platform channel
/// that misbehaves on a real device.
///
/// The gate is the one place in this app where a stalled read is fatal: it
/// holds a spinner for `loading`, so a provider that never resolves means the
/// app never gets past its opening frame. SessionNotifier._restore is written
/// against exactly that, and the onboarding flag is the second async read to
/// stand in front of the sign-in screen — so it needs the same cover.
class _FailingStore extends SharedPreferencesStorePlatform {
  @override
  Future<Map<String, Object>> getAll() async => throw StateError('store unavailable');

  @override
  Future<bool> clear() async => throw StateError('store unavailable');

  @override
  Future<bool> remove(String key) async => throw StateError('store unavailable');

  @override
  Future<bool> setValue(String valueType, String key, Object value) async =>
      throw StateError('store unavailable');

  @override
  Future<bool> clearWithParameters(ClearParameters parameters) async =>
      throw StateError('store unavailable');

  @override
  Future<Map<String, Object>> getAllWithParameters(GetAllParameters parameters) async =>
      throw StateError('store unavailable');
}

/// pumpAndSettle would hang on the loading indicator, so pump past the splash
/// and let the stored answers land. The splash duration is read from the
/// widget rather than restated, so changing it does not silently strand these.
Future<void> pumpApp(WidgetTester tester) async {
  await tester.pumpWidget(const ProviderScope(child: AtaraApp()));
  await tester.pump(SplashScreen.hold + const Duration(milliseconds: 50));
  for (var i = 0; i < 5; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

/// The app follows the device language, and the test binding speaks English.
/// Storing a choice is how these tests pin the copy they assert on, without
/// reaching past AtaraApp — which takes no locale of its own.
Map<String, Object> prefs({bool? seenGuide}) => {
      'atara_locale': 'id',
      'atara_onboarding_seen': ?seenGuide,
    };

void main() {
  // Every SharedPreferences.getInstance() in a process shares one cached
  // instance. Without this the store installed by one test is still answering
  // in the next, and the failing-store case below silently tests nothing.
  tearDown(SharedPreferences.resetStatic);

  testWidgets('a fresh install opens on the guide, not the sign-in screen',
      (tester) async {
    SharedPreferences.setMockInitialValues(prefs());

    await pumpApp(tester);

    expect(find.byType(OnboardingScreen), findsOneWidget);
    // The welcome body, not appTitle: that string is identical in both .arb
    // files, so it would prove nothing, and it also appears on the sign-in
    // screen this test is asserting we did NOT reach.
    expect(
      find.text('Panduan singkat sebelum Anda mulai memindai sampel.'),
      findsOneWidget,
    );
    // The sign-in fields are what the guide stands in front of.
    expect(find.byType(CupertinoTextField), findsNothing);
  });

  testWidgets('a returning operator goes straight to the sign-in screen',
      (tester) async {
    SharedPreferences.setMockInitialValues(prefs(seenGuide: true));

    await pumpApp(tester);

    expect(find.byType(OnboardingScreen), findsNothing);
    expect(find.byType(CupertinoTextField), findsNWidgets(2));
  });

  testWidgets('dismissing the guide records it and falls through to sign-in',
      (tester) async {
    SharedPreferences.setMockInitialValues(prefs());

    await pumpApp(tester);
    expect(find.byType(OnboardingScreen), findsOneWidget);

    await tester.tap(find.text('Lewati'));
    await tester.pumpAndSettle();

    expect(find.byType(OnboardingScreen), findsNothing);
    expect(find.byType(CupertinoTextField), findsNWidgets(2));

    final store = await SharedPreferences.getInstance();
    expect(store.getBool('atara_onboarding_seen'), isTrue);
  });

  testWidgets('a store that throws resolves the gate rather than freezing it',
      (tester) async {
    SharedPreferences.resetStatic();
    SharedPreferencesStorePlatform.instance = _FailingStore();
    addTearDown(() => SharedPreferences.setMockInitialValues({}));

    await pumpApp(tester);

    expect(tester.takeException(), isNull);
    expect(
      anyBusyIndicator,
      findsNothing,
      reason: 'a prefs read that throws must resolve the gate, not hold it',
    );
    // Not the guide: a store that cannot be read cannot be written either, so
    // showing it here would replay it on every single launch.
    expect(find.byType(OnboardingScreen), findsNothing);
    expect(find.byType(CupertinoTextField), findsNWidgets(2));
  });
}
