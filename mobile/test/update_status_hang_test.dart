import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_platform_interface.dart';
import 'package:shared_preferences_platform_interface/types.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/models/stage_model.dart';
import 'package:atara/providers/stages_provider.dart';
import 'package:atara/screens/update_status_screen.dart';
import 'package:atara/services/api_service.dart';

import 'support/finders.dart';

/// A settings store that fails every read, standing in for a platform channel
/// that misbehaves on a real device.
///
/// This is the case that used to hang the update screen. The Dio request
/// interceptor read the server address and the token before calling
/// `handler.next`, so a throw meant neither `next` nor `reject` ever ran. Dio
/// waits on `handler.future`, not on the callback returning, so the request
/// future stayed pending for ever and `_loadState` never left `loading` — the
/// spinner was the screen's opening frame, frozen. The ten-second timeouts
/// cannot catch this: they only start once a request is actually dispatched.
class _FailingStore extends SharedPreferencesStorePlatform {
  @override
  Future<Map<String, Object>> getAll() async => throw StateError('store unavailable');

  @override
  Future<bool> clear() async => throw StateError('store unavailable');

  @override
  Future<bool> remove(String key) async => throw StateError('store unavailable');

  @override
  Future<bool> setValue(String valueType, String key, Object value) async =>
      throw StateError('store unavailable');

  @override
  Future<bool> clearWithParameters(ClearParameters parameters) async =>
      throw StateError('store unavailable');

  @override
  Future<Map<String, Object>> getAllWithParameters(GetAllParameters parameters) async =>
      throw StateError('store unavailable');
}

/// Makes every connection attempt fail the way a wrong address does.
///
/// `TestWidgetsFlutterBinding` otherwise answers 400 to any request, which the
/// app reads as a real refusal from a server it reached. The case worth
/// covering here is the opposite one — the server was never reached at all,
/// which is what a stale port looks like — because that is the state where the
/// stage picker is shown without a sample to go with it.
class _UnreachableHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) => _UnreachableHttpClient();
}

class _UnreachableHttpClient implements HttpClient {
  @override
  Future<HttpClientRequest> openUrl(String method, Uri url) async {
    throw const SocketException('No route to host');
  }

  @override
  noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Future<void> pumpUpdateScreen(
  WidgetTester tester, {
  List<Override> overrides = const [],
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: const MaterialApp(
        locale: Locale('id'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: UpdateStatusScreen(sampleCode: 'NKL-2026-00031'),
      ),
    ),
  );

  // Generous, but bounded: the point is that the screen *settles*. A hang shows
  // up as a failed assertion below rather than as a silent timeout.
  for (var i = 0; i < 40; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  // The real device description is a platform channel, and nothing answers one
  // under the fake clock. Left in, every request here would wait on it — which
  // is a hang this file is about, but not the one it is testing for.
  setUp(() => ApiService.clientDeviceReader = () async => null);
  tearDown(() => ApiService.clientDeviceReader = null);
  tearDown(SharedPreferences.resetStatic);

  testWidgets('settles when the settings store fails', (tester) async {
    SharedPreferences.resetStatic();
    SharedPreferencesStorePlatform.instance = _FailingStore();

    await pumpUpdateScreen(tester);

    expect(tester.takeException(), isNull, reason: 'opening the screen must not throw');
    expect(
      anyBusyIndicator,
      findsNothing,
      reason: 'a failure inside the request interceptor must surface, not hang',
    );
  });

  testWidgets('says so when the server has no stages configured', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final previousOverrides = HttpOverrides.current;
    HttpOverrides.global = _UnreachableHttpOverrides();
    addTearDown(() => HttpOverrides.global = previousOverrides);

    await pumpUpdateScreen(
      tester,
      overrides: [
        stagesProvider.overrideWith((ref) async => <StageModel>[]),
      ],
    );

    // `stages.first` on an empty list is a StateError, and an exception thrown
    // while rendering reaches the preparator as a dead screen, not a message.
    expect(tester.takeException(), isNull, reason: 'an empty stage list must not throw');
    expect(
      find.text('Belum ada tahap yang dikonfigurasi di server. Hubungi administrator.'),
      findsOneWidget,
    );
  });
}
