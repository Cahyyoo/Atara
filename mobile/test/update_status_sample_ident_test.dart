import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/models/sample_model.dart';
import 'package:atara/models/stage_model.dart';
import 'package:atara/screens/update_status_screen.dart';
import 'package:atara/services/sample_cache_service.dart';

/// Renders the card without a server.
///
/// There is none in a test, so the lookup fails as a connection error and the
/// screen falls back to the device cache — the same path an operator takes in a
/// shed with no signal, which is exactly where this card is read.
Future<void> showCachedSample(WidgetTester tester, SampleModel sample) async {
  await SampleCacheService.save(sample);

  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(
        locale: const Locale('id'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: UpdateStatusScreen(sampleCode: sample.sampleCode),
      ),
    ),
  );

  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 200));
  }
}

SampleModel sample({required String code, String? ident}) {
  return SampleModel(
    id: 'id-$code',
    sampleCode: code,
    sampleIdent: ident,
    status: SampleStatus.inProgress,
    currentStage: StageModel(id: 'stage-2', name: 'Drying', sequenceOrder: 2),
    createdByName: 'Main Admin',
    updatedAt: DateTime.utc(2026, 9, 20, 3),
  );
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    // flutter_test answers every request with a stub 400, which the app reads
    // as a refusal from the server — a real answer, never papered over with
    // stale data. Failing the connection instead is what puts the screen on the
    // offline path, which is where the operator in a shed with no signal is.
    HttpOverrides.global = _UnreachableServer();
  });

  tearDown(() => HttpOverrides.global = null);

  testWidgets('shows the Sample ID beside the code', (tester) async {
    await showCachedSample(
      tester,
      sample(code: 'SMPL-2026-00082', ident: 'MOL/LIM/S3/PA4/B42/919.3/25'),
    );

    expect(find.text('SMPL-2026-00082'), findsOneWidget);
    expect(find.textContaining('MOL/LIM/S3/PA4/B42/919.3/25'), findsOneWidget);
  });

  testWidgets('leaves the row out entirely when there is no Sample ID', (tester) async {
    await showCachedSample(tester, sample(code: 'SMPL-2026-00083'));

    expect(find.text('SMPL-2026-00083'), findsOneWidget);
    // Not a dash, not an empty row: nothing. Most samples are barcoded before
    // their identity is known, so this is the ordinary case, and the card is
    // read standing in front of the container.
    expect(find.textContaining('Sample ID'), findsNothing);
  });

  testWidgets('still opens a sample carrying an old NKL code', (tester) async {
    await showCachedSample(tester, sample(code: 'NKL-2026-00031', ident: 'LAM/PA4'));

    expect(find.text('NKL-2026-00031'), findsOneWidget);
    expect(find.textContaining('LAM/PA4'), findsOneWidget);
  });
}

/// An HttpClient that cannot connect to anything.
class _UnreachableServer extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) => _FailingClient();
}

class _FailingClient implements HttpClient {
  @override
  Future<HttpClientRequest> openUrl(String method, Uri url) async {
    throw const SocketException('no route to host in a test');
  }

  // Everything else is unreachable: the request never gets past openUrl.
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
