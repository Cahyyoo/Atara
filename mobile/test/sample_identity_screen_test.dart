import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/models/master_option.dart';
import 'package:atara/models/sample_identity.dart';
import 'package:atara/models/sample_model.dart';
import 'package:atara/providers/master_options_provider.dart';
import 'package:atara/screens/sample_identity_screen.dart';
import 'package:atara/theme/app_theme.dart';

/// The identity form, answered without a server: it previews the Sample ID as
/// it is typed, warns when another sample already holds it, and refuses to save
/// until the clash is gone.

const _options = [
  MasterOption(id: 'p1', kind: MasterKind.place, code: 'MOL'),
  MasterOption(id: 'k1', kind: MasterKind.pit, code: 'A4'),
];

SampleModel _sample({String? placeId, String? ident}) => SampleModel(
  id: 's1',
  sampleCode: 'SMPL-2026-00091',
  sampleIdent: ident,
  identity: SampleIdentity(
    labRecordId: 'rec-1',
    labCode: 'SPR.QLAB.20261014.002',
    placeId: placeId,
    pitId: placeId == null ? null : 'k1',
  ),
  status: SampleStatus.pending,
  currentStage: null,
  createdByName: 'Database Staff',
  updatedAt: DateTime.utc(2026, 10, 14),
);

Future<List<({SampleIdentity identity, bool dryRun})>> _pump(
  WidgetTester tester, {
  required SampleModel sample,
  String? clashWith,
}) async {
  final calls = <({SampleIdentity identity, bool dryRun})>[];
  tester.view.physicalSize = const Size(400 * 3, 2000 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [masterOptionsProvider.overrideWith((ref) async => _options)],
      child: MaterialApp(
        locale: const Locale('id'),
        theme: AppTheme.light,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        // Pushed over a page, as it is in the app, so a save has something to
        // pop back to.
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<bool>(
                builder: (context) => SampleIdentityScreen(
                  sampleCode: sample.sampleCode,
                  fetchIdentity: (_) async => IdentitySnapshot(
                    sampleIdent: sample.sampleIdent,
                    identity: sample.identity!,
                  ),
                  submitIdentity: (identity, {required dryRun}) async {
                    calls.add((identity: identity, dryRun: dryRun));
                    return IdentityCheck(
                      sampleIdent: null,
                      changed: true,
                      clashSampleCode: clashWith,
                      identity: identity,
                    );
                  },
                ),
              ),
            ),
            child: const Text('open'),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
  return calls;
}

Finder _field(String label) => find.descendant(
  of: find.ancestor(of: find.text(label), matching: find.byType(Row)).first,
  matching: find.byType(EditableText),
);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('previews the Sample ID from the parts already on the record', (
    tester,
  ) async {
    await _pump(
      tester,
      sample: _sample(placeId: 'p1', ident: 'MOL/A4'),
    );

    expect(find.text('SPR.QLAB.20261014.002'), findsOneWidget);
    expect(find.text('MOL/A4'), findsOneWidget);
    expect(find.text('Belum ada yang diubah.'), findsOneWidget);
  });

  testWidgets('asks for a place before there is anything to preview', (
    tester,
  ) async {
    await _pump(tester, sample: _sample());

    expect(find.text('Isi Tempat untuk menyusun Sample ID.'), findsOneWidget);
  });

  testWidgets('checks a change with the server, then saves it', (tester) async {
    final calls = await _pump(
      tester,
      sample: _sample(placeId: 'p1', ident: 'MOL/A4'),
    );

    await tester.enterText(_field('No Sample'), '919');
    await tester.pump();
    expect(find.text('MOL/A4/919'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 450));
    expect(calls.single.dryRun, isTrue);
    expect(calls.single.identity.sequenceNo, 919);

    await tester.tap(find.text('Simpan Sample ID'));
    await tester.pump();
    expect(calls.last.dryRun, isFalse);
    expect(calls.last.identity.placeId, 'p1');
    // Saved: back on the page it was opened from, with the toast gone.
    await tester.pumpAndSettle(const Duration(seconds: 3));
    expect(find.text('open'), findsOneWidget);
  });

  testWidgets('names the sample already holding the id and will not save', (
    tester,
  ) async {
    final calls = await _pump(
      tester,
      sample: _sample(placeId: 'p1', ident: 'MOL/A4'),
      clashWith: 'SMPL-2026-00001',
    );

    await tester.enterText(_field('No Sample'), '7');
    await tester.pump(const Duration(milliseconds: 450));

    expect(
      find.text('Sample ID ini sudah dipakai oleh SMPL-2026-00001.'),
      findsOneWidget,
    );
    await tester.tap(find.text('Simpan Sample ID'));
    await tester.pump();
    expect(calls.where((call) => !call.dryRun), isEmpty);
  });

  testWidgets('refuses a number out of range before asking anyone', (
    tester,
  ) async {
    final calls = await _pump(
      tester,
      sample: _sample(placeId: 'p1', ident: 'MOL/A4'),
    );

    await tester.enterText(_field('Jumlah Karung'), '123456');
    await tester.pump(const Duration(milliseconds: 450));

    expect(find.text('Isi bilangan bulat 0–99999.'), findsOneWidget);
    expect(calls, isEmpty);
  });
}
