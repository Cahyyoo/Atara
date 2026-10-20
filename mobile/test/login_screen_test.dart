import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/models/login_result.dart';
import 'package:atara/providers/session_provider.dart';
import 'package:atara/screens/login_screen.dart';
import 'package:atara/screens/second_factor_screen.dart';
import 'package:atara/screens/settings_screen.dart';
import 'package:atara/services/api_exception.dart';
import 'package:atara/services/time_text.dart';
import 'package:atara/theme/app_theme.dart';
import 'package:atara/widgets/ios/ios_button.dart';

/// A session notifier that fails the way we ask it to, so the screen's response
/// to each kind of failure can be tested without a server.
class _FailingSession extends SessionNotifier {
  _FailingSession(this.error);

  final Object error;

  @override
  Future<LoginResult> login(String email, String password) async {
    throw error;
  }
}

/// A password that asks for a code, and a code that passes — for an account
/// that is not a preparator. The refusal happens after the second factor, on a
/// different route from the one that has to say it.
class _NonPreparatorAfterCode extends SessionNotifier {
  @override
  Future<LoginResult> login(String email, String password) async {
    return const LoginSecondFactor(
      challenge: 'c',
      name: 'Main Admin',
      methods: [SecondFactorMethod.totp],
      expiresIn: Duration(seconds: 120),
      hasUnsupportedMethods: false,
    );
  }

  @override
  Future<LoginResult> verifyTotp({
    required String challenge,
    required String code,
  }) async {
    throw const PreparatorOnlyException();
  }
}

Future<void> pumpLogin(
  WidgetTester tester, {
  Object? loginError,
  SessionNotifier? session,
  SessionReplaced? replaced,
  Locale locale = const Locale('id'),
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        if (replaced != null)
          signedOutNoticeProvider.overrideWith((ref) => replaced),
        if (session != null)
          sessionProvider.overrideWith((ref) => session)
        else if (loginError != null)
          sessionProvider.overrideWith((ref) => _FailingSession(loginError)),
      ],
      // A Material host carrying an entirely Cupertino interface, exactly as
      // the real app does — so the theme these screens read is the real one.
      child: MaterialApp(
        locale: locale,
        theme: AppTheme.light,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: const LoginScreen(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> submit(WidgetTester tester) async {
  await tester.enterText(
    find.byType(CupertinoTextField).first,
    'preparator@atara.local',
  );
  await tester.enterText(find.byType(CupertinoTextField).last, 'secret');
  // The sign-in button leads; the settings shortcut sits under it.
  await tester.tap(find.byType(AppButton).first);
  await tester.pumpAndSettle();
}

/// Section headings are drawn in the case they were written in.
final serverHeading = find.text('Alamat Server');

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('offers settings without signing in first', (tester) async {
    await pumpLogin(tester);

    final gear = find.text('Pengaturan server');
    expect(gear, findsOneWidget);

    await tester.tap(gear);
    await tester.pumpAndSettle();

    // The whole point: the server address is reachable from here.
    expect(find.byType(SettingsScreen), findsOneWidget);
    expect(serverHeading, findsOneWidget);
  });

  testWidgets('hints both fields and starts in the email box', (tester) async {
    await pumpLogin(tester);

    expect(find.text('nama@atara.local'), findsOneWidget);
    expect(find.text('Kata sandi Anda'), findsOneWidget);

    // Asserting the effect rather than the prop: the email field really holds
    // focus once the screen has settled.
    final email = tester.widget<EditableText>(find.byType(EditableText).first);
    expect(email.focusNode.hasFocus, isTrue);
  });

  testWidgets('announces a failure rather than only recolouring it', (
    tester,
  ) async {
    await pumpLogin(
      tester,
      loginError: const ApiException(
        'Salah',
        statusCode: 401,
        kind: ApiErrorKind.server,
      ),
    );
    await submit(tester);

    final announced = find.byWidgetPredicate(
      (widget) => widget is Semantics && widget.properties.liveRegion == true,
    );
    expect(announced, findsWidgets);
  });

  // One pump per test: pumping a second tree of the same shape reuses the
  // State, so the first failure would still be on screen.
  testWidgets('does not blame the address when the password was refused', (
    tester,
  ) async {
    await pumpLogin(
      tester,
      loginError: const ApiException(
        'Salah',
        statusCode: 401,
        kind: ApiErrorKind.server,
      ),
    );
    await submit(tester);

    expect(find.textContaining('Salah'), findsOneWidget);
    expect(find.text('Periksa alamat server'), findsNothing);
  });

  testWidgets('points at the address when the server was never reached', (
    tester,
  ) async {
    await pumpLogin(
      tester,
      loginError: const ApiException('offline', kind: ApiErrorKind.unreachable),
    );
    await submit(tester);

    expect(find.text('Periksa alamat server'), findsOneWidget);
  });

  testWidgets('the offer leads to the server address', (tester) async {
    await pumpLogin(
      tester,
      loginError: const ApiException('offline', kind: ApiErrorKind.unreachable),
    );
    await submit(tester);

    await tester.tap(find.text('Periksa alamat server'));
    await tester.pumpAndSettle();

    expect(find.byType(SettingsScreen), findsOneWidget);
    expect(serverHeading, findsOneWidget);
  });

  testWidgets('turns away an account that is not a preparator', (
    tester,
  ) async {
    await pumpLogin(tester, loginError: const PreparatorOnlyException());
    await submit(tester);

    expect(
      find.text('Aplikasi ini khusus Preparator. Silakan gunakan situs web.'),
      findsOneWidget,
    );
    expect(find.text('Periksa alamat server'), findsNothing);
  });

  testWidgets('says the same after a second factor, back on this screen', (
    tester,
  ) async {
    await pumpLogin(tester, session: _NonPreparatorAfterCode());
    await submit(tester);
    expect(find.byType(SecondFactorScreen), findsOneWidget);

    // Six digits submit on their own.
    await tester.enterText(find.byType(CupertinoTextField), '123456');
    await tester.pumpAndSettle();

    expect(find.byType(SecondFactorScreen), findsNothing);
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(
      find.text('Aplikasi ini khusus Preparator. Silakan gunakan situs web.'),
      findsOneWidget,
    );
  });

  testWidgets('reads in English too', (tester) async {
    await pumpLogin(tester, locale: const Locale('en'));
    expect(find.text('name@atara.local'), findsOneWidget);
    expect(find.text('Your password'), findsOneWidget);
  });

  group('signed out because another device took over', () {
    testWidgets('says so, with the time and the phone', (tester) async {
      final at = DateTime.now();
      await pumpLogin(
        tester,
        replaced: SessionReplaced(device: 'Aplikasi · iOS', at: at),
      );

      final time = momentText(at, localeName: 'id');
      expect(
        find.text(
          'Akun Anda dibuka di HP lain (Aplikasi · iOS) pukul $time, '
          'jadi Anda dikeluarkan dari HP ini.',
        ),
        findsOneWidget,
      );
      expect(liveRegions, findsOneWidget, reason: 'announced, not only shown');
    });

    testWidgets('in English, and without a device', (tester) async {
      final at = DateTime.now();
      await pumpLogin(
        tester,
        replaced: SessionReplaced(at: at),
        locale: const Locale('en'),
      );

      final time = momentText(at, localeName: 'en');
      expect(
        find.text(
          'Your account was opened on another phone at $time, '
          'so you were signed out here.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('names the other device, one row per thing known', (
      tester,
    ) async {
      final at = DateTime.now();
      await pumpLogin(
        tester,
        replaced: SessionReplaced(
          device: 'Microsoft Edge · Windows',
          at: at,
          deviceInfo: const DeviceInfo(
            kind: DeviceKind.desktop,
            os: 'Windows',
            osVersion: '10/11',
            browser: 'Microsoft Edge',
            browserVersion: '129',
          ),
        ),
      );

      final time = momentText(at, localeName: 'id');
      expect(
        find.text(
          'Akun Anda dibuka di perangkat lain pukul $time, '
          'sehingga Anda dikeluarkan dari HP ini.',
        ),
        findsOneWidget,
      );
      expect(find.text('Perangkat: Komputer'), findsOneWidget);
      expect(find.text('Sistem: Windows 10/11'), findsOneWidget);
      expect(find.text('Browser: Microsoft Edge 129'), findsOneWidget);
      // Nothing known, nothing said: no model row, no "Aplikasi" row.
      expect(find.textContaining('Model:'), findsNothing);
      expect(find.textContaining('Aplikasi:'), findsNothing);
      // The one-line label is not repeated under the rows.
      expect(find.textContaining('Microsoft Edge · Windows'), findsNothing);
      expect(liveRegions, findsOneWidget);
    });

    testWidgets('in English, the app instead of a browser', (tester) async {
      final at = DateTime.now();
      await pumpLogin(
        tester,
        locale: const Locale('en'),
        replaced: SessionReplaced(
          at: at,
          deviceInfo: const DeviceInfo(
            kind: DeviceKind.phone,
            os: 'Android',
            osVersion: '14',
            model: 'Samsung SM-A515F',
            app: true,
          ),
        ),
      );

      final time = momentText(at, localeName: 'en');
      expect(
        find.text(
          'Your account was opened on another device at $time, '
          'so you were signed out on this phone.',
        ),
        findsOneWidget,
      );
      expect(find.text('Device: Phone'), findsOneWidget);
      expect(find.text('System: Android 14'), findsOneWidget);
      expect(find.text('App: Atara Lab'), findsOneWidget);
      expect(find.text('Model: Samsung SM-A515F'), findsOneWidget);
      expect(find.textContaining('Browser:'), findsNothing);
    });

    testWidgets('the app row reads in Indonesian too', (tester) async {
      await pumpLogin(
        tester,
        replaced: SessionReplaced(
          at: DateTime.now(),
          deviceInfo: const DeviceInfo(
            kind: DeviceKind.tablet,
            os: 'iOS',
            osVersion: '17.5',
            app: true,
          ),
        ),
      );

      expect(find.text('Perangkat: Tablet'), findsOneWidget);
      expect(find.text('Sistem: iOS 17.5'), findsOneWidget);
      expect(find.text('Aplikasi: Atara Lab'), findsOneWidget);
      expect(find.textContaining('Browser:'), findsNothing);
    });

    testWidgets('only the rows that have a value', (tester) async {
      await pumpLogin(
        tester,
        locale: const Locale('en'),
        replaced: const SessionReplaced(
          deviceInfo: DeviceInfo(os: 'Linux', browser: 'Firefox'),
        ),
      );

      expect(
        find.text(
          'Your account was opened on another device, '
          'so you were signed out on this phone.',
        ),
        findsOneWidget,
      );
      expect(find.text('System: Linux'), findsOneWidget);
      expect(find.text('Browser: Firefox'), findsOneWidget);
      expect(find.textContaining('Device:'), findsNothing);
      expect(find.textContaining('Model:'), findsNothing);
      expect(find.textContaining('App:'), findsNothing);
    });

    testWidgets('an ordinary sign-in screen says nothing of the sort', (
      tester,
    ) async {
      await pumpLogin(tester);
      expect(find.textContaining('HP lain'), findsNothing);
    });

    testWidgets('trying again puts the notice away', (tester) async {
      await pumpLogin(
        tester,
        replaced: SessionReplaced(at: DateTime.now()),
        loginError: const ApiException(
          'Salah',
          statusCode: 401,
          kind: ApiErrorKind.server,
        ),
      );
      expect(find.textContaining('HP lain'), findsOneWidget);

      await submit(tester);

      expect(find.textContaining('HP lain'), findsNothing);
      expect(find.textContaining('Salah'), findsOneWidget);
    });
  });
}

/// Whatever the screen is announcing: a failure, or the takeover notice.
final liveRegions = find.byWidgetPredicate(
  (widget) => widget is Semantics && widget.properties.liveRegion == true,
);
