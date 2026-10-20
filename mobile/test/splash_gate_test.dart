import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/main.dart';
import 'package:atara/screens/splash_screen.dart';
import 'package:atara/theme/app_theme.dart';
import 'package:atara/widgets/brand/illustration.dart';

import 'support/splash.dart';

/// Scoped to the splash on purpose: other screens carry illustrations too,
/// and they are built underneath from the first frame.
final splashMark = find.descendant(
  of: find.byType(SplashScreen),
  matching: find.byType(Illustration),
);

/// The gate had no test at all, which is exactly how the splash shipped
/// invisible: it was skipped outright whenever the platform asked for less
/// motion, and nothing noticed.
Future<void> pumpGate(
  WidgetTester tester, {
  required VoidCallback onBehind,
  bool disableAnimations = false,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      locale: const Locale('id'),
      theme: AppTheme.light,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(disableAnimations: disableAnimations),
          child: SplashGate(
            child: Builder(
              builder: (context) {
                onBehind();
                return const Center(child: Text('behind'));
              },
            ),
          ),
        ),
      ),
    ),
  );
}

void main() {
  group('the real app', () {
    setUp(() => SharedPreferences.setMockInitialValues({}));
    tearDown(SharedPreferences.resetStatic);

    testWidgets('has its trolley on the very first frame',
        (tester) async {
      // The assertion that was missing, and the reason a blank splash shipped
      // twice. Every other splash test checks animation *values*, which were
      // all correct while the screen itself was an empty field of green.
      // This one asks the only question that matters: is anything there?
      await tester.pumpWidget(const ProviderScope(child: AtaraApp()));
      await tester.pump();

      expect(
        splashMark,
        findsOneWidget,
        reason: 'the first Flutter frame has to be the splash already, or '
            'the handoff from the launch window shows the app half-built',
      );

      await pumpPastSplash(tester);
    });

    testWidgets('keeps the trolley for the whole splash', (tester) async {
      await tester.pumpWidget(const ProviderScope(child: AtaraApp()));

      for (var elapsed = Duration.zero;
          elapsed < SplashScreen.hold;
          elapsed += const Duration(milliseconds: 100)) {
        await tester.pump(const Duration(milliseconds: 100));
        if (find.byType(SplashScreen).evaluate().isEmpty) break;
        expect(
          splashMark,
          findsOneWidget,
          reason: 'the splash is one composition from start to finish',
        );
      }

      await tester.pump(const Duration(milliseconds: 500));
    });

    testWidgets('lets the real app through', (tester) async {
      // The gap that let a stuck splash ship: the loop above breaks out when
      // the splash disappears and never asserts that it did, and the only
      // test that checked `findsNothing` used a hand-rolled MaterialApp with
      // no Riverpod and no AuthGate. Nothing covered the tree that actually
      // runs on a device.
      await tester.pumpWidget(const ProviderScope(child: AtaraApp()));
      expect(find.byType(SplashScreen), findsOneWidget);

      await pumpPastSplash(tester);
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      expect(
        find.byType(SplashScreen),
        findsNothing,
        reason: 'the splash is a decoration; it must never be a door that '
            'fails to open',
      );
    });

    testWidgets('comes down even if the animation never finishes',
        (tester) async {
      // Proof that the failsafe is load-bearing. The ticker is muted here, so
      // the AnimationController never advances and `onFinished` is never
      // called -- which before the Timer meant the app was locked for good.
      tester.binding.platformDispatcher.accessibilityFeaturesTestValue =
          const FakeAccessibilityFeatures(disableAnimations: true);
      addTearDown(tester.binding.platformDispatcher
          .clearAccessibilityFeaturesTestValue);

      await tester.pumpWidget(
        const ProviderScope(
          child: TickerMode(enabled: false, child: AtaraApp()),
        ),
      );
      expect(find.byType(SplashScreen), findsOneWidget);

      // The failsafe is armed by the first frame and then runs on the event
      // loop, so it fires even though the muted ticker never advances.
      await tester.pump();
      await tester.pump(SplashGate.failsafe);
      await tester.pump();

      expect(
        find.byType(SplashScreen),
        findsNothing,
        reason: 'a Timer runs on the event loop, not on vsync, so it fires '
            'whether or not the animation ever moves',
      );
    });
  });

  testWidgets('covers the app, then hands over', (tester) async {
    await pumpGate(tester, onBehind: () {});

    expect(find.byType(SplashScreen), findsOneWidget);

    await pumpPastSplash(tester);
    expect(find.byType(SplashScreen), findsNothing);
    expect(find.text('behind'), findsOneWidget);
  });

  testWidgets('builds the app underneath from the first frame', (tester) async {
    // A Stack, not a replacement. If the child only mounted once the splash
    // left, the providers it watches would not start reading until then and
    // the preparator would meet a spinner immediately afterwards.
    var built = false;
    await pumpGate(tester, onBehind: () => built = true);

    expect(built, isTrue);
    expect(find.byType(SplashScreen), findsOneWidget);

    await pumpPastSplash(tester);
  });

  testWidgets('still shows when the platform asks for less motion',
      (tester) async {
    // The regression. Honouring the setting by removing the splash meant that
    // on any device with transition_animation_scale at 0 the app appeared to
    // do nothing at all.
    debugSemanticsDisableAnimations = true;
    addTearDown(() => debugSemanticsDisableAnimations = null);

    await pumpGate(tester, onBehind: () {}, disableAnimations: true);

    expect(
      find.byType(SplashScreen),
      findsOneWidget,
      reason: 'reduced motion drops the movement, not the splash',
    );

    await pumpPastSplash(tester);
    expect(find.byType(SplashScreen), findsNothing);
    expect(find.text('behind'), findsOneWidget);
  });
}
