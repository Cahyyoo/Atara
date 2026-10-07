import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'package:atara/models/login_result.dart';
import 'package:atara/models/user_model.dart';
import 'package:atara/services/api_exception.dart';

/// The layer that had no test, which is why the bug reached an operator.
///
/// `ApiService.login` used to read the reply with four hard casts in a row. When
/// an account has a second factor the server withholds the token, so
/// `data['token'] as String` ran against null and threw a `TypeError` — and a
/// `TypeError` is not a `DioException`, so the catch directly beneath it never
/// saw it. It escaped every handler on the way up and surfaced as "an unexpected
/// error occurred", with no hint that a second step existed at all.
///
/// Every body below is copied from the route that emits it, with a comment
/// naming the file, so drift between server and client is findable rather than
/// guessed at.
Object? decode(String json) => jsonDecode(json);

void main() {
  group('LoginResult.parse', () {
    test('reads the second-factor answer without throwing', () async {
      // web/src/app/api/auth/login/route.ts:106-114 — HTTP 200, success: true,
      // and deliberately no token. This is the exact shape that used to crash.
      final result = LoginResult.parse(
        decode('''
        {"success": true,
         "data": {"mfaRequired": true,
                  "methods": ["totp"],
                  "challenge": "challenge.jwt.value",
                  "expiresIn": 120,
                  "user": {"name": "Main Admin"}}}
      '''),
      );

      expect(result, isA<LoginSecondFactor>());
      final mfa = result as LoginSecondFactor;
      expect(mfa.challenge, 'challenge.jwt.value');
      expect(mfa.name, 'Main Admin');
      expect(mfa.methods, [SecondFactorMethod.totp]);
      expect(mfa.expiresIn, const Duration(seconds: 120));
      expect(mfa.hasUnsupportedMethods, isFalse);
    });

    test('reads a session from the login route', () {
      // The other half of web/src/lib/session-response.ts:23-27, as the login
      // route sends it — note it DOES carry mfaRequired: false.
      final result = LoginResult.parse(
        decode('''
        {"success": true,
         "data": {"mfaRequired": false,
                  "token": "session.jwt.value",
                  "user": {"id": "u1", "name": "Main Admin",
                           "email": "operator@atara.local", "role": "OPERATOR"}}}
      '''),
      );

      expect(result, isA<LoginSession>());
      final session = result as LoginSession;
      expect(session.token, 'session.jwt.value');
      expect(session.user.role, UserRole.operator);
      expect(session.user.email, 'operator@atara.local');
    });

    test('reads a session that carries no mfaRequired key at all', () {
      // web/src/app/api/auth/totp/route.ts:145 and .../face/route.ts:170 both
      // finish through issueSessionResponse(user) with no extras, so this key is
      // simply absent. A parser keyed on `mfaRequired == false` rejects both
      // routes outright; one keyed on `!= true` works by accident until someone
      // adds a fourth flag. Hence: branch on the token.
      final result = LoginResult.parse(
        decode('''
        {"success": true,
         "data": {"token": "session.jwt.value",
                  "user": {"id": "u1", "name": "Main Admin",
                           "email": "operator@atara.local", "role": "OPERATOR"}}}
      '''),
      );

      expect(result, isA<LoginSession>());
    });

    test('drops a method it cannot carry out, and says that it did', () {
      // An account can be offered several. `webauthn` stands in for anything the
      // server learns to do before this app does.
      final result =
          LoginResult.parse(
                decode('''
        {"success": true,
         "data": {"mfaRequired": true,
                  "methods": ["face", "totp", "webauthn"],
                  "challenge": "c",
                  "expiresIn": 120,
                  "user": {"name": "Main Admin"}}}
      '''),
              )
              as LoginSecondFactor;

      expect(result.methods, [
        SecondFactorMethod.face,
        SecondFactorMethod.totp,
      ]);
      expect(
        result.hasUnsupportedMethods,
        isTrue,
        reason: 'the screen needs to know it is not showing the whole offer',
      );
    });

    test('an account offered only unknown methods is representable', () {
      // No supported method survives the filter, so the screen can say so
      // plainly instead of drawing a blank page.
      final result =
          LoginResult.parse(
                decode('''
        {"success": true,
         "data": {"mfaRequired": true, "methods": ["webauthn"],
                  "challenge": "c", "expiresIn": 120,
                  "user": {"name": "Main Admin"}}}
      '''),
              )
              as LoginSecondFactor;

      expect(result.methods, isEmpty);
      expect(result.hasUnsupportedMethods, isTrue);
    });

    test('a body that means nothing is a typed refusal, not a TypeError', () {
      // And critically it carries the real status code. ApiException treats a
      // NULL status as "the server was never reached", and the update screen
      // queues a scan offline on that basis — a malformed answer from a server
      // that plainly did reply must never look like no server at all.
      ApiException? caught;
      try {
        LoginResult.parse(decode('{"success": true, "data": {}}'));
      } on ApiException catch (error) {
        caught = error;
      }

      expect(caught, isNotNull);
      expect(caught!.kind, ApiErrorKind.malformed);
      expect(caught.statusCode, 200);
      expect(
        caught.isOffline,
        isFalse,
        reason: 'a malformed reply is not an absent server',
      );
    });

    test('a session whose user object is a stub is refused', () {
      // Belt and braces on the ordering inside parse: a token present but a user
      // that cannot be built must not yield a half-made session.
      expect(
        () => LoginResult.parse(
          decode('''
          {"data": {"token": "t", "user": {"name": "Main Admin"}}}
        '''),
        ),
        throwsA(isA<ApiException>()),
      );
    });

    test('a session for any known role parses; refusing it is not its job', () {
      // The parser reports what the server said. Turning a non-operator away is
      // SessionNotifier._adopt's call, made once for every sign-in path.
      for (final role in ['ADMIN', 'DATABASE', 'ANALISIS', 'OPERATOR']) {
        final result = LoginResult.parse({
          'data': {
            'token': 't',
            'user': {'id': 'u1', 'name': 'N', 'email': 'e@x', 'role': role},
          },
        });
        expect((result as LoginSession).user.role.wire, role);
      }
    });

    test('a session for a role this build does not know is operator-only', () {
      // Not "unreadable": that sentence points at the server address, and the
      // server is fine. Whatever the role is, it is not OPERATOR.
      expect(
        () => LoginResult.parse({
          'data': {
            'token': 't',
            'user': {
              'id': 'u1',
              'name': 'N',
              'email': 'e@x',
              'role': 'AUDITOR',
            },
          },
        }),
        throwsA(isA<OperatorOnlyException>()),
      );
    });

    test('a non-map body is refused rather than crashing', () {
      expect(
        () => LoginResult.parse('not json at all'),
        throwsA(isA<ApiException>()),
      );
      expect(() => LoginResult.parse(null), throwsA(isA<ApiException>()));
    });
  });

  group('TotpSetup.parse', () {
    test('reads the enrolment reply, including its replacement challenge', () {
      // web/src/app/api/auth/totp/setup/route.ts:91-96. The fresh challenge is
      // the point: the one spent getting here had less than two minutes left,
      // and typing a key across takes longer than that.
      final setup = TotpSetup.parse(
        decode('''
        {"success": true,
         "data": {"otpauthUri": "otpauth://totp/ATARA:admin@atara.local?secret=ABC",
                  "manualKey": "ABCD EFGH IJKL MNOP",
                  "challenge": "fresh.challenge.jwt",
                  "expiresIn": 120}}
      '''),
      );

      expect(setup.manualKey, 'ABCD EFGH IJKL MNOP');
      expect(setup.challenge, 'fresh.challenge.jwt');
      expect(setup.expiresIn, const Duration(seconds: 120));
    });

    test('a reply missing the key is refused', () {
      expect(
        () => TotpSetup.parse(decode('{"data": {"challenge": "c"}}')),
        throwsA(isA<ApiException>()),
      );
    });
  });
}
