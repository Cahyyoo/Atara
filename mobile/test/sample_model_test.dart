import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:atara/models/sample_model.dart';
import 'package:atara/models/stage_model.dart';

/// The shape the server sends: the Sample ID hangs off the lab record, both
/// from `/api/samples/{code}` and from the reply to a scan.
Map<String, dynamic> serverJson({Object? labRecord = _absent}) {
  return {
    'id': 'sample-1',
    'sampleCode': 'SMPL-2026-00082',
    'status': 'IN_PROGRESS',
    'currentStage': {'id': 'stage-2', 'name': 'Drying', 'sequenceOrder': 2},
    'createdBy': {'name': 'Main Admin'},
    'updatedAt': '2026-09-20T03:00:00.000Z',
    if (!identical(labRecord, _absent)) 'labRecord': labRecord,
  };
}

const Object _absent = Object();

void main() {
  group('SampleModel.fromJson', () {
    test('reads the Sample ID off the lab record the server nests', () {
      final sample = SampleModel.fromJson(
        serverJson(labRecord: {'labCode': 'SPR.QLAB.20260920.001', 'sampleIdent': 'MOL/LIM/S3/PA4/B42/919.3/25'}),
      );

      expect(sample.sampleIdent, 'MOL/LIM/S3/PA4/B42/919.3/25');
      expect(sample.sampleCode, 'SMPL-2026-00082');
    });

    test('leaves it null when the sample has no identity yet', () {
      // The common case: a barcode is often printed before the barging run is
      // known, so most samples carry no Sample ID at all.
      expect(SampleModel.fromJson(serverJson(labRecord: null)).sampleIdent, isNull);
      expect(
        SampleModel.fromJson(serverJson(labRecord: {'labCode': 'X', 'sampleIdent': null})).sampleIdent,
        isNull,
      );
    });

    test('leaves it null when there is no lab record at all', () {
      expect(SampleModel.fromJson(serverJson()).sampleIdent, isNull);
    });

    /**
     * The device cache round-trips the flat key that [SampleModel.toJson]
     * writes, which is a different shape from either server reply.
     */
    test('reads the flat key the device cache writes', () {
      final original = SampleModel(
        id: 'sample-1',
        sampleCode: 'SMPL-2026-00082',
        sampleIdent: 'MOL/LIM/S3/PA4/B42/919.3/25',
        status: SampleStatus.inProgress,
        currentStage: StageModel(id: 'stage-2', name: 'Drying', sequenceOrder: 2),
        createdByName: 'Main Admin',
        updatedAt: DateTime.utc(2026, 9, 20, 3),
      );

      final roundTripped = SampleModel.fromJson(
        jsonDecode(jsonEncode(original.toJson())) as Map<String, dynamic>,
      );

      expect(roundTripped.sampleIdent, 'MOL/LIM/S3/PA4/B42/919.3/25');
    });

    /**
     * The one that would hurt. An operator updating the app mid-shift has a
     * cache full of entries written by the old build, and none of them carry
     * this key. Throwing here would empty the cache they rely on for going
     * offline — which is the moment they need it most.
     */
    test('still reads a cache entry written before the Sample ID existed', () {
      final old = {
        'id': 'sample-1',
        'sampleCode': 'NKL-2026-00031',
        'status': 'inProgress',
        'currentStage': {'id': 'stage-2', 'name': 'Drying', 'sequenceOrder': 2},
        'createdBy': {'name': 'Main Admin'},
        'updatedAt': '2026-09-20T03:00:00.000Z',
      };

      final sample = SampleModel.fromJson(old);

      expect(sample.sampleIdent, isNull);
      expect(sample.sampleCode, 'NKL-2026-00031');
      expect(sample.status, SampleStatus.inProgress);
    });

    test('carries the Sample ID through asCached', () {
      final sample = SampleModel.fromJson(
        serverJson(labRecord: {'sampleIdent': 'MOL/PA4'}),
      ).asCached();

      expect(sample.sampleIdent, 'MOL/PA4');
      expect(sample.isFromCache, isTrue);
    });
  });
}
