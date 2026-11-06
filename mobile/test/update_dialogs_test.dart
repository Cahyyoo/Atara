import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/services/update_service.dart';
import 'package:atara/theme/app_theme.dart';
import 'package:atara/widgets/update_dialogs.dart';

const update = AppUpdate(
  versionName: '1.1.0',
  versionCode: 105,
  url: 'https://example.com/atara-lab.apk',
  sha256: 'abc',
  size: 10 * 1024 * 1024,
  notes: 'Perbaikan splash',
);

/// A download the test finishes by hand.
class _FakeService extends UpdateService {
  _FakeService() : super(enabled: true, dio: Dio());

  int downloads = 0;
  CancelToken? lastCancel;
  void Function(int)? progress;
  Completer<String> result = Completer<String>();
  final List<String> installed = [];
  bool installFails = false;

  @override
  Future<String> download(
    AppUpdate update, {
    required void Function(int received) onProgress,
    CancelToken? cancelToken,
  }) {
    downloads++;
    lastCancel = cancelToken;
    progress = onProgress;
    return result.future;
  }

  @override
  Future<void> install(String path) async {
    if (installFails) throw Exception('no installer');
    installed.add(path);
  }
}

void main() {
  late _FakeService service;

  Future<void> pumpOffer(
    WidgetTester tester, {
    bool installFails = false,
  }) async {
    // Made here, not in setUp: a Completer created outside the test's fake
    // clock never finishes while the test is pumping.
    service = _FakeService()..installFails = installFails;
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('id'),
        theme: AppTheme.light,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => offerUpdate(context, update, service),
              child: const Text('buka'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('buka'));
    await tester.pumpAndSettle();
  }

  Future<void> accept(WidgetTester tester) async {
    await tester.tap(find.text('Perbarui'));
    await tester.pumpAndSettle();
  }

  testWidgets('asks first, naming the version, size and notes', (tester) async {
    await pumpOffer(tester);
    expect(find.textContaining('1.1.0'), findsOneWidget);
    expect(find.textContaining('10,0 MB'), findsOneWidget);
    expect(find.textContaining('Perbaikan splash'), findsOneWidget);
    expect(service.downloads, 0);
  });

  testWidgets('"Nanti" closes it and downloads nothing', (tester) async {
    await pumpOffer(tester);
    await tester.tap(find.text('Nanti'));
    await tester.pumpAndSettle();
    expect(find.text('Pembaruan tersedia'), findsNothing);
    expect(service.downloads, 0);
  });

  testWidgets('"Perbarui" opens the modal and shows progress', (tester) async {
    await pumpOffer(tester);
    await accept(tester);
    expect(find.text('Mengunduh pembaruan'), findsOneWidget);
    expect(find.text('0,0 / 10,0 MB'), findsOneWidget);

    service.progress!(5 * 1024 * 1024);
    await tester.pump();
    expect(find.text('5,0 / 10,0 MB'), findsOneWidget);
  });

  testWidgets('the modal cannot be dismissed from outside', (tester) async {
    await pumpOffer(tester);
    await accept(tester);
    await tester.tapAt(const Offset(5, 5));
    await tester.pumpAndSettle();
    expect(find.text('Mengunduh pembaruan'), findsOneWidget);
  });

  testWidgets('"Batal" stops the download and closes', (tester) async {
    await pumpOffer(tester);
    await accept(tester);
    await tester.tap(find.text('Batal'));
    await tester.pumpAndSettle();
    expect(find.text('Mengunduh pembaruan'), findsNothing);
    expect(service.lastCancel!.isCancelled, isTrue);
  });

  testWidgets('a failed download offers another try', (tester) async {
    await pumpOffer(tester);
    await accept(tester);
    service.result.completeError(Exception('offline'));
    await tester.pumpAndSettle();
    expect(find.text('Pembaruan gagal'), findsOneWidget);
    expect(find.textContaining('Periksa koneksi'), findsOneWidget);

    service.result = Completer<String>();
    await tester.tap(find.text('Coba lagi'));
    await tester.pump();
    expect(find.text('Mengunduh pembaruan'), findsOneWidget);
    expect(service.downloads, 2);
    await tester.pumpAndSettle();
  });

  testWidgets('a damaged file says so', (tester) async {
    await pumpOffer(tester);
    await accept(tester);
    service.result.completeError(const UpdateCorruptedException());
    await tester.pumpAndSettle();
    expect(find.textContaining('rusak'), findsOneWidget);
  });

  testWidgets('when ready, "Pasang" opens the installer and stays open', (
    tester,
  ) async {
    await pumpOffer(tester);
    await accept(tester);
    service.result.complete('/cache/updates/atara-lab.apk');
    await tester.pumpAndSettle();
    expect(find.text('Siap dipasang'), findsOneWidget);

    await tester.tap(find.text('Pasang'));
    await tester.pumpAndSettle();
    expect(service.installed, ['/cache/updates/atara-lab.apk']);
    // Android may detour through its "allow this source" setting first.
    expect(find.text('Pasang'), findsOneWidget);
  });

  testWidgets('an installer that will not open does not download again', (
    tester,
  ) async {
    await pumpOffer(tester, installFails: true);
    await accept(tester);
    service.result.complete('/cache/updates/atara-lab.apk');
    await tester.pumpAndSettle();

    await tester.tap(find.text('Pasang'));
    await tester.pumpAndSettle();
    expect(find.text('Pembaruan gagal'), findsOneWidget);

    await tester.tap(find.text('Coba lagi'));
    await tester.pumpAndSettle();
    expect(find.text('Siap dipasang'), findsOneWidget);
    expect(service.downloads, 1);
  });
}
