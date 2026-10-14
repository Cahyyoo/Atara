import 'dart:convert';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/models/master_option.dart';
import 'package:atara/models/sample_identity.dart';
import 'package:atara/models/sample_model.dart';
import 'package:atara/models/stage_board.dart';
import 'package:atara/providers/master_options_provider.dart';
import 'package:atara/providers/todo_provider.dart';
import 'package:atara/theme/app_theme.dart';
import 'package:atara/widgets/sample_identity_card.dart';
import 'package:atara/widgets/todo_section.dart';

/// The barcode check, the identity behind it, and Home's to-do list — each
/// handed its data directly, so nothing here touches the network.

const _options = [
  MasterOption(id: 'p1', kind: MasterKind.place, code: 'MOL'),
  MasterOption(id: 'r1', kind: MasterKind.rockType, code: 'LIM'),
  MasterOption(id: 's1', kind: MasterKind.sir, code: '3'),
  MasterOption(id: 'k1', kind: MasterKind.pit, code: 'A4'),
];

const _fullRecord = {
  'id': 'rec-1',
  'labCode': 'SPR.QLAB.20261014.001',
  'placeId': 'p1',
  'rockTypeId': 'r1',
  'nonProdId': null,
  'pitId': 'k1',
  'sirId': 's1',
  'bargingNo': '42',
  'sequenceNo': 919,
  'sampleNo': 3,
  'sackCount': 12,
  'sampleIdent': 'MOL LIM S3/PA4/B42/919.3/12',
};

Map<String, dynamic> _sampleJson(Object? labRecord) => {
  'id': 'sample-1',
  'sampleCode': 'SMPL-2026-00090',
  'status': 'IN_PROGRESS',
  'currentStage': null,
  'createdBy': {'name': 'Database Staff'},
  'updatedAt': '2026-10-14T03:00:00.000Z',
  'labRecord': labRecord,
};

class _FixedBoard extends TodoNotifier {
  _FixedBoard(StageBoard board) {
    state = board;
  }

  @override
  Future<void> refresh() async {}
}

Future<void> _pump(
  WidgetTester tester,
  Widget sliverOrBox, {
  List<Override> overrides = const [],
}) async {
  tester.view.physicalSize = const Size(400 * 3, 1600 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        locale: const Locale('id'),
        theme: AppTheme.light,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Builder(
          builder: (context) => MediaQuery(
            data: MediaQuery.of(context).copyWith(disableAnimations: true),
            child: CupertinoPageScaffold(
              child: CustomScrollView(
                slivers: [
                  sliverOrBox is SliverToBoxAdapter ||
                          sliverOrBox is TodoSection
                      ? sliverOrBox
                      : SliverToBoxAdapter(child: sliverOrBox),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('SampleModel identity', () {
    test('reads the parts off a whole lab record', () {
      final sample = SampleModel.fromJson(_sampleJson(_fullRecord));
      final identity = sample.identity!;
      expect(identity.labCode, 'SPR.QLAB.20261014.001');
      expect(identity.placeId, 'p1');
      expect(identity.nonProdId, isNull);
      expect(identity.sequenceNo, 919);
      expect(identity.sackCount, 12);
    });

    test(
      'does not mistake the scan reply\'s cut-down record for an empty identity',
      () {
        final sample = SampleModel.fromJson(
          _sampleJson({
            'labCode': 'SPR.QLAB.20261014.001',
            'sampleIdent': 'MOL',
          }),
        );
        expect(sample.sampleIdent, 'MOL');
        expect(sample.identity, isNull);
      },
    );

    test('survives the device cache', () {
      final sample = SampleModel.fromJson(_sampleJson(_fullRecord));
      final back = SampleModel.fromJson(
        jsonDecode(jsonEncode(sample.toJson())) as Map<String, dynamic>,
      );
      expect(back.sampleIdent, sample.sampleIdent);
      expect(back.identity!.toPayload(), sample.identity!.toPayload());
    });

    test('sends every part, a cleared one as null', () {
      const identity = SampleIdentity(
        labRecordId: 'r',
        labCode: 'L',
        placeId: 'p1',
      );
      final payload = identity.toPayload();
      expect(payload.keys, hasLength(9));
      expect(payload['placeId'], 'p1');
      expect(payload.containsKey('pitId'), isTrue);
      expect(payload['pitId'], isNull);
    });
  });

  group('SampleIdentityCard', () {
    testWidgets('names each part by its code', (tester) async {
      final sample = SampleModel.fromJson(_sampleJson(_fullRecord));
      await _pump(
        tester,
        SampleIdentityCard(sample: sample, onEdit: () {}),
        overrides: [
          masterOptionsProvider.overrideWith((ref) async => _options),
        ],
      );
      await tester.pump();

      expect(
        find.textContaining('MOL LIM S3/PA4/B42/919.3/12'),
        findsOneWidget,
      );
      expect(find.text('SPR.QLAB.20261014.001'), findsOneWidget);
      expect(find.text('Tempat'), findsOneWidget);
      expect(find.text('MOL'), findsOneWidget);
      expect(find.text('A4'), findsOneWidget);
      expect(find.text('919'), findsOneWidget);
      // Nothing was picked as the non-production code, so it is not listed.
      expect(find.text('Kode Non-Produksi'), findsNothing);
      expect(find.text('Ubah Sample ID'), findsOneWidget);
    });

    testWidgets(
      'says a barcode has no Sample ID yet, and asks for nothing to load',
      (tester) async {
        var asked = false;
        final sample = SampleModel.fromJson(
          _sampleJson({
            ..._fullRecord,
            'placeId': null,
            'rockTypeId': null,
            'pitId': null,
            'sirId': null,
            'sampleIdent': null,
          }),
        );
        await _pump(
          tester,
          SampleIdentityCard(sample: sample, onEdit: () {}),
          overrides: [
            masterOptionsProvider.overrideWith((ref) async {
              asked = true;
              return _options;
            }),
          ],
        );

        expect(find.text('Barcode ini belum punya Sample ID.'), findsOneWidget);
        expect(find.text('Isi Sample ID'), findsOneWidget);
        expect(asked, isFalse, reason: 'no coded part, so no list to fetch');
      },
    );
  });

  group('TodoSection', () {
    StageBoard board() => StageBoard.fromJson({
      'generatedAt': '2026-10-14T03:00:00.000Z',
      'slaHours': 24,
      'columns': [
        {
          'id': 'st1',
          'kind': 'stage',
          'stageKey': 'RECEIVED',
          'stageName': 'Received',
          'count': 5,
          'overdue': 2,
          'cards': [],
        },
        {
          'id': 'st2',
          'kind': 'stage',
          'stageKey': 'WET_PREP',
          'stageName': 'Wet Prep',
          'count': 0,
          'overdue': 0,
          'cards': [],
        },
        {
          'id': 'st5',
          'kind': 'done',
          'stageKey': 'REPORT',
          'stageName': 'Report',
          'count': 9,
          'overdue': 0,
          'cards': [],
        },
      ],
    });

    testWidgets('lists only the stages with something waiting', (tester) async {
      await _pump(
        tester,
        const TodoSection(),
        overrides: [todoProvider.overrideWith((ref) => _FixedBoard(board()))],
      );

      expect(find.text('5 sampel'), findsOneWidget);
      expect(find.text('2 lewat SLA'), findsOneWidget);
      // An empty stage, and the finished column, are not work to do.
      expect(find.text('0 sampel'), findsNothing);
      expect(find.text('9 sampel'), findsNothing);
    });

    testWidgets('says so when nothing is waiting', (tester) async {
      await _pump(
        tester,
        const TodoSection(),
        overrides: [
          todoProvider.overrideWith(
            (ref) => _FixedBoard(
              StageBoard(
                generatedAt: DateTime(2026),
                slaHours: 24,
                columns: const [],
              ),
            ),
          ),
        ],
      );

      expect(find.text('Tidak ada sampel yang menunggu.'), findsOneWidget);
    });
  });
}
