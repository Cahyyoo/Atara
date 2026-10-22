import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/screens/splash_screen.dart';
import 'package:atara/theme/app_theme.dart';
import 'package:atara/widgets/brand/illustration.dart';
import 'package:atara/widgets/brand/wordmark.dart';

import 'support/splash.dart';

/// The opacity [of] is actually drawn at: every FadeTransition above it,
/// multiplied — the name has one for arriving and one for leaving.
double drawnOpacity(WidgetTester tester, Finder of) {
  final fades = tester.widgetList<FadeTransition>(
    find.ancestor(of: of, matching: find.byType(FadeTransition)),
  );
  return fades.fold(1.0, (product, fade) => product * fade.opacity.value);
}

/// Where the trolley is, relative to the middle of the screen. Negative is
/// still coming in from the left; positive is leaving to the right.
double trolleyOffset(WidgetTester tester) {
  final art = find.byType(Illustration);
  final centre = tester.getCenter(art).dx;
  final screen = tester.view.physicalSize.width / tester.view.devicePixelRatio;
  return centre - screen / 2;
}

Future<void> pumpSplash(
  WidgetTester tester, {
  required VoidCallback onFinished,
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
          data: MediaQuery.of(
            context,
          ).copyWith(disableAnimations: disableAnimations),
          child: SplashScreen(onFinished: onFinished),
        ),
      ),
    ),
  );
}

void main() {
  final name = find.byType(Wordmark);
  final tagline = find.text('Sampel terlacak, dari preparasi sampai laporan');

  testWidgets('the trolley glides in, then the name, then the line under it', (
    tester,
  ) async {
    var finished = false;
    await pumpSplash(tester, onFinished: () => finished = true);

    // Frame 0 matches the launch window: an empty page. The trolley is built
    // but still wholly off the left edge, and nothing is said yet.
    expect(find.byType(Illustration), findsOneWidget);
    expect(trolleyOffset(tester), lessThan(-200));
    expect(drawnOpacity(tester, name), 0);
    expect(drawnOpacity(tester, tagline), 0);

    // Nothing moves until the first frames are past and the picture is in.
    await startSplash(tester);
    expect(trolleyOffset(tester), lessThan(-200));

    // On its way in, decelerating.
    await tester.pump(const Duration(milliseconds: 650));
    final arriving = trolleyOffset(tester);
    expect(arriving, lessThan(0));
    expect(arriving, greaterThan(-200));

    // At rest in the middle, and the name starting to come up beneath it.
    await tester.pump(const Duration(milliseconds: 650));
    expect(trolleyOffset(tester), closeTo(0, 0.5));
    final naming = drawnOpacity(tester, name);
    expect(naming, greaterThan(0));
    expect(naming, lessThan(1));

    // The name, then the line under it, both fully there.
    await tester.pump(const Duration(milliseconds: 500));
    expect(drawnOpacity(tester, name), 1);
    expect(drawnOpacity(tester, tagline), 1);
    expect(finished, isFalse);

    await tester.pump(SplashScreen.hold);
    expect(finished, isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('starts moving on its own within a few frames', (tester) async {
    // The regression: on a phone the clock never started and the splash was
    // an empty page. Nothing async may stand between the first frames and
    // the trolley moving.
    // Fourteen frames: the arrival waits 150 ms on the clock before it moves,
    // so a handful is no longer enough to see it go.
    await pumpSplash(tester, onFinished: () {});
    final before = trolleyOffset(tester);
    for (var i = 0; i < 14; i++) {
      await tester.pump(const Duration(milliseconds: 16));
    }
    expect(trolleyOffset(tester), greaterThan(before));
    await tester.pump(SplashScreen.hold);
  });

  testWidgets('leaves to the right, the name fading after it', (tester) async {
    await pumpSplash(tester, onFinished: () {});
    await startSplash(tester);

    await tester.pump(const Duration(milliseconds: 2400));
    expect(trolleyOffset(tester), closeTo(0, 0.5));

    // Mid-exit: the trolley has gathered speed to the right, and the name is
    // part-way gone rather than cut.
    await tester.pump(const Duration(milliseconds: 550));
    expect(trolleyOffset(tester), greaterThan(0));
    final leaving = drawnOpacity(tester, name);
    expect(leaving, lessThan(1));
    expect(leaving, greaterThan(0));
    expect(drawnOpacity(tester, tagline), 0);

    await tester.pump(SplashScreen.hold);
  });

  testWidgets('still appears, and still takes its time, when the platform '
      'asks for less motion', (tester) async {
    // The splash used to be skipped outright in this case, and the controller
    // separately compressed its run twentyfold — so it vanished twice over
    // and looked like a broken app.
    debugSemanticsDisableAnimations = true;
    addTearDown(() => debugSemanticsDisableAnimations = null);

    var finished = false;
    await pumpSplash(
      tester,
      onFinished: () => finished = true,
      disableAnimations: true,
    );

    // Nothing travels: the trolley fades in where it rests.
    expect(trolleyOffset(tester), closeTo(0, 0.5));
    expect(drawnOpacity(tester, find.byType(Illustration)), 0);

    await startSplash(tester);
    await tester.pump(const Duration(milliseconds: 1500));
    expect(trolleyOffset(tester), closeTo(0, 0.5));
    expect(drawnOpacity(tester, find.byType(Illustration)), 1);
    expect(drawnOpacity(tester, name), 1);
    expect(
      finished,
      isFalse,
      reason: 'AnimationBehavior.preserve must keep the full duration',
    );

    await tester.pump(SplashScreen.hold);
    expect(finished, isTrue);
  });
}
