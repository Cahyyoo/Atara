import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/models/sample_model.dart';
import 'package:atara/models/stage_model.dart';
import 'package:atara/providers/stages_provider.dart';
import 'package:atara/screens/update_status_screen.dart';
import 'package:atara/services/sample_cache_service.dart';

/// The stage-order override belongs to the operator.
///
/// The server accepts `force` with a reason from PREPARATOR alone, and the app is
/// for nobody else — so an operator who picks a stage out of order is offered
/// the override, and there is no way for anyone else to reach it: every other
/// role is turned away at sign-in and cleared from storage on start.
const _stages = [
  StageModel(id: 'stage-1', name: 'Receiving', sequenceOrder: 1),
  StageModel(id: 'stage-2', name: 'Drying', sequenceOrder: 2),
  StageModel(id: 'stage-3', name: 'Grinding', sequenceOrder: 3),
];

final _sample = SampleModel(
  id: 'id-1',
  sampleCode: 'SMPL-2026-00090',
  status: SampleStatus.inProgress,
  currentStage: _stages[1],
  createdByName: 'Main Admin',
  updatedAt: DateTime.utc(2026, 9, 20, 3),
);

String _storedUser(String role) => jsonEncode({
  'id': 'u1',
  'name': 'Siti',
  'email': 'siti@atara.local',
  'role': role,
});

Future<void> openWithStoredRole(WidgetTester tester, String role) async {
  SharedPreferences.setMockInitialValues({
    'atara_token': 'stored.jwt',
    'atara_user': _storedUser(role),
  });
  await SampleCacheService.save(_sample);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [stagesProvider.overrideWith((ref) async => _stages)],
      child: MaterialApp(
        locale: const Locale('en'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: UpdateStatusScreen(sampleCode: _sample.sampleCode),
      ),
    ),
  );
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 200));
  }
}

/// Picks a stage behind the current one — a move back.
Future<void> pickReceiving(WidgetTester tester) async {
  final row = find.text('Receiving');
  await tester.ensureVisible(row);
  await tester.tap(row);
  await tester.pump();
}

final overrideTitle = find.text('Out of stage order');

void main() {
  setUp(() {
    // Offline, so the screen runs on the cached sample without a server.
    HttpOverrides.global = _UnreachableServer();
  });

  tearDown(() => HttpOverrides.global = null);

  testWidgets('an operator moving a sample back is offered the override', (
    tester,
  ) async {
    await openWithStoredRole(tester, 'PREPARATOR');

    expect(
      overrideTitle,
      findsNothing,
      reason: 'the next stage in order needs no explanation',
    );

    await pickReceiving(tester);

    expect(overrideTitle, findsOneWidget);
    expect(
      find.text('Reason for the correction'.toUpperCase()),
      findsOneWidget,
    );
  });

  testWidgets('a stored ADMIN session never reaches it', (tester) async {
    // Saved by an older build. It is cleared on start, so the screen has no
    // operator behind it and the panel is not offered.
    await openWithStoredRole(tester, 'ADMIN');

    await pickReceiving(tester);

    expect(overrideTitle, findsNothing);
  });
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
