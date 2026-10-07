import 'package:flutter_test/flutter_test.dart';

import 'package:atara/services/scan_request.dart';

/// A correction does not carry field notes, and the reason it must not is that
/// the server would throw them away without saying so.
///
/// `web/src/app/api/samples/scan/route.ts` writes
/// `notes: isCorrection ? reason : notes`, and `isCorrection` is
/// `force && role == OPERATOR` with no condition on direction. So every override
/// sent discarded whatever had been typed in Field Notes, silently.
///
/// The rule lives in one pure function because two paths reach the endpoint: a
/// live tap, and the offline queue drain. A fix in the screen alone would have
/// leaked back through every queued correction.
void main() {
  test('a correction sends the reason and drops the notes', () async {
    final body = scanUpdateBody(
      sampleCode: 'SMPL-2026-00001',
      stageId: 'stage-wet',
      notes: 'kondisi sampel baik',
      force: true,
      reason: 'salah pindai sebelumnya',
    );

    expect(
      body.containsKey('notes'),
      isFalse,
      reason: 'the server would overwrite them with the reason anyway',
    );
    expect(body['reason'], 'salah pindai sebelumnya');
    expect(body['force'], true);
  });

  test('an ordinary scan still sends its notes', () {
    final body = scanUpdateBody(
      sampleCode: 'SMPL-2026-00001',
      stageId: 'stage-wet',
      notes: 'kondisi sampel baik',
    );

    expect(body['notes'], 'kondisi sampel baik');
    expect(body.containsKey('force'), isFalse);
    expect(body.containsKey('reason'), isFalse);
  });

  test('force without a usable reason keeps the notes', () {
    // The server refuses an override with no reason (422), so this request is
    // going to fail either way — but it must not ALSO lose the notes on the way.
    final body = scanUpdateBody(
      sampleCode: 'SMPL-2026-00001',
      stageId: 'stage-wet',
      notes: 'kondisi sampel baik',
      force: true,
      reason: '   ',
    );

    expect(body['notes'], 'kondisi sampel baik');
    expect(body.containsKey('reason'), isFalse);
    expect(body['force'], true);
  });

  test('blank notes are omitted rather than sent empty', () {
    final body = scanUpdateBody(
      sampleCode: 'SMPL-2026-00001',
      stageId: 'stage-wet',
      notes: '   ',
    );

    expect(body.containsKey('notes'), isFalse);
  });

  test('everything is trimmed on the way out', () {
    final body = scanUpdateBody(
      sampleCode: 'SMPL-2026-00001',
      stageId: 'stage-wet',
      notes: '  catatan  ',
      force: true,
      reason: '  alasan koreksi  ',
    );

    expect(body['reason'], 'alasan koreksi');
  });
}
