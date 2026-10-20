import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/providers/theme_provider.dart';
import 'package:atara/screens/settings_screen.dart';
import 'package:atara/theme/app_theme.dart';

Future<ProviderContainer> pumpSettings(WidgetTester tester) async {
  final container = ProviderContainer();
  addTearDown(container.dispose);

  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        locale: const Locale('id'),
        theme: AppTheme.light,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: const SettingsScreen(),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return container;
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  tearDown(SharedPreferences.resetStatic);

  testWidgets('offers the three appearances and follows the system by default',
      (tester) async {
    final container = await pumpSettings(tester);

    expect(find.text('Tampilan'), findsOneWidget);
    expect(find.text('Ikuti Sistem'), findsOneWidget);
    expect(find.text('Terang'), findsOneWidget);
    expect(find.text('Gelap'), findsOneWidget);

    expect(container.read(themeModeProvider), ThemeMode.system);
  });

  testWidgets('choosing dark takes effect and is written down', (tester) async {
    final container = await pumpSettings(tester);

    await tester.tap(find.text('Gelap'));
    await tester.pumpAndSettle();

    expect(container.read(themeModeProvider), ThemeMode.dark);

    final store = await SharedPreferences.getInstance();
    expect(store.getString('atara_theme_mode'), 'dark');
  });

  testWidgets('a stored choice is read back on the next launch',
      (tester) async {
    SharedPreferences.setMockInitialValues({'atara_theme_mode': 'light'});

    final container = await pumpSettings(tester);

    expect(container.read(themeModeProvider), ThemeMode.light);
    // The tick follows what is in force, the way the language rows do.
    final ticks = find.byWidgetPredicate(
      (widget) => widget is Icon && widget.icon == CupertinoIcons.check_mark,
    );
    expect(ticks, findsNWidgets(2)); // one appearance, one language
  });

  testWidgets('going back to the system clears the stored value',
      (tester) async {
    SharedPreferences.setMockInitialValues({'atara_theme_mode': 'dark'});
    final container = await pumpSettings(tester);
    expect(container.read(themeModeProvider), ThemeMode.dark);

    await tester.tap(find.text('Ikuti Sistem'));
    await tester.pumpAndSettle();

    expect(container.read(themeModeProvider), ThemeMode.system);
    final store = await SharedPreferences.getInstance();
    expect(
      store.getString('atara_theme_mode'),
      isNull,
      reason: 'absent and "follow the device" have to be the same state, or a '
          'fresh install would differ from one that was reset',
    );
  });
}
