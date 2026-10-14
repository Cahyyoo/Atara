import 'package:flutter_test/flutter_test.dart';

import 'package:atara/models/pending_scan.dart';
import 'package:atara/models/sample_log_entry.dart';

/// What a phone stored before "operator" was renamed "preparator" must still
/// read after the update: a queued scan keeps its account, and a cached
/// history keeps its names.
void main() {
  test('a scan queued by an older build keeps the account it belongs to', () {
    final scan = PendingScan.fromJson({
      'id': 'q1',
      'sampleCode': 'SMPL-2026-00001',
      'stageId': 'stage-2',
      'queuedAt': '2026-10-14T03:00:00.000Z',
      'operatorId': 'user-a',
    });
    expect(scan.preparatorId, 'user-a');
    expect(scan.toJson()['preparatorId'], 'user-a');
  });

  test('a history row cached by an older build keeps its name', () {
    final nested = SampleLogEntry.fromJson({
      'stage': {'key': 'WET_PREP', 'name': 'Wet Prep'},
      'operator': {'name': 'Siti'},
      'scannedAt': '2026-10-14T03:00:00.000Z',
    });
    final flat = SampleLogEntry.fromJson({
      'stageName': 'Wet Prep',
      'operatorName': 'Siti',
      'scannedAt': '2026-10-14T03:00:00.000Z',
    });
    expect(nested.preparatorName, 'Siti');
    expect(flat.preparatorName, 'Siti');
  });

  test('the server\'s new shape reads first', () {
    final entry = SampleLogEntry.fromJson({
      'stage': {'key': 'WET_PREP', 'name': 'Wet Prep'},
      'preparator': {'name': 'Budi'},
      'scannedAt': '2026-10-14T03:00:00.000Z',
    });
    expect(entry.preparatorName, 'Budi');
  });
}
