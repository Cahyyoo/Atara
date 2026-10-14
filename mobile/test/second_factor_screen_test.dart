import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/models/login_result.dart';
import 'package:atara/models/user_model.dart';
import 'package:atara/providers/session_provider.dart';
import 'package:atara/screens/second_factor_screen.dart';
import 'package:atara/services/api_exception.dart';
import 'package:atara/theme/app_theme.dart';
import 'package:atara/widgets/face_camera_view.dart';

/// The step between a correct password and a session.
///
/// Driven through a scripted `SessionNotifier`, which is this suite's
/// established seam for a screen whose only collaborator is a singleton service.
/// The scripted notifier records what it was asked, because the interesting
/// assertions here are about the ARGUMENTS — above all whether a retry after a
/// wrong code reuses the same challenge, which is what the server was designed
/// around and what a client gets wrong by treating every 401 alike.
class ScriptedSession extends SessionNotifier {
  ScriptedSession({this.answers = const []});

  /// One answer per call, in order. A `null` entry means "succeed".
  final List<ApiException?> answers;

  final List<({String challenge, String code})> verified = [];
  final List<String> setupsStarted = [];
  int _call = 0;

  static const _user = UserModel(
    id: 'u1',
    name: 'Main Admin',
    email: 'admin@atara.local',
    role: UserRole.preparator,
  );

  @override
  Future<LoginResult> verifyTotp({
    required String challenge,
    required String code,
  }) async {
    verified.add((challenge: challenge, code: code));
    final answer = _call < answers.length ? answers[_call] : null;
    _call++;
    if (answer != null) throw answer;
    return const LoginSession(token: 'session.jwt', user: _user);
  }

  final List<({String challenge, List<String> frames})> faceVerified = [];

  @override
  Future<TotpSetup> startTotpSetup({required String challenge}) async {
    setupsStarted.add(challenge);
    final answer = _call < answers.length ? answers[_call] : null;
    _call++;
    if (answer != null) throw answer;
    return const TotpSetup(
      manualKey: 'ABCD EFGH IJKL MNOP',
      otpauthUri: 'otpauth://totp/ATARA:admin@atara.local?secret=ABCDEFGH',
      challenge: 'fresh.challenge',
      expiresIn: Duration(seconds: 120),
    );
  }

  @override
  Future<LoginResult> verifyFace({
    required String challenge,
    required List<String> frames,
    int? videoWidth,
    int? videoHeight,
  }) async {
    faceVerified.add((challenge: challenge, frames: frames));
    final answer = _call < answers.length ? answers[_call] : null;
    _call++;
    if (answer != null) throw answer;
    return const LoginSession(token: 'session.jwt', user: _user);
  }
}

/// A clock the test moves by hand.
///
/// Load-bearing for the expiry case: `DateTime.now()` does not advance under
/// `flutter_test`'s fake clock while `Timer`s do, so a countdown read from the
/// real clock would tick for ever and the one branch worth testing would be
/// unreachable. This is why the screen takes its clock as a parameter.
class FakeClock {
  DateTime value = DateTime.utc(2026, 9, 28, 8);
  DateTime call() => value;
}

LoginSecondFactor factorOf({
  List<SecondFactorMethod> methods = const [SecondFactorMethod.totp],
  bool hasUnsupportedMethods = false,
  String challenge = 'first.challenge',
}) {
  return LoginSecondFactor(
    challenge: challenge,
    name: 'Main Admin',
    methods: methods,
    expiresIn: const Duration(seconds: 120),
    hasUnsupportedMethods: hasUnsupportedMethods,
  );
}

Future<void> pumpSecondFactor(
  WidgetTester tester,
  ScriptedSession session, {
  LoginSecondFactor? factor,
  FakeClock? clock,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [sessionProvider.overrideWith((ref) => session)],
      child: MaterialApp(
        locale: const Locale('id'),
        theme: AppTheme.light,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        // Pushed rather than used as `home`, because that is how it is reached in
        // production and because the screen pops ITSELF once a session lands —
        // routes on the root navigator are not removed by AuthGate swapping
        // `home:`, so a screen that could not pop would sit on top of Home for
        // ever. A `home:`-only harness cannot exercise that at all.
        home: const SizedBox.shrink(),
      ),
    ),
  );

  final navigator = tester.state<NavigatorState>(find.byType(Navigator));
  navigator.push(
    CupertinoPageRoute(
      builder: (context) => SecondFactorScreen(
        factor: factor ?? factorOf(),
        now: (clock ?? FakeClock()).call,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// Drains the confirmation hold and the route dismissal that follow a success.
///
/// The hold is a plain `Future.delayed` and nothing cancels it, so a test that
/// ends while it is outstanding trips the binding's pending-timer check — which
/// says nothing about the behaviour under test.
Future<void> settleSuccess(WidgetTester tester) async {
  await tester.pump(const Duration(milliseconds: 500));
  await tester.pumpAndSettle();
}

Finder get codeField => find.byType(CupertinoTextField);

void main() {
  testWidgets('a single method opens straight into it', (tester) async {
    // A choice of one is not a choice.
    await pumpSecondFactor(tester, ScriptedSession());

    expect(codeField, findsOneWidget);
    expect(find.text('Kode Authenticator'.toUpperCase()), findsWidgets);
  });

  testWidgets('two methods are offered before either is attempted', (
    tester,
  ) async {
    // Shown before any code or camera, because somebody whose face will not read
    // today should not be made to fail at it first.
    await pumpSecondFactor(
      tester,
      ScriptedSession(),
      factor: factorOf(
        methods: [SecondFactorMethod.face, SecondFactorMethod.totp],
      ),
    );

    expect(codeField, findsNothing);
    expect(find.text('Verifikasi wajah'), findsOneWidget);
    expect(find.text('Kode Authenticator'), findsOneWidget);
  });

  testWidgets('a correct code carries the challenge it was given', (
    tester,
  ) async {
    final session = ScriptedSession();
    await pumpSecondFactor(tester, session);

    await tester.enterText(codeField, '123456');
    await tester.pump();

    expect(session.verified, hasLength(1));
    expect(session.verified.single.challenge, 'first.challenge');
    expect(session.verified.single.code, '123456');

    await settleSuccess(tester);
  });

  testWidgets('a wrong code is retryable with the SAME challenge', (
    tester,
  ) async {
    // The assertion this file exists for. A wrong code deliberately does not
    // spend the challenge server-side, so the preparator must not be sent back to
    // the password field — and the retry must reuse the challenge rather than a
    // replacement.
    final session = ScriptedSession(
      answers: [
        const ApiException(
          'That code is not correct.',
          statusCode: 401,
          kind: ApiErrorKind.server,
          code: 'totp-mismatch',
        ),
      ],
    );
    await pumpSecondFactor(tester, session);

    await tester.enterText(codeField, '000000');
    await tester.pump();

    expect(
      find.byType(SecondFactorScreen),
      findsOneWidget,
      reason: 'a mismatch must not abandon the sitting',
    );
    expect(
      find.text(
        'Kode salah atau sudah dipakai. Tunggu kode berikutnya lalu coba lagi.',
      ),
      findsOneWidget,
    );
    expect(
      tester.widget<CupertinoTextField>(codeField).controller!.text,
      '',
      reason: 'the field is cleared so the next code can be typed',
    );

    await tester.enterText(codeField, '654321');
    await tester.pump();

    expect(session.verified, hasLength(2));
    expect(
      session.verified[1].challenge,
      session.verified[0].challenge,
      reason: 'the challenge was not spent, so the retry reuses it',
    );

    await settleSuccess(tester);
  });

  testWidgets('an expired challenge explains itself and asks for nothing', (
    tester,
  ) async {
    final session = ScriptedSession();
    final clock = FakeClock();
    await pumpSecondFactor(tester, session, clock: clock);

    // Both clocks have to move. The periodic Timer advances under the binding's
    // fake async; what it READS is the injected clock, which nothing else moves.
    clock.value = clock.value.add(const Duration(seconds: 121));
    await tester.pump(const Duration(seconds: 121));

    expect(find.text('Sesi masuk sudah kedaluwarsa'), findsOneWidget);
    expect(codeField, findsNothing);
    expect(
      session.verified,
      isEmpty,
      reason: 'nothing may be sent against a challenge that is finished',
    );
  });

  testWidgets('a server 401 with no code lands on the same expiry panel', (
    tester,
  ) async {
    // The server refuses to say whether it expired, was spent, or never existed.
    // What is certain either way is that the challenge is finished.
    final session = ScriptedSession(
      answers: [
        const ApiException(
          'That sign-in attempt has expired. Please start again.',
          statusCode: 401,
          kind: ApiErrorKind.server,
        ),
      ],
    );
    await pumpSecondFactor(tester, session);

    await tester.enterText(codeField, '123456');
    await tester.pump();

    expect(find.text('Sesi masuk sudah kedaluwarsa'), findsOneWidget);
    expect(codeField, findsNothing);
  });

  testWidgets('an account whose only method is unsupported is told so', (
    tester,
  ) async {
    // A face-only account, today. It must read as a truthful limit rather than a
    // blank screen or a pretended failure.
    await pumpSecondFactor(
      tester,
      ScriptedSession(),
      factor: factorOf(methods: const [], hasUnsupportedMethods: true),
    );

    expect(codeField, findsNothing);
    expect(
      find.text(
        'Akun ini memakai metode verifikasi yang belum didukung aplikasi. Selesaikan lewat situs web.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('enrolment starts once and adopts the replacement challenge', (
    tester,
  ) async {
    // Every call to /auth/totp/setup mints a fresh secret, so a second one would
    // silently invalidate a key already typed into an authenticator.
    final session = ScriptedSession();
    await pumpSecondFactor(
      tester,
      session,
      factor: factorOf(methods: [SecondFactorMethod.totpSetup]),
    );
    await tester.pump();

    expect(session.setupsStarted, ['first.challenge']);
    expect(find.text('ABCD EFGH IJKL MNOP'), findsOneWidget);

    await tester.tap(find.text('Verifikasi'));
    await tester.pump();
    await tester.enterText(codeField, '123456');
    await tester.pump();

    expect(
      session.verified.single.challenge,
      'fresh.challenge',
      reason: 'the setup reply replaced the challenge, and it must be used',
    );
    expect(session.setupsStarted, hasLength(1));

    await settleSuccess(tester);
  });

  testWidgets('too many attempts stops the sitting', (tester) async {
    final session = ScriptedSession(
      answers: [
        const ApiException(
          'Too many failed attempts. Try again in 15 minute(s).',
          statusCode: 429,
          kind: ApiErrorKind.server,
        ),
      ],
    );
    await pumpSecondFactor(tester, session);

    await tester.enterText(codeField, '123456');
    await tester.pump();

    expect(
      find.text(
        'Terlalu banyak percobaan. Tunggu beberapa menit, lalu masuk lagi.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('face-only method opens straight into face verification', (
    tester,
  ) async {
    final session = ScriptedSession();
    await pumpSecondFactor(
      tester,
      session,
      factor: factorOf(methods: [SecondFactorMethod.face]),
    );

    expect(codeField, findsNothing);
    expect(find.byType(FaceCameraView), findsOneWidget);
    expect(find.text('Hadap kamera dan berkedip sekali.'), findsWidgets);
  });

  testWidgets('tapping face verification in chooser opens face verification', (
    tester,
  ) async {
    final session = ScriptedSession();
    await pumpSecondFactor(
      tester,
      session,
      factor: factorOf(
        methods: [SecondFactorMethod.face, SecondFactorMethod.totp],
      ),
    );

    expect(find.text('Verifikasi wajah'), findsOneWidget);
    await tester.tap(find.text('Verifikasi wajah'));
    await tester.pumpAndSettle();

    expect(find.byType(FaceCameraView), findsOneWidget);
    expect(find.text('Hadap kamera dan berkedip sekali.'), findsWidgets);
  });

  testWidgets('successful face verification submits frames and signs in', (
    tester,
  ) async {
    final session = ScriptedSession();
    await pumpSecondFactor(
      tester,
      session,
      factor: factorOf(methods: [SecondFactorMethod.face]),
    );

    final FaceCameraView cameraView = tester.widget(
      find.byType(FaceCameraView),
    );
    unawaited(cameraView.onCapture(['frame1', 'frame2']));
    await tester.pump();

    expect(session.faceVerified, hasLength(1));
    expect(session.faceVerified.single.challenge, 'first.challenge');
    expect(session.faceVerified.single.frames, ['frame1', 'frame2']);
    expect(find.text('Wajah cocok. Masuk…'), findsOneWidget);

    await settleSuccess(tester);
    expect(find.byType(SecondFactorScreen), findsNothing);
  });

  testWidgets('poor quality refusal shows guidance and allows retry', (
    tester,
  ) async {
    final session = ScriptedSession(
      answers: [
        const ApiException(
          'Frame quality issue.',
          statusCode: 400,
          kind: ApiErrorKind.server,
          code: 'poor-quality',
          // The server's own key, as QUALITY_REASONS spells it.
          details: {'reason': 'qualityTooFar'},
        ),
      ],
    );
    await pumpSecondFactor(
      tester,
      session,
      factor: factorOf(methods: [SecondFactorMethod.face]),
    );

    final FaceCameraView cameraView = tester.widget(
      find.byType(FaceCameraView),
    );
    await cameraView.onCapture(['frame1']);
    await tester.pump();

    expect(find.text('Wajah terlalu jauh. Mendekat ke kamera.'), findsWidgets);
    expect(find.byType(SecondFactorScreen), findsOneWidget);
  });

  testWidgets('face mismatch shows mismatch message', (tester) async {
    final session = ScriptedSession(
      answers: [
        const ApiException(
          'That face did not match this account.',
          statusCode: 401,
          kind: ApiErrorKind.server,
          code: 'face-mismatch',
        ),
      ],
    );
    await pumpSecondFactor(
      tester,
      session,
      factor: factorOf(methods: [SecondFactorMethod.face]),
    );

    final FaceCameraView cameraView = tester.widget(
      find.byType(FaceCameraView),
    );
    await cameraView.onCapture(['frame1']);
    await tester.pump();

    expect(find.text('Wajah tidak cocok dengan akun ini.'), findsOneWidget);
  });
}
