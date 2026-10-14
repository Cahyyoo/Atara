import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/screens/onboarding_screen.dart';
import 'package:atara/services/settings_service.dart';
import 'package:atara/theme/app_theme.dart';

/// The welcome, then the four things a preparator has to know.
///
/// Named so that adding a sixth page breaks one line rather than four loops.
const int kGuidePages = 5;

const welcomeId = 'Panduan singkat sebelum Anda mulai memindai sampel.';
const welcomeEn = 'A short guide before you start scanning samples.';

Future<void> pumpGuide(
  WidgetTester tester, {
  bool isFirstRun = true,
  Locale locale = const Locale('id'),
}) async {
  await tester.pumpWidget(
    ProviderScope(
      // A Material host carrying an entirely Cupertino interface, exactly as
      // the real app does — so the theme these screens read is the real one.
      child: MaterialApp(
        locale: locale,
        theme: AppTheme.light,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: OnboardingScreen(isFirstRun: isFirstRun),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// Walks to the last page by tapping through, settling between taps so the
/// page animation finishes before the next one starts.
Future<void> tapToLastPage(WidgetTester tester, String next) async {
  for (var i = 0; i < kGuidePages - 1; i++) {
    await tester.tap(find.text(next));
    await tester.pumpAndSettle();
  }
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('shows one page at a time and ends on the start button',
      (tester) async {
    await pumpGuide(tester);

    expect(find.text(welcomeId), findsOneWidget);
    expect(find.text('Pindai label sampel'), findsNothing);

    await tester.tap(find.text('Lanjut'));
    await tester.pumpAndSettle();
    expect(find.text('Pindai label sampel'), findsOneWidget);

    await tester.tap(find.text('Lanjut'));
    await tester.pumpAndSettle();
    expect(find.text('Perbarui tahapnya'), findsOneWidget);

    await tester.tap(find.text('Lanjut'));
    await tester.pumpAndSettle();
    expect(find.text('Tanpa sinyal tetap jalan'), findsOneWidget);

    await tester.tap(find.text('Lanjut'));
    await tester.pumpAndSettle();
    expect(find.text('Lihat hasil kerja Anda'), findsOneWidget);

    // The last page offers the way in, and drops the shortcut past it.
    expect(find.text('Mulai'), findsOneWidget);
    expect(find.text('Lanjut'), findsNothing);
    expect(find.text('Lewati'), findsNothing);
  });

  testWidgets('swiping moves between pages too', (tester) async {
    await pumpGuide(tester);

    await tester.drag(find.byType(PageView), const Offset(-400, 0));
    await tester.pumpAndSettle();

    expect(find.text('Pindai label sampel'), findsOneWidget);
  });

  testWidgets('skipping records the guide as seen', (tester) async {
    await pumpGuide(tester);

    await tester.tap(find.text('Lewati'));
    await tester.pumpAndSettle();

    expect(await SettingsService.getOnboardingSeen(), isTrue);
  });

  testWidgets('finishing the last page records it as seen', (tester) async {
    await pumpGuide(tester);
    await tapToLastPage(tester, 'Lanjut');

    await tester.tap(find.text('Mulai'));
    await tester.pumpAndSettle();

    expect(await SettingsService.getOnboardingSeen(), isTrue);
  });

  testWidgets('announces where in the guide the preparator is', (tester) async {
    await pumpGuide(tester);

    // The dots carry no text, so the position has to be said outright.
    expect(find.bySemanticsLabel('Halaman 1 dari 5'), findsOneWidget);

    await tester.tap(find.text('Lanjut'));
    await tester.pumpAndSettle();

    expect(find.bySemanticsLabel('Halaman 2 dari 5'), findsOneWidget);

    // Already one page in, so three more taps reach the end.
    for (var i = 0; i < kGuidePages - 2; i++) {
      await tester.tap(find.text('Lanjut'));
      await tester.pumpAndSettle();
    }
    expect(find.bySemanticsLabel('Halaman 5 dari 5'), findsOneWidget);
  });

  testWidgets('reads in English too', (tester) async {
    await pumpGuide(tester, locale: const Locale('en'));

    expect(find.text(welcomeEn), findsOneWidget);
    expect(find.text('Next'), findsOneWidget);
  });

  group('reopened from Settings', () {
    testWidgets('has a bar and no skip, and leaves the flag alone',
        (tester) async {
      await pumpGuide(tester, isFirstRun: false);

      expect(find.text('Panduan Singkat'), findsOneWidget);
      expect(find.text('Lewati'), findsNothing);

      await tapToLastPage(tester, 'Lanjut');

      // "Selesai", not "Mulai": there is nothing to start, only a page to
      // leave. And re-reading the guide is not the same as first seeing it,
      // so nothing is written.
      expect(find.text('Selesai'), findsOneWidget);
      expect(find.text('Mulai'), findsNothing);

      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getBool('atara_onboarding_seen'), isNull);
    });

    testWidgets('pops back to where it was opened from', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            locale: const Locale('id'),
            theme: AppTheme.light,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: Builder(
              builder: (context) => CupertinoPageScaffold(
                child: Center(
                  child: CupertinoButton(
                    onPressed: () => Navigator.of(context).push(
                      CupertinoPageRoute(
                        builder: (context) => const OnboardingScreen(),
                      ),
                    ),
                    child: const Text('open'),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      expect(find.byType(OnboardingScreen), findsOneWidget);

      await tapToLastPage(tester, 'Lanjut');
      await tester.tap(find.text('Selesai'));
      await tester.pumpAndSettle();

      expect(find.byType(OnboardingScreen), findsNothing);
      expect(find.text('open'), findsOneWidget);
    });
  });

  testWidgets('survives a narrow screen at a large text size', (tester) async {
    // The convention the other layout tests use: a small phone, then the
    // system font pushed up. A fixed-height page column would overflow here,
    // and RenderFlex throws when it does.
    tester.view.physicalSize = const Size(320 * 3, 640 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          locale: const Locale('id'),
          theme: AppTheme.light,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Builder(
            builder: (context) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: const TextScaler.linear(1.5)),
              child: const OnboardingScreen(isFirstRun: true),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    for (var i = 0; i < kGuidePages - 1; i++) {
      await tester.tap(find.text('Lanjut'));
      await tester.pumpAndSettle();
    }

    expect(tester.takeException(), isNull);
    // The page body scrolls, so it cannot RenderFlex-overflow and
    // takeException alone would pass even if the loop never reached the end.
    expect(find.text('Mulai'), findsOneWidget);
  });
}
