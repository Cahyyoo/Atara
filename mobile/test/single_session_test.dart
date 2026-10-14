import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:atara/models/login_result.dart';
import 'package:atara/models/user_model.dart';
import 'package:atara/providers/session_provider.dart';
import 'package:atara/services/api_service.dart';
import 'package:atara/services/client_device.dart';
import 'package:atara/services/session_service.dart';

/// One phone per account, from this side of the socket.
///
/// The server decides who holds the account, and the latest sign-in wins. The
/// app has to say which slot it is asking for and what it is (the headers), and
/// notice when its own slot has been taken (401 `session-replaced`). Both live
/// in the interceptor, the service and the notifier, which is what these reach
/// — over a scripted transport, as in api_service_login_test.
class _Recorder implements HttpClientAdapter {
  _Recorder(this.answer);

  /// Given a request, the status and body to answer with — or null to never
  /// answer at all, which is what a request into a dead network looks like.
  final ({int status, String body})? Function(RequestOptions options) answer;

  final List<RequestOptions> requests = [];

  RequestOptions lastTo(String path) =>
      requests.lastWhere((r) => r.path == path);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final reply = answer(options);
    if (reply == null) return Completer<ResponseBody>().future;
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

const _sessionBody = '''
{"success": true,
 "data": {"mfaRequired": false, "token": "new.jwt",
          "user": {"id": "u1", "name": "Siti Preparator",
                   "email": "preparator@atara.local", "role": "PREPARATOR"}}}
''';

const _replacedBody = '''
{"success": false,
 "error": "This account was opened on another phone.",
 "code": "session-replaced",
 "details": {"at": "2026-09-30T06:30:00Z", "device": "Aplikasi · iOS"}}
''';

const _replacedDescribedBody = '''
{"success": false,
 "error": "This account was opened on another device.",
 "code": "session-replaced",
 "details": {"at": "2026-09-30T06:30:00Z", "device": "Microsoft Edge · Windows",
             "deviceInfo": {"kind": "desktop", "os": "Windows",
                            "osVersion": "10/11", "browser": "Microsoft Edge",
                            "browserVersion": "129", "model": null,
                            "app": false}}}
''';

const _plain401 = '{"success": false, "error": "Session expired."}';

const _okBody = '{"success": true, "data": {"ok": true}}';

const _preparator = UserModel(
  id: 'u1',
  name: 'Siti Preparator',
  email: 'preparator@atara.local',
  role: UserRole.preparator,
);

/// A container whose session has finished restoring from storage.
Future<ProviderContainer> restoredContainer() async {
  final container = ProviderContainer();
  container.read(sessionProvider);
  while (container.read(sessionProvider).isLoading) {
    await Future<void>.delayed(Duration.zero);
  }
  return container;
}

void main() {
  late HttpClientAdapter original;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    original = ApiService.instance.httpClientAdapter;
  });

  tearDown(() {
    ApiService.instance.httpClientAdapter = original;
    ApiService.instance.onUnauthorized = null;
    ApiService.clientDeviceReader = null;
    debugDefaultTargetPlatformOverride = null;
    SharedPreferences.resetStatic();
  });

  group('every request says it is the phone app', () {
    test('client and device headers go out on every request', () async {
      final transport = _Recorder((_) => (status: 200, body: _okBody));
      ApiService.instance.httpClientAdapter = transport;

      await ApiService.instance.checkSession();
      await ApiService.instance
          .login(email: 'a@b.c', password: 'x')
          .then((_) {}, onError: (_) {});

      expect(transport.requests, hasLength(2));
      for (final request in transport.requests) {
        expect(request.headers['X-Atara-Client'], 'mobile');
        // The test binding reports Android unless told otherwise.
        expect(request.headers['X-Atara-Device'], 'android');
      }
    });

    test('an iPhone says ios, and a desktop says nothing', () async {
      final transport = _Recorder((_) => (status: 200, body: _okBody));
      ApiService.instance.httpClientAdapter = transport;

      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      await ApiService.instance.checkSession();
      debugDefaultTargetPlatformOverride = TargetPlatform.windows;
      await ApiService.instance.checkSession();

      expect(transport.requests[0].headers['X-Atara-Device'], 'ios');
      expect(
        transport.requests[1].headers.containsKey('X-Atara-Device'),
        isFalse,
      );
      expect(transport.requests[1].headers['X-Atara-Client'], 'mobile');
    });
  });

  group('the phone describes itself', () {
    test('an Android phone sends its model and version', () async {
      final transport = _Recorder((_) => (status: 200, body: _okBody));
      ApiService.instance.httpClientAdapter = transport;
      ApiService.clientDeviceReader = () async => ClientDevice.android(
        manufacturer: 'samsung',
        model: 'SM-A515F',
        release: '14',
      );

      await ApiService.instance.checkSession();
      await ApiService.instance.checkSession();

      for (final request in transport.requests) {
        expect(request.headers['X-Atara-Device'], 'android');
        expect(request.headers['X-Atara-Device-Model'], 'Samsung SM-A515F');
        expect(request.headers['X-Atara-OS-Version'], '14');
      }
    });

    test('an iPhone sends its model name and iOS version', () async {
      final transport = _Recorder((_) => (status: 200, body: _okBody));
      ApiService.instance.httpClientAdapter = transport;
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      ApiService.clientDeviceReader = () async => ClientDevice.ios(
        modelName: 'iPhone 14 Pro',
        machine: 'iPhone15,2',
        systemVersion: '17.5',
      );

      await ApiService.instance.checkSession();

      final headers = transport.requests.single.headers;
      expect(headers['X-Atara-Device'], 'ios');
      expect(headers['X-Atara-Device-Model'], 'iPhone 14 Pro');
      expect(headers['X-Atara-OS-Version'], '17.5');
    });

    test('the platform is asked once, not per request', () async {
      final transport = _Recorder((_) => (status: 200, body: _okBody));
      ApiService.instance.httpClientAdapter = transport;
      var asked = 0;
      ApiService.clientDeviceReader = () async {
        asked++;
        return const ClientDevice(model: 'Pixel 8', osVersion: '15');
      };

      await ApiService.instance.checkSession();
      await ApiService.instance.checkSession();
      await ApiService.instance.checkSession();

      expect(asked, 1);
      expect(
        transport.requests.last.headers['X-Atara-Device-Model'],
        'Pixel 8',
      );
    });

    for (final (label, reader) in <(String, Future<ClientDevice?> Function())>[
      ('nothing to say', () async => null),
      ('a platform that throws', () async => throw StateError('no channel')),
    ]) {
      test('$label omits both headers and still sends', () async {
        final transport = _Recorder((_) => (status: 200, body: _okBody));
        ApiService.instance.httpClientAdapter = transport;
        ApiService.clientDeviceReader = reader;

        await ApiService.instance.checkSession();

        final headers = transport.requests.single.headers;
        expect(headers.containsKey('X-Atara-Device-Model'), isFalse);
        expect(headers.containsKey('X-Atara-OS-Version'), isFalse);
        expect(headers['X-Atara-Client'], 'mobile');
      });
    }
  });

  group('signing in where the account is already open', () {
    test('the login body is the credentials and nothing else', () async {
      final transport = _Recorder((_) => (status: 200, body: _sessionBody));
      ApiService.instance.httpClientAdapter = transport;

      await ApiService.instance.login(email: 'a@b.c', password: 'x');

      final body = transport.lastTo('/auth/login').data as Map;
      expect(body, {'email': 'a@b.c', 'password': 'x'});
    });

    test('the sign-in simply wins', () async {
      ApiService.instance.httpClientAdapter = _Recorder(
        (_) => (status: 200, body: _sessionBody),
      );
      final container = await restoredContainer();
      addTearDown(container.dispose);

      final result = await container
          .read(sessionProvider.notifier)
          .login('preparator@atara.local', 'secret');

      expect(result, isA<LoginSession>());
      expect(await SessionService.getToken(), 'new.jwt');
      expect(container.read(sessionProvider).value?.id, 'u1');
    });
  });

  group('being signed out by another device', () {
    test('a 401 session-replaced signs out and says why', () async {
      await SessionService.saveSession('old.jwt', _preparator);
      ApiService.instance.httpClientAdapter = _Recorder(
        (_) => (status: 401, body: _replacedBody),
      );
      final container = await restoredContainer();
      addTearDown(container.dispose);
      expect(container.read(sessionProvider).value, isNotNull);

      await expectLater(ApiService.instance.checkSession(), throwsA(anything));

      expect(container.read(sessionProvider).value, isNull);
      expect(await SessionService.getToken(), isNull);
      final notice = container.read(signedOutNoticeProvider);
      expect(notice, isA<SessionReplaced>());
      final replaced = notice! as SessionReplaced;
      expect(replaced.device, 'Aplikasi · iOS');
      expect(replaced.at, DateTime.utc(2026, 9, 30, 6, 30));
      expect(replaced.deviceInfo, isNull);
    });

    test('the other device arrives described, field by field', () async {
      await SessionService.saveSession('old.jwt', _preparator);
      ApiService.instance.httpClientAdapter = _Recorder(
        (_) => (status: 401, body: _replacedDescribedBody),
      );
      final container = await restoredContainer();
      addTearDown(container.dispose);

      await expectLater(ApiService.instance.checkSession(), throwsA(anything));

      final notice = container.read(signedOutNoticeProvider);
      final info = (notice as SessionReplaced?)?.deviceInfo;
      expect(info, isNotNull);
      expect(info!.kind, DeviceKind.desktop);
      expect(info.os, 'Windows');
      expect(info.osVersion, '10/11');
      expect(info.browser, 'Microsoft Edge');
      expect(info.browserVersion, '129');
      expect(info.model, isNull);
      expect(info.app, isFalse);
    });

    test('a plain 401 signs out without a story', () async {
      await SessionService.saveSession('old.jwt', _preparator);
      ApiService.instance.httpClientAdapter = _Recorder(
        (_) => (status: 401, body: _plain401),
      );
      final container = await restoredContainer();
      addTearDown(container.dispose);

      await expectLater(ApiService.instance.checkSession(), throwsA(anything));

      expect(container.read(sessionProvider).value, isNull);
      expect(container.read(signedOutNoticeProvider), isNull);
    });

    test('a current session is left alone', () async {
      await SessionService.saveSession('old.jwt', _preparator);
      final transport = _Recorder((_) => (status: 200, body: _okBody));
      ApiService.instance.httpClientAdapter = transport;
      final container = await restoredContainer();
      addTearDown(container.dispose);

      await ApiService.instance.checkSession();

      expect(transport.lastTo('/auth/session').method, 'GET');
      expect(
        transport.lastTo('/auth/session').headers['Authorization'],
        'Bearer old.jwt',
      );
      expect(container.read(sessionProvider).value, isNotNull);
    });

    test('no network is not a sign-out', () async {
      await SessionService.saveSession('old.jwt', _preparator);
      ApiService.instance.httpClientAdapter = _Recorder(
        (options) => throw DioException.connectionError(
          requestOptions: options,
          reason: 'offline',
        ),
      );
      final container = await restoredContainer();
      addTearDown(container.dispose);

      await expectLater(ApiService.instance.checkSession(), throwsA(anything));

      expect(container.read(sessionProvider).value, isNotNull);
      expect(await SessionService.getToken(), 'old.jwt');
    });
  });

  group('signing out frees the slot', () {
    test('logout tells the server, with the token, then clears', () async {
      await SessionService.saveSession('old.jwt', _preparator);
      final transport = _Recorder((_) => (status: 200, body: _okBody));
      ApiService.instance.httpClientAdapter = transport;
      final container = await restoredContainer();
      addTearDown(container.dispose);

      await container.read(sessionProvider.notifier).logout();

      final call = transport.lastTo('/auth/logout');
      expect(call.method, 'POST');
      expect(call.headers['Authorization'], 'Bearer old.jwt');
      expect(call.headers['X-Atara-Client'], 'mobile');
      expect(container.read(sessionProvider).value, isNull);
      expect(await SessionService.getToken(), isNull);
    });

    for (final (label, answer) in [
      ('refuses', (status: 500, body: '{"success": false, "error": "x"}')),
      ('already let go', (status: 401, body: _replacedBody)),
    ]) {
      test('a server that $label still leaves the phone signed out', () async {
        await SessionService.saveSession('old.jwt', _preparator);
        ApiService.instance.httpClientAdapter = _Recorder((_) => answer);
        final container = await restoredContainer();
        addTearDown(container.dispose);

        await container.read(sessionProvider.notifier).logout();

        expect(container.read(sessionProvider).value, isNull);
        expect(await SessionService.getToken(), isNull);
        // A deliberate sign-out is not "another phone took over".
        expect(container.read(signedOutNoticeProvider), isNull);
      });
    }

    test('no network still signs out, and does not wait long', () async {
      await SessionService.saveSession('old.jwt', _preparator);
      ApiService.instance.httpClientAdapter = _Recorder(
        (options) => throw DioException.connectionError(
          requestOptions: options,
          reason: 'offline',
        ),
      );
      final notifier = SessionNotifier();
      while (notifier.state.isLoading) {
        await Future<void>.delayed(Duration.zero);
      }

      await notifier.logout();

      expect(notifier.state.value, isNull);
      expect(await SessionService.getToken(), isNull);
      notifier.dispose();
    });

    test('a server that never answers is waited on only so long', () async {
      await SessionService.saveSession('old.jwt', _preparator);
      ApiService.instance.httpClientAdapter = _Recorder((_) => null);
      final notifier = SessionNotifier(
        logoutWait: const Duration(milliseconds: 50),
      );
      while (notifier.state.isLoading) {
        await Future<void>.delayed(Duration.zero);
      }

      final stopwatch = Stopwatch()..start();
      await notifier.logout();

      expect(stopwatch.elapsed, lessThan(const Duration(seconds: 2)));
      expect(notifier.state.value, isNull);
      expect(await SessionService.getToken(), isNull);
      notifier.dispose();
    });

    test(
      'the default wait is a few seconds, not the request timeout',
      () async {
        final notifier = SessionNotifier();
        while (notifier.state.isLoading) {
          await Future<void>.delayed(Duration.zero);
        }
        expect(
          notifier.logoutWait,
          lessThanOrEqualTo(const Duration(seconds: 5)),
        );
        notifier.dispose();
      },
    );
  });
}
