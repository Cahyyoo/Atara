import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/main.dart';
import 'package:atara/models/user_model.dart';
import 'package:atara/providers/session_provider.dart';
import 'package:atara/screens/login_screen.dart';
import 'package:atara/services/api_service.dart';
import 'package:atara/services/session_service.dart';

/// When the phone asks whether it still holds the account.
///
/// testWidgets runs on a fake clock, so thirty seconds pass in a pump and the
/// timer rules can be asserted exactly: every thirty seconds while in front
/// and signed in, at once on a return to the foreground, never otherwise, and
/// never two at a time.

const _preparator = UserModel(
  id: 'u1',
  name: 'Siti Preparator',
  email: 'preparator@atara.local',
  role: UserRole.preparator,
);

/// A session the test signs in and out by hand.
class _HandSession extends SessionNotifier {
  void signIn() => state = const AsyncValue.data(_preparator);
  void signOut() => state = const AsyncValue.data(null);
}

/// Counts the checks, and answers each with whatever [reply] returns.
class CheckCounter {
  int count = 0;
  Future<void> Function() reply = () async {};

  Future<void> call() {
    count++;
    return reply();
  }
}

Future<void> pumpScope(
  WidgetTester tester, {
  required CheckCounter checks,
  SessionNotifier? session,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        sessionCheckProvider.overrideWithValue(checks.call),
        if (session != null) sessionProvider.overrideWith((ref) => session),
      ],
      child: const SessionHeartbeatScope(child: SizedBox()),
    ),
  );
  // Lets the session's restore from storage land.
  await tester.pump();
  await tester.pump();
}

/// Answers every request with one status and body.
class FixedAnswer implements HttpClientAdapter {
  FixedAnswer(this.status, this.body);

  final int status;
  final String body;
  final List<String> paths = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    paths.add(options.path);
    return ResponseBody.fromString(
      body,
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

/// The app's own gate, minus the splash and onboarding it does not need here.
class _Gate extends ConsumerWidget {
  const _Gate();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    if (session.isLoading) return const SizedBox();
    return session.valueOrNull == null
        ? const LoginScreen()
        : const Text('home', textDirection: TextDirection.ltr);
  }
}

/// Signed in from storage, with the real check going through the real Dio,
/// and the server answering [status] with [body] to every request.
Future<FixedAnswer> pumpSignedInApp(
  WidgetTester tester, {
  required int status,
  required String body,
}) async {
  final transport = FixedAnswer(status, body);
  final original = ApiService.instance.httpClientAdapter;
  ApiService.instance.httpClientAdapter = transport;
  addTearDown(() => ApiService.instance.httpClientAdapter = original);
  // The real device description is a platform channel, and nothing answers one
  // under the fake clock: every request would wait on it.
  ApiService.clientDeviceReader = () async => null;
  addTearDown(() => ApiService.clientDeviceReader = null);
  await SessionService.saveSession('stored.jwt', _preparator);

  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(
        locale: const Locale('en'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: const SessionHeartbeatScope(child: _Gate()),
      ),
    ),
  );
  return transport;
}

/// Lets the restore, the request and the sign-out all land. Dio schedules its
/// steps on zero-length timers, which the fake clock only runs when it moves.
Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 20; i++) {
    await tester.pump(const Duration(milliseconds: 10));
  }
}

void setLifecycle(WidgetTester tester, AppLifecycleState state) {
  tester.binding.handleAppLifecycleStateChanged(state);
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  tearDown(() {
    ApiService.instance.onUnauthorized = null;
    SharedPreferences.resetStatic();
  });

  testWidgets('signed in and in front: every thirty seconds', (tester) async {
    final checks = CheckCounter();
    final session = _HandSession();
    await pumpScope(tester, checks: checks, session: session);
    expect(checks.count, 0, reason: 'nobody signed in yet');

    session.signIn();
    await tester.pump();
    expect(
      checks.count,
      0,
      reason: 'a session just granted here is current by definition',
    );

    await tester.pump(const Duration(seconds: 29));
    expect(checks.count, 0);
    await tester.pump(const Duration(seconds: 1));
    expect(checks.count, 1);
    await tester.pump(const Duration(seconds: 30));
    expect(checks.count, 2);
  });

  testWidgets('backgrounded: stops, and a return asks at once', (tester) async {
    addTearDown(() => setLifecycle(tester, AppLifecycleState.resumed));
    final checks = CheckCounter();
    final session = _HandSession();
    await pumpScope(tester, checks: checks, session: session);
    session.signIn();
    await tester.pump();

    setLifecycle(tester, AppLifecycleState.inactive);
    setLifecycle(tester, AppLifecycleState.hidden);
    setLifecycle(tester, AppLifecycleState.paused);
    await tester.pump(const Duration(minutes: 5));
    expect(checks.count, 0, reason: 'nobody is looking; nothing is asked');

    setLifecycle(tester, AppLifecycleState.hidden);
    setLifecycle(tester, AppLifecycleState.inactive);
    setLifecycle(tester, AppLifecycleState.resumed);
    await tester.pump();
    expect(checks.count, 1, reason: 'the old phone learns on its return');

    await tester.pump(const Duration(seconds: 30));
    expect(checks.count, 2, reason: 'and the clock is running again');
  });

  testWidgets('a notification shade over the app changes nothing', (
    tester,
  ) async {
    addTearDown(() => setLifecycle(tester, AppLifecycleState.resumed));
    final checks = CheckCounter();
    final session = _HandSession();
    await pumpScope(tester, checks: checks, session: session);
    session.signIn();
    await tester.pump();

    setLifecycle(tester, AppLifecycleState.inactive);
    await tester.pump(const Duration(seconds: 30));
    expect(checks.count, 1);
  });

  testWidgets('signed out: stops', (tester) async {
    final checks = CheckCounter();
    final session = _HandSession();
    await pumpScope(tester, checks: checks, session: session);
    session.signIn();
    await tester.pump(const Duration(seconds: 30));
    expect(checks.count, 1);

    session.signOut();
    await tester.pump(const Duration(minutes: 5));
    expect(checks.count, 1);

    setLifecycle(tester, AppLifecycleState.paused);
    setLifecycle(tester, AppLifecycleState.resumed);
    await tester.pump();
    expect(
      checks.count,
      1,
      reason: 'a return with nobody signed in asks nothing',
    );
  });

  testWidgets('a session restored at launch is asked about at once', (
    tester,
  ) async {
    // It may have been replaced while the app was closed.
    await SessionService.saveSession('stored.jwt', _preparator);
    final checks = CheckCounter();

    await pumpScope(tester, checks: checks);

    expect(checks.count, 1);
  });

  testWidgets('one question at a time', (tester) async {
    final checks = CheckCounter();
    final pending = Completer<void>();
    checks.reply = () => pending.future;
    final session = _HandSession();
    await pumpScope(tester, checks: checks, session: session);
    session.signIn();

    await tester.pump(const Duration(seconds: 90));
    expect(checks.count, 1, reason: 'the first never came back');

    pending.complete();
    await tester.pump(const Duration(seconds: 30));
    expect(checks.count, 2);
  });

  testWidgets('a failed check is not an error, and the clock goes on', (
    tester,
  ) async {
    final checks = CheckCounter();
    checks.reply = () async => throw Exception('offline');
    final session = _HandSession();
    await pumpScope(tester, checks: checks, session: session);
    session.signIn();

    await tester.pump(const Duration(seconds: 60));

    expect(checks.count, 2);
    expect(tester.takeException(), isNull);
  });

  group('the whole way, from the check to the sign-in screen', () {
    testWidgets('replaced: signed out, and told why', (tester) async {
      final transport = await pumpSignedInApp(
        tester,
        status: 401,
        body:
            '{"success": false, "error": "x", "code": "session-replaced", '
            '"details": {"at": "2026-09-30T06:30:00Z", '
            '"device": "Aplikasi · Android"}}',
      );
      await settle(tester);

      expect(transport.paths, contains('/auth/session'));
      expect(find.byType(LoginScreen), findsOneWidget);
      expect(await tester.runAsync(SessionService.getToken), isNull);
      expect(
        find.textContaining(
          'Your account was opened on another phone (Aplikasi · Android) at ',
        ),
        findsOneWidget,
      );
    });

    testWidgets('any other 401: signed out, with no such story', (
      tester,
    ) async {
      await pumpSignedInApp(
        tester,
        status: 401,
        body: '{"success": false, "error": "Session expired."}',
      );
      await settle(tester);

      expect(find.byType(LoginScreen), findsOneWidget);
      expect(find.textContaining('another phone'), findsNothing);
    });

    testWidgets('still current: nothing happens', (tester) async {
      await pumpSignedInApp(
        tester,
        status: 200,
        body: '{"success": true, "data": {"ok": true}}',
      );
      await settle(tester);

      expect(find.text('home'), findsOneWidget);
      expect(find.byType(LoginScreen), findsNothing);
    });
  });
}
