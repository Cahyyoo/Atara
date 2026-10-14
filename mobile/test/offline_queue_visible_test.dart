import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/models/stage_model.dart';
import 'package:atara/providers/pending_scans_provider.dart';
import 'package:atara/providers/stages_provider.dart';
import 'package:atara/screens/update_status_screen.dart';

/// Makes every connection attempt fail the way being out of signal does.
///
/// The binding otherwise answers 400 to any request, which the app reads as a
/// real refusal from a server it reached — the opposite of the case here.
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

/// A scan queued offline has to be visible the moment the preparator lands back
/// on Home.
///
/// It was not. `_queueOffline` wrote the scan to disk and popped, and nothing
/// told `pendingScansProvider` — the only thing Home actually reads. So the
/// preparator was shown "saved offline", returned to a Home with no queue on it
/// at all, and had every reason to think the scan was lost. The one moment this
/// bites is the one moment it must not: offline, where no connectivity event
/// fires to refresh anything, so only a deliberate pull would have revealed the
/// work was still there.
void main() {
  testWidgets('a scan queued offline reaches the provider Home reads',
      (tester) async {
    // Tall on purpose: the button sits below the notes field, and a scrolling
    // viewport does not build what is off screen.
    tester.view.physicalSize = const Size(400 * 3, 2000 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    SharedPreferences.setMockInitialValues({});
    final previousOverrides = HttpOverrides.current;
    HttpOverrides.global = _UnreachableHttpOverrides();
    addTearDown(() => HttpOverrides.global = previousOverrides);
    addTearDown(SharedPreferences.resetStatic);

    final container = ProviderContainer(
      overrides: [
        stagesProvider.overrideWith(
          (ref) async => const [
            StageModel(id: 's1', name: 'Preparation', sequenceOrder: 1),
            StageModel(id: 's2', name: 'Drying', sequenceOrder: 2),
          ],
        ),
      ],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(
          locale: Locale('id'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: UpdateStatusScreen(sampleCode: 'NKL-2026-00031'),
        ),
      ),
    );
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }

    expect(container.read(pendingScansProvider), isEmpty);

    // Offline there is no current stage to default from, so the preparator picks
    // one; the button does nothing until they do.
    await tester.tap(find.text('Drying'));
    await tester.pump();

    final save = find.text('Simpan & Perbarui Tahap');
    expect(save, findsOneWidget,
        reason: 'offline, the stage picker is still offered so work is not lost');
    await tester.ensureVisible(save);
    await tester.tap(save);
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }

    expect(
      container.read(pendingScansProvider).map((scan) => scan.sampleCode),
      contains('NKL-2026-00031'),
      reason: 'the queue was written to disk but Home was never told',
    );
  });
}
