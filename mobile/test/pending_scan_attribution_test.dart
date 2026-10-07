import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:atara/models/pending_scan.dart';
import 'package:atara/services/pending_scan_service.dart';

/// The queue outlives a sign-out, and the server takes the operator from the
/// session rather than from the request body. So scans queued offline by one
/// operator and drained after someone else signs in on the same handset were
/// being filed as that second operator's work.
///
/// Nothing showed it, because the app only ever displayed the current shift.
/// A dated history is the first screen that would.

PendingScan scan(String id, {String? operatorId}) => PendingScan(
      id: id,
      sampleCode: 'SMPL-2026-$id',
      stageId: 'stage-1',
      stageName: 'PREP BASAH',
      queuedAt: DateTime.utc(2026, 9, 22, 10),
      operatorId: operatorId,
    );

Future<void> seed(List<PendingScan> scans) async {
  SharedPreferences.setMockInitialValues({
    'atara_pending_scans':
        scans.map((s) => jsonEncode(s.toJson())).toList(),
  });
}

void main() {
  tearDown(SharedPreferences.resetStatic);

  test('a queue is read back as the operator who made it', () async {
    await seed([
      scan('00001', operatorId: 'operator-a'),
      scan('00002', operatorId: 'operator-b'),
      scan('00003', operatorId: 'operator-a'),
    ]);

    final mine = await PendingScanService.getFor('operator-a');

    expect(mine.map((s) => s.id), ['00001', '00003']);
  });

  test('scans queued before operators were recorded still go out', () async {
    // There is no way to find out who queued these, and losing a scan is worse
    // than crediting it to whoever is signed in — which is what was already
    // happening to every scan before this change.
    await seed([
      scan('00001'),
      scan('00002', operatorId: 'operator-b'),
    ]);

    final mine = await PendingScanService.getFor('operator-a');

    expect(mine.map((s) => s.id), ['00001']);
  });

  test('a signed-out drain still carries the unattributed ones', () async {
    await seed([scan('00001'), scan('00002', operatorId: 'operator-a')]);

    final anonymous = await PendingScanService.getFor(null);

    expect(anonymous.map((s) => s.id), ['00001']);
  });

  group('writing one operator scan leaves the others alone', () {
    // The hazard the filtered read was kept out of getAll() for: every writer
    // below reads the whole list, changes one entry and writes it back. A
    // filter inside getAll() would silently delete every other account's
    // queued work on the next save.

    test('removing', () async {
      await seed([
        scan('00001', operatorId: 'operator-a'),
        scan('00002', operatorId: 'operator-b'),
      ]);

      await PendingScanService.remove('00001');

      final all = await PendingScanService.getAll();
      expect(all.map((s) => s.id), ['00002']);
    });

    test('marking failed', () async {
      await seed([
        scan('00001', operatorId: 'operator-a'),
        scan('00002', operatorId: 'operator-b'),
      ]);

      await PendingScanService.markFailed('00001', 'Out of stage order');

      final all = await PendingScanService.getAll();
      expect(all.length, 2);
      expect(all.firstWhere((s) => s.id == '00002').operatorId, 'operator-b');
    });

    test('queueing another', () async {
      await seed([scan('00001', operatorId: 'operator-b')]);

      await PendingScanService.add(scan('00002', operatorId: 'operator-a'));

      final all = await PendingScanService.getAll();
      expect(all.map((s) => s.operatorId), ['operator-b', 'operator-a']);
    });
  });

  test('the operator survives a round trip, and an old entry reads as null',
      () async {
    final stamped = PendingScan.fromJson(
      jsonDecode(jsonEncode(scan('00001', operatorId: 'operator-a').toJson()))
          as Map<String, dynamic>,
    );
    expect(stamped.operatorId, 'operator-a');

    // What a build before this change wrote: the key is simply absent.
    final legacy = PendingScan.fromJson({
      'id': '00002',
      'sampleCode': 'SMPL-2026-00002',
      'stageId': 'stage-1',
      'stageName': 'PREP BASAH',
      'queuedAt': DateTime.utc(2026, 9, 22, 10).toIso8601String(),
    });
    expect(legacy.operatorId, isNull);
  });

  test('a failure marker does not drop the operator', () async {
    // copyWith rebuilds the whole object; forgetting a field there would
    // un-attribute a scan the moment the server refused it.
    final refused = scan('00001', operatorId: 'operator-a')
        .copyWith(failureReason: 'Out of stage order');

    expect(refused.operatorId, 'operator-a');
    expect(refused.copyWith(clearFailure: true).operatorId, 'operator-a');
  });
}
