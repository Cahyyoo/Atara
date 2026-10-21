import 'dart:io';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/screens/home_screen.dart';
import 'package:atara/screens/home_shell.dart';
import 'package:atara/screens/settings_screen.dart';
import 'package:atara/theme/app_theme.dart';
import 'package:atara/widgets/ios/app_page.dart';

/// The flash of "Pengaturan" on a page opened from Home.
///
/// Every visited tab stays built, hidden, in the shell's one route, and each
/// tab's navigation bar carries the Hero that flies a title between routes. A
/// page pushed from Home took its title's flight from the hidden Settings bar.
/// Only the tab on show may take part now.
void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    HttpOverrides.global = _UnreachableServer();
  });
  tearDown(() => HttpOverrides.global = null);

  Future<void> openSettingsThenHome(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          locale: const Locale('id'),
          theme: AppTheme.light,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: const HomeShell(),
        ),
      ),
    );
    await tester.pump(const Duration(seconds: 1));
    await tester.tap(find.byIcon(CupertinoIcons.gear));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.tap(find.byIcon(CupertinoIcons.house));
    await tester.pump(const Duration(milliseconds: 500));
  }

  testWidgets('a hidden tab takes no part in a page transition', (
    tester,
  ) async {
    await openSettingsThenHome(tester);

    HeroMode heroModeAbove(Type screen) => tester.widget<HeroMode>(
      find
          .ancestor(
            of: find.byType(screen, skipOffstage: false),
            matching: find.byType(HeroMode, skipOffstage: false),
          )
          .first,
    );

    expect(heroModeAbove(SettingsScreen).enabled, isFalse);
    expect(heroModeAbove(HomeScreen).enabled, isTrue);
  });

  testWidgets(
    'a page pushed from Home never shows "Pengaturan" on its way in',
    (tester) async {
      await openSettingsThenHome(tester);
      // Once, in the tab bar, before anything is pushed.
      expect(find.text('Pengaturan'), findsOneWidget);

      final home = tester.element(find.byType(HomeScreen));
      Navigator.of(home).push(
        CupertinoPageRoute<void>(
          builder: (context) =>
              AppPage.list(title: 'Halaman Uji', children: const []),
        ),
      );

      for (var frame = 0; frame < 30; frame++) {
        await tester.pump(const Duration(milliseconds: 16));
        expect(
          find.text('Pengaturan').evaluate().length,
          lessThanOrEqualTo(1),
          reason: 'frame $frame borrowed the hidden Settings title',
        );
      }
      await tester.pump(const Duration(seconds: 15));
      tester.takeException();
    },
  );
}

class _UnreachableServer extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) => _FailingClient();
}

class _FailingClient implements HttpClient {
  @override
  Future<HttpClientRequest> openUrl(String method, Uri url) async {
    throw const SocketException('no route to host in a test');
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
