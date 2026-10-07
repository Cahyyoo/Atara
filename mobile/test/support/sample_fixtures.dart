import 'package:atara/models/sample_log_entry.dart';
import 'package:atara/models/sample_model.dart';
import 'package:atara/models/stage_model.dart';

/// A sample the way the detail screen renders one.
///
/// Built here rather than in each test because the cache is the only seam into
/// that screen that is not a network call: `SampleDetailScreen.initState` reads
/// `SampleCacheService.load`, which is nothing but SharedPreferences, so seeding
/// the cache renders the whole loaded page without a server and without adding
/// an injection point to production code.
SampleModel sampleFixture({
  String sampleCode = 'SMPL-2026-00001',
  String? sampleIdent = 'MOL/LIM/S3/PA4/B42/919.3/25',
  SampleStatus status = SampleStatus.inProgress,
  int logs = 3,
  bool withStage = true,
}) {
  return SampleModel(
    id: 'sample-1',
    sampleCode: sampleCode,
    sampleIdent: sampleIdent,
    status: status,
    currentStage: withStage
        ? const StageModel(
            id: 'stage-wet',
            key: 'WET_PREP',
            name: 'PREP BASAH',
            sequenceOrder: 2,
          )
        : null,
    createdByName: 'Operator Satu',
    updatedAt: DateTime.utc(2026, 9, 22, 8, 30),
    logs: [
      for (var i = 0; i < logs; i++)
        SampleLogEntry(
          stageKey: i.isEven ? 'RECEIVED' : 'WET_PREP',
          stageName: i.isEven ? 'DITERIMA' : 'PREP BASAH',
          operatorName: 'Operator ${i + 1}',
          scannedAt: DateTime.utc(2026, 9, 20 + (i % 3), 8, i),
          // Every other row carries a note, and one is the full 120 characters
          // the server truncates to — the widest thing a history row can hold.
          notes: i.isOdd ? 'a' * 120 : null,
          isCorrection: i == 1,
        ),
    ],
  );
}
