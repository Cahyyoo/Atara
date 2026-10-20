import 'dart:convert';

import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/main.dart';
import 'package:atara/models/login_result.dart';
import 'package:atara/models/user_model.dart';
import 'package:atara/screens/change_password_screen.dart';
import 'package:atara/screens/home_shell.dart';
import 'package:atara/screens/login_screen.dart';
import 'package:atara/services/session_service.dart';

import 'support/splash.dart';

/// The password an administrator chose has to go before the app is usable.
///
/// It matters most here: a preparator is handed the password every Preparator
/// shares, and the phone is where they work. The server refuses this session
/// everything until it is replaced, so the app must not pretend otherwise.

String _storedUser({required bool mustChangePassword}) => jsonEncode({
  'id': 'u1',
  'name': 'Siti',
  'email': 'siti@atara.local',
  'role': 'PREPARATOR',
  'mustChangePassword': mustChangePassword,
});

Future<void> launch(WidgetTester tester) async {
  await tester.pumpWidget(const ProviderScope(child: AtaraApp()));
  await pumpPastSplash(tester);
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  testWidgets('a session owing a password change opens on the change screen', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({
      'atara_onboarding_seen': true,
      'atara_token': 'stored.jwt',
      'atara_user': _storedUser(mustChangePassword: true),
    });

    await launch(tester);

    expect(find.byType(ChangePasswordScreen), findsOneWidget);
    expect(find.byType(HomeShell), findsNothing);
    // Nowhere to slip past it: no back button, only the way out.
    expect(find.byType(CupertinoNavigationBarBackButton), findsNothing);
  });

  testWidgets(
    'a preparator whose password is their own goes straight to work',
    (tester) async {
      SharedPreferences.setMockInitialValues({
        'atara_onboarding_seen': true,
        'atara_token': 'stored.jwt',
        'atara_user': _storedUser(mustChangePassword: false),
      });

      await launch(tester);

      expect(find.byType(HomeShell), findsOneWidget);
      expect(find.byType(ChangePasswordScreen), findsNothing);
    },
  );

  testWidgets('no session still goes to sign-in, not the change screen', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({'atara_onboarding_seen': true});

    await launch(tester);

    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.byType(ChangePasswordScreen), findsNothing);
  });

  group('the duty travels with the stored session', () {
    setUp(() => SharedPreferences.setMockInitialValues({}));

    test('a sign-in body carrying the flag lands on the user', () {
      final result = LoginResult.parse({
        'data': {
          'token': 'jwt',
          'mustChangePassword': true,
          'user': {
            'id': 'u1',
            'name': 'Siti',
            'email': 'siti@atara.local',
            'role': 'PREPARATOR',
          },
        },
      });
      expect(result, isA<LoginSession>());
      expect((result as LoginSession).user.mustChangePassword, isTrue);
    });

    test('a body without the flag leaves the preparator alone', () {
      final result = LoginResult.parse({
        'data': {
          'token': 'jwt',
          'user': {
            'id': 'u1',
            'name': 'Siti',
            'email': 'siti@atara.local',
            'role': 'PREPARATOR',
          },
        },
      });
      expect((result as LoginSession).user.mustChangePassword, isFalse);
    });

    test('it survives being written and read back', () async {
      const user = UserModel(
        id: 'u1',
        name: 'Siti',
        email: 'siti@atara.local',
        role: UserRole.preparator,
        mustChangePassword: true,
      );
      await SessionService.saveSession('jwt', user);
      expect((await SessionService.getUser())!.mustChangePassword, isTrue);

      // Discharged once the preparator picks their own.
      await SessionService.setMustChangePassword(false);
      expect((await SessionService.getUser())!.mustChangePassword, isFalse);
    });

    test('a user stored by an older build is not held back', () async {
      SharedPreferences.setMockInitialValues({
        'atara_token': 'jwt',
        'atara_user': jsonEncode({
          'id': 'u1',
          'name': 'Siti',
          'email': 'siti@atara.local',
          'role': 'PREPARATOR',
        }),
      });
      expect((await SessionService.getUser())!.mustChangePassword, isFalse);
    });
  });

  group('why the session ended', () {
    test('an administrator ending it is told apart from a password change', () {
      final admin = SessionEnded.fromDetails({
        'at': '2026-09-30T06:30:00.000Z',
        'reason': 'ADMIN_ENDED',
      });
      expect(admin.wasPasswordChange, isFalse);
      expect(admin.at, DateTime.utc(2026, 9, 30, 6, 30));

      final changed = SessionEnded.fromDetails({'reason': 'PASSWORD_CHANGED'});
      expect(changed.wasPasswordChange, isTrue);
      expect(changed.at, isNull);
    });

    test('a reason this build has never heard of still reads', () {
      final odd = SessionEnded.fromDetails({'reason': 'SOMETHING_NEW'});
      expect(odd.wasPasswordChange, isFalse);
    });
  });

  testWidgets('both locales name every string the change screen uses', (
    tester,
  ) async {
    for (final locale in const [Locale('id'), Locale('en')]) {
      final missing = <String>[];
      await tester.pumpWidget(
        ProviderScope(
          child: CupertinoApp(
            locale: locale,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            onGenerateTitle: (_) => '',
            home: Builder(
              builder: (context) {
                final l10n = AppLocalizations.of(context)!;
                for (final text in [
                  l10n.changePasswordTitle,
                  l10n.changePasswordBody,
                  l10n.changePasswordForcedBody,
                  l10n.changePasswordSubmit,
                  l10n.passwordCurrent,
                  l10n.passwordNew,
                  l10n.passwordConfirm,
                  l10n.passwordRuleHint(8),
                  l10n.passwordCurrentWrong,
                  l10n.passwordIsRoleDefault,
                  l10n.passwordChanged,
                  l10n.sessionEndedByAdmin,
                  l10n.sessionEndedPasswordChanged,
                  l10n.announcementDismiss,
                ]) {
                  if (text.isEmpty) missing.add(text);
                }
                return const SizedBox.shrink();
              },
            ),
          ),
        ),
      );
      await tester.pump();
      expect(missing, isEmpty, reason: 'locale ${locale.languageCode}');
    }
  });
}
