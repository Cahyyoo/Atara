import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/screens/splash_screen.dart';
import 'package:atara/theme/app_theme.dart';
import 'package:atara/widgets/brand_mark.dart';

/// The opacity the named widget is currently being drawn at.
///
/// Every stage is a `FadeTransition`, so its animation value is the honest
/// answer to "has this stage arrived yet" — and unlike a widget field it is
/// what the render object actually uses.
double stageOpacity(WidgetTester tester, Finder of) {
  final fade = tester.widget<FadeTransition>(
    find.ancestor(of: of, matching: find.byType(FadeTransition)).first,
  );
  return fade.opacity.value;
}

/// How far the loading line has filled, 0 to 1.
///
/// This is the one thing on the splash that the Android launch window does
/// not also have, so it is the signal that Flutter is the one drawing.
double lineFill(WidgetTester tester) {
  final box = tester.widget<FractionallySizedBox>(
    find.byType(FractionallySizedBox),
  );
  return box.widthFactor ?? 0;
}

/// The scale the mark is currently drawn at. It starts slightly large and
/// contracts, which is the moment Flutter takes over made visible.
double markScale(WidgetTester tester) {
  final scale = tester.widget<ScaleTransition>(
    find.ancestor(
      of: find.byType(BrandGlyph),
      matching: find.byType(ScaleTransition),
    ).first,
  );
  return scale.scale.value;
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
          data: MediaQuery.of(context)
              .copyWith(disableAnimations: disableAnimations),
          child: SplashScreen(onFinished: onFinished),
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('settles the mark, then fills the line, then names itself',
      (tester) async {
    var finished = false;
    await pumpSplash(tester, onFinished: () => finished = true);

    final mark = find.byType(BrandGlyph);
    final name = find.text('Atara Preparator');

    // Frame 0 is the launch window's composition, carried over — the mark is
    // already there, a touch large, with nothing else said yet.
    expect(mark, findsOneWidget);
    expect(markScale(tester), closeTo(1.06, 0.001));
    expect(lineFill(tester), 0);
    expect(stageOpacity(tester, name), 0);

    // The mark comes to rest. This is the handoff, made visible: without it
    // the only thing distinguishing this screen from the system window that
    // preceded it was a 2pt hairline.
    await tester.pump(const Duration(milliseconds: 200));
    final settling = markScale(tester);
    expect(settling, lessThan(1.06));
    expect(settling, greaterThan(1.0));

    // Then the line, which is the proof Flutter is the one drawing.
    await tester.pump(const Duration(milliseconds: 200));
    expect(markScale(tester), closeTo(1.0, 0.005));
    expect(
      lineFill(tester),
      greaterThan(0),
      reason: 'the line is what tells the preparator Flutter has taken over',
    );

    // The name follows the line rather than racing it.
    await tester.pump(const Duration(milliseconds: 200));
    final arriving = stageOpacity(tester, name);
    expect(arriving, greaterThan(0));
    expect(arriving, lessThan(1));

    await tester.pump(const Duration(milliseconds: 400));
    expect(stageOpacity(tester, name), 1);
    expect(lineFill(tester), 1);
    expect(finished, isFalse);

    await tester.pump(SplashScreen.hold);
    expect(finished, isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('still appears, and still takes its time, when the platform '
      'asks for less motion', (tester) async {
    // The regression this file exists for. The splash used to be skipped
    // outright in this case, and the controller separately compressed 900ms to
    // 45ms — so it vanished twice over and looked like a broken app.
    debugSemanticsDisableAnimations = true;
    addTearDown(() => debugSemanticsDisableAnimations = null);

    var finished = false;
    await pumpSplash(
      tester,
      onFinished: () => finished = true,
      disableAnimations: true,
    );

    expect(find.byType(BrandGlyph), findsOneWidget);
    expect(find.text('Atara Preparator'), findsOneWidget);

    // Well past the 45ms a compressed controller would have taken.
    await tester.pump(const Duration(milliseconds: 200));
    expect(
      finished,
      isFalse,
      reason: 'AnimationBehavior.preserve must keep the full duration',
    );

    await tester.pump(SplashScreen.hold);
    expect(finished, isTrue);
  });

  testWidgets('fades out rather than cutting', (tester) async {
    await pumpSplash(tester, onFinished: () {});

    await tester.pump(const Duration(milliseconds: 1280));
    final exit = tester.widget<FadeTransition>(find.byType(FadeTransition).first);
    expect(exit.opacity.value, lessThan(1));
    expect(exit.opacity.value, greaterThan(0));

    await tester.pump(SplashScreen.hold);
  });
}
