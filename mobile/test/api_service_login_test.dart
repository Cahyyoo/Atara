import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:atara/models/login_result.dart';
import 'package:atara/services/api_exception.dart';
import 'package:atara/models/user_model.dart';
import 'package:atara/providers/session_provider.dart';
import 'package:atara/services/api_service.dart';
import 'package:atara/services/session_service.dart';

/// The sign-in call, over a fake socket.
///
/// `login()` used to do four hard casts on the reply and persist the session as a
/// side effect. Against an account with a second factor the first cast threw a
/// `TypeError` — and that is the whole reason the failure was unreadable: a
/// `TypeError` is not a `DioException`, so the `on DioException` catch one line
/// below it never fired, and nothing between there and the login screen's bare
/// `catch (_)` could tell the preparator anything useful.
///
/// These tests reach the interceptors, the error mapping and the parser together,
/// which is the seam the pure parser tests cannot cover.
class _ScriptedAdapter implements HttpClientAdapter {
  _ScriptedAdapter(this.answer);

  /// Given a request path, the status and JSON body to answer with.
  final ({int status, String body}) Function(String path) answer;

  final List<String> requested = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requested.add(options.path);
    final reply = answer(options.path);
    return ResponseBody.fromString(
      reply.body,
      reply.status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

/// The body the server sends when a second factor is owed.
///
/// web/src/app/api/auth/login/route.ts:106-114 — HTTP 200, `success: true`, and
/// no token.
const secondFactorBody = '''
{"success": true,
 "data": {"mfaRequired": true, "methods": ["totp"],
          "challenge": "challenge.jwt", "expiresIn": 120,
          "user": {"name": "Main Admin"}}}
''';

/// A session reply for an account holding [role], exactly as the server spells it.
String sessionBodyFor(String role) =>
    '''
{"success": true,
 "data": {"mfaRequired": false, "token": "session.jwt",
          "user": {"id": "u1", "name": "Siti Preparator",
                   "email": "preparator@atara.local", "role": "$role"}}}
''';

final sessionBody = sessionBodyFor('PREPARATOR');

/// The stored account a signed-in preparator would have.
const _preparator = UserModel(
  id: 'u1',
  name: 'Siti Preparator',
  email: 'preparator@atara.local',
  role: UserRole.preparator,
);

/// Lets the notifier's constructor-time restore finish.
Future<SessionNotifier> restoredNotifier() async {
  final notifier = SessionNotifier();
  while (notifier.state.isLoading) {
    await Future<void>.delayed(Duration.zero);
  }
  return notifier;
}

void main() {
  late HttpClientAdapter original;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    original = ApiService.instance.httpClientAdapter;
  });

  tearDown(() {
    // The service is a singleton, so leaving a fake transport behind would leak
    // into every later test in this file's isolate.
    ApiService.instance.httpClientAdapter = original;
    ApiService.instance.onUnauthorized = null;
    SharedPreferences.resetStatic();
  });

  test('a second-factor reply comes back as a result, not a crash', () async {
    ApiService.instance.httpClientAdapter = _ScriptedAdapter(
      (_) => (status: 200, body: secondFactorBody),
    );

    final result = await ApiService.instance.login(
      email: 'admin@atara.local',
      password: 'Admin123!',
    );

    expect(result, isA<LoginSecondFactor>());
    expect((result as LoginSecondFactor).challenge, 'challenge.jwt');
    expect(
      await SessionService.getToken(),
      isNull,
      reason: 'the server withheld the session, so nothing may be stored yet',
    );
  });

  test('a session reply is parsed but not persisted by the service', () async {
    // Persistence moved to SessionNotifier._adopt deliberately: it used to be a
    // side effect of a method named "login", which is how an untested parse and
    // an untested write came to share four lines.
    ApiService.instance.httpClientAdapter = _ScriptedAdapter(
      (_) => (status: 200, body: sessionBody),
    );

    final result = await ApiService.instance.login(
      email: 'admin@atara.local',
      password: 'Admin123!',
    );

    expect(result, isA<LoginSession>());
    expect((result as LoginSession).token, 'session.jwt');
    expect(await SessionService.getToken(), isNull);
  });

  test('a wrong code on /auth/totp does not sign the preparator out', () async {
    // web/src/app/api/auth/totp/route.ts:100-108 answers 401 for a merely WRONG
    // code. With only /auth/login exempt from the auto-signout interceptor, every
    // mistyped digit called clearSession() — which also wipes the cached work
    // summary.
    await SessionService.saveSession('stored.jwt', _preparator);
    var signedOut = false;
    ApiService.instance.onUnauthorized = (_) => signedOut = true;
    ApiService.instance.httpClientAdapter = _ScriptedAdapter(
      (_) => (
        status: 401,
        body:
            '{"success": false, "error": "That code is not correct.", '
            '"code": "totp-mismatch"}',
      ),
    );

    ApiException? caught;
    try {
      await ApiService.instance.verifyTotp(challenge: 'c', code: '000000');
    } on ApiException catch (error) {
      caught = error;
    }

    expect(caught?.code, 'totp-mismatch');
    expect(signedOut, isFalse);
    expect(
      await SessionService.getToken(),
      'stored.jwt',
      reason: 'a refused credential is not a stale token',
    );
  });

  test('a 401 on an ordinary request does sign the preparator out', () async {
    // The other side of the same exemption list. Widening it to an '/auth/'
    // prefix would break this case for /auth/me, which is exactly what the
    // interceptor is for.
    await SessionService.saveSession('stored.jwt', _preparator);
    var signedOut = false;
    ApiService.instance.onUnauthorized = (_) => signedOut = true;
    ApiService.instance.httpClientAdapter = _ScriptedAdapter(
      (_) => (
        status: 401,
        body:
            '{"success": false, "error": "This account is no longer active."}',
      ),
    );

    try {
      await ApiService.instance.getSampleByCode('SMPL-2026-00001');
    } catch (_) {
      // The refusal itself is not what this test is about.
    }

    expect(signedOut, isTrue);
    expect(await SessionService.getToken(), isNull);
  });

  test(
    'a body that means nothing reads as malformed, not as offline',
    () async {
      ApiService.instance.httpClientAdapter = _ScriptedAdapter(
        (_) => (status: 200, body: '{"success": true}'),
      );

      ApiException? caught;
      try {
        await ApiService.instance.login(email: 'a@b.c', password: 'x');
      } on ApiException catch (error) {
        caught = error;
      }

      expect(caught?.kind, ApiErrorKind.malformed);
      expect(caught?.isOffline, isFalse);
    },
  );

  test('the enrolment reply is read, including its fresh challenge', () async {
    ApiService.instance.httpClientAdapter = _ScriptedAdapter(
      (_) => (
        status: 200,
        body:
            '{"success": true, "data": {'
            '"otpauthUri": "otpauth://totp/ATARA:a@b.c?secret=ABC", '
            '"manualKey": "ABCD EFGH", "challenge": "fresh.jwt", '
            '"expiresIn": 120}}',
      ),
    );

    final setup = await ApiService.instance.startTotpSetup(
      challenge: 'old.jwt',
    );

    expect(setup.manualKey, 'ABCD EFGH');
    expect(setup.challenge, 'fresh.jwt');
  });

  group('only a preparator is signed in', () {
    // The app scans and moves samples, which is a PREPARATOR's job alone. The
    // server signs every role in, so SessionNotifier._adopt is where the others
    // are turned away — once, for the password and both second factors.
    for (final role in ['ADMIN', 'DATABASE', 'ANALISIS']) {
      test(
        'a $role password sign-in is refused and nothing is stored',
        () async {
          ApiService.instance.httpClientAdapter = _ScriptedAdapter(
            (_) => (status: 200, body: sessionBodyFor(role)),
          );
          final notifier = await restoredNotifier();

          await expectLater(
            notifier.login('someone@atara.local', 'secret'),
            throwsA(isA<PreparatorOnlyException>()),
          );

          expect(
            await SessionService.getToken(),
            isNull,
            reason: 'the token the server issued is dropped, never saved',
          );
          expect(await SessionService.getUser(), isNull);
          expect(notifier.state.value, isNull, reason: 'still signed out');
          notifier.dispose();
        },
      );
    }

    test(
      'a second factor that passes for a non-preparator is refused too',
      () async {
        ApiService.instance.httpClientAdapter = _ScriptedAdapter(
          (_) => (status: 200, body: sessionBodyFor('ADMIN')),
        );
        final notifier = await restoredNotifier();

        await expectLater(
          notifier.verifyTotp(challenge: 'c', code: '123456'),
          throwsA(isA<PreparatorOnlyException>()),
        );
        await expectLater(
          notifier.verifyFace(challenge: 'c', frames: const ['f']),
          throwsA(isA<PreparatorOnlyException>()),
        );

        expect(await SessionService.getToken(), isNull);
        expect(notifier.state.value, isNull);
        notifier.dispose();
      },
    );

    test('a role this build does not know is refused the same way', () async {
      ApiService.instance.httpClientAdapter = _ScriptedAdapter(
        (_) => (status: 200, body: sessionBodyFor('AUDITOR')),
      );
      final notifier = await restoredNotifier();

      await expectLater(
        notifier.login('someone@atara.local', 'secret'),
        throwsA(isA<PreparatorOnlyException>()),
      );
      expect(await SessionService.getToken(), isNull);
      notifier.dispose();
    });

    test('a preparator is signed in and the session is kept', () async {
      ApiService.instance.httpClientAdapter = _ScriptedAdapter(
        (_) => (status: 200, body: sessionBody),
      );
      final notifier = await restoredNotifier();

      final result = await notifier.login('preparator@atara.local', 'secret');

      expect(result, isA<LoginSession>());
      expect(await SessionService.getToken(), 'session.jwt');
      expect(notifier.state.value?.role, UserRole.preparator);
      notifier.dispose();
    });

    test('a stored non-preparator session is cleared on start', () async {
      // Saved by an older build, when administrators could use the app. The
      // token is real and unexpired, which is exactly why it cannot be kept.
      SharedPreferences.setMockInitialValues({
        'atara_token': 'old.jwt',
        'atara_user': jsonEncode({
          'id': 'u9',
          'name': 'Main Admin',
          'email': 'admin@atara.local',
          'role': 'ADMIN',
        }),
      });

      final notifier = await restoredNotifier();

      expect(notifier.state.value, isNull);
      expect(await SessionService.getToken(), isNull);
      notifier.dispose();
    });

    test('a stored role this build does not know means signed out', () async {
      SharedPreferences.setMockInitialValues({
        'atara_token': 'old.jwt',
        'atara_user': jsonEncode({
          'id': 'u9',
          'name': 'Someone',
          'email': 'someone@atara.local',
          'role': 'AUDITOR',
        }),
      });

      final notifier = await restoredNotifier();

      expect(notifier.state.hasError, isFalse, reason: 'not a crash');
      expect(notifier.state.value, isNull);
      expect(await SessionService.getToken(), isNull);
      notifier.dispose();
    });

    test('a stored preparator session is restored', () async {
      await SessionService.saveSession('stored.jwt', _preparator);

      final notifier = await restoredNotifier();

      expect(notifier.state.value?.id, 'u1');
      notifier.dispose();
    });
  });
}
