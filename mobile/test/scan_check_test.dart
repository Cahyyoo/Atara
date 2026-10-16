import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/models/sample_identity.dart';
import 'package:atara/models/sample_model.dart';
import 'package:atara/services/api_exception.dart';
import 'package:atara/services/barcode_check.dart';
import 'package:atara/theme/app_theme.dart';
import 'package:atara/widgets/scan_check_pill.dart';

/// The scanner's "Check Barcode" mode: what a code's answer is, and how the
/// pill over the camera says it — the barcode and the Sample ID, nothing else.

SampleModel _sample({
  String? ident,
  bool? has,
  bool hidden = false,
  String? labCode = 'SPR.QLAB.20261016.001',
}) => SampleModel(
  id: 's',
  sampleCode: 'SMPL-2026-00001',
  sampleIdent: ident,
  identity: labCode == null
      ? null
      : SampleIdentity(labRecordId: 'r', labCode: labCode),
  hasSampleIdent: has,
  identHidden: hidden,
  status: SampleStatus.pending,
  currentStage: null,
  createdByName: 'Admin',
  updatedAt: DateTime.utc(2026, 10, 16),
);

Future<void> _pumpPill(
  WidgetTester tester,
  BarcodeCheck check, {
  VoidCallback? onOpen,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      locale: const Locale('id'),
      theme: AppTheme.light,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: CupertinoPageScaffold(
        backgroundColor: CupertinoColors.black,
        child: Center(
          child: ScanCheckPill(
            check: check,
            onOpen: onOpen ?? () {},
            onDismiss: () {},
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  group('checkBarcode', () {
    test('gives the Sample ID when the app may show it', () async {
      final check = await checkBarcode(
        'C',
        fetch: (_) async => _sample(ident: 'MOL/PA4'),
      );
      expect(check.state, BarcodeCheckState.hasIdent);
      expect(check.sampleIdent, 'MOL/PA4');
      expect(check.labCode, 'SPR.QLAB.20261016.001');
      expect(check.displayCode, 'SPR.QLAB.20261016.001');
    });

    test(
      'names a sample by its barcode when no Lab Code came with it',
      () async {
        final check = await checkBarcode(
          'SMPL-2026-00001',
          fetch: (_) async => _sample(ident: 'MOL', labCode: null),
        );
        expect(check.displayCode, 'SMPL-2026-00001');
      },
    );

    test('says only that it has one when the lab keeps it hidden', () async {
      final check = await checkBarcode(
        'C',
        fetch: (_) async => _sample(has: true, hidden: true),
      );
      expect(check.state, BarcodeCheckState.hasIdentHidden);
      expect(check.sampleIdent, isNull);
    });

    test('says when there is none yet', () async {
      final check = await checkBarcode('C', fetch: (_) async => _sample());
      expect(check.state, BarcodeCheckState.noIdent);
    });

    test('says when the barcode is not registered', () async {
      final check = await checkBarcode(
        'C',
        fetch: (_) => Future.error(
          const ApiException(
            'missing',
            statusCode: 404,
            kind: ApiErrorKind.server,
          ),
        ),
      );
      expect(check.state, BarcodeCheckState.notRegistered);
    });

    test('says it cannot tell without a connection', () async {
      final check = await checkBarcode(
        'C',
        fetch: (_) => Future.error(
          const ApiException('offline', kind: ApiErrorKind.unreachable),
        ),
      );
      expect(check.state, BarcodeCheckState.offline);
    });
  });

  group('ScanCheckPill', () {
    testWidgets('shows the Lab Code and its Sample ID, and opens on a tap', (
      tester,
    ) async {
      var opened = 0;
      await _pumpPill(
        tester,
        const BarcodeCheck(
          'SMPL-2026-00001',
          BarcodeCheckState.hasIdent,
          sampleIdent: 'MOL LIM S3/PA4/B42/919.3/12',
          labCode: 'SPR.QLAB.20261016.001',
        ),
        onOpen: () => opened++,
      );

      expect(find.text('SPR.QLAB.20261016.001'), findsOneWidget);
      expect(find.text('SMPL-2026-00001'), findsNothing);
      expect(find.text('MOL LIM S3/PA4/B42/919.3/12'), findsOneWidget);
      await tester.tap(find.text('SPR.QLAB.20261016.001'));
      expect(opened, 1);
    });

    testWidgets('names it by the barcode while it is still being checked', (
      tester,
    ) async {
      await _pumpPill(tester, const BarcodeCheck.checking('SMPL-2026-00001'));
      expect(find.text('SMPL-2026-00001'), findsOneWidget);
    });

    testWidgets('says "has one" without the id when it is hidden', (
      tester,
    ) async {
      await _pumpPill(
        tester,
        const BarcodeCheck('SMPL-2026-00001', BarcodeCheckState.hasIdentHidden),
      );
      expect(find.text('Sudah ada Sample ID'), findsOneWidget);
    });

    testWidgets('says plainly when there is none yet', (tester) async {
      await _pumpPill(
        tester,
        const BarcodeCheck('SMPL-2026-00001', BarcodeCheckState.noIdent),
      );
      expect(find.text('Belum ada Sample ID'), findsOneWidget);
    });

    testWidgets('does not open a barcode that is not registered', (
      tester,
    ) async {
      var opened = 0;
      await _pumpPill(
        tester,
        const BarcodeCheck('SMPL-9999-99999', BarcodeCheckState.notRegistered),
        onOpen: () => opened++,
      );
      expect(find.text('Barcode tidak terdaftar'), findsOneWidget);
      await tester.tap(find.text('SMPL-9999-99999'));
      expect(opened, 0);
    });
  });
}
