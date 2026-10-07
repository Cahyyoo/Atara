import 'package:flutter_test/flutter_test.dart';
import 'package:atara/models/pending_scan.dart';
import 'package:atara/services/pending_scan_service.dart';
import 'package:atara/services/api_exception.dart';
import 'package:atara/services/settings_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

PendingScan makeScan(String id) {
  return PendingScan(
    id: id,
    sampleCode: 'NKL-2026-0000$id',
    stageId: 'stage-1',
    stageName: 'Preparation',
    queuedAt: DateTime(2026, 9, 8, 10),
  );
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('PendingScanService', () {
    test('starts empty', () async {
      expect(await PendingScanService.getAll(), isEmpty);
    });

    test('keeps queued scans in the order they happened', () async {
      await PendingScanService.add(makeScan('1'));
      await PendingScanService.add(makeScan('2'));

      final queue = await PendingScanService.getAll();
      expect(queue.map((scan) => scan.id).toList(), ['1', '2']);
    });

    test('survives a round trip through storage intact', () async {
      await PendingScanService.add(
        PendingScan(
          id: '1',
          sampleCode: 'NKL-2026-00001',
          stageId: 'stage-2',
          stageName: 'Drying',
          notes: 'Wet on arrival',
          queuedAt: DateTime(2026, 9, 8, 10, 30),
        ),
      );

      final scan = (await PendingScanService.getAll()).single;
      expect(scan.sampleCode, 'NKL-2026-00001');
      expect(scan.stageId, 'stage-2');
      expect(scan.stageName, 'Drying');
      expect(scan.notes, 'Wet on arrival');
      expect(scan.queuedAt, DateTime(2026, 9, 8, 10, 30));
      expect(scan.hasFailed, isFalse);
    });

    test('removes a scan once it has been sent', () async {
      await PendingScanService.add(makeScan('1'));
      await PendingScanService.add(makeScan('2'));

      await PendingScanService.remove('1');

      final queue = await PendingScanService.getAll();
      expect(queue.map((scan) => scan.id).toList(), ['2']);
    });

    test('marks a refused scan instead of dropping it', () async {
      await PendingScanService.add(makeScan('1'));

      await PendingScanService.markFailed('1', 'This sample must complete Drying first.');

      final scan = (await PendingScanService.getAll()).single;
      expect(scan.hasFailed, isTrue);
      expect(scan.failureReason, 'This sample must complete Drying first.');
      // The scan itself is untouched, so a retry sends exactly what was captured.
      expect(scan.sampleCode, 'NKL-2026-00001');
      expect(scan.stageId, 'stage-1');
    });

    test('clears the failure when the operator retries', () async {
      await PendingScanService.add(makeScan('1'));
      await PendingScanService.markFailed('1', 'Rejected');

      await PendingScanService.markForRetry('1');

      expect((await PendingScanService.getAll()).single.hasFailed, isFalse);
    });

    test('ignores ids that are not queued', () async {
      await PendingScanService.add(makeScan('1'));

      await PendingScanService.remove('nope');
      await PendingScanService.markFailed('nope', 'Rejected');

      expect((await PendingScanService.getAll()).length, 1);
    });
  });

  group('SettingsService', () {
    test('falls back to the built-in server address', () async {
      expect(await SettingsService.getServerUrl(), SettingsService.defaultServerUrl);
    });

    test('remembers a custom server address', () async {
      await SettingsService.setServerUrl('http://192.168.1.50:3001/api');
      expect(await SettingsService.getServerUrl(), 'http://192.168.1.50:3001/api');
    });

    test('trims whitespace and treats an empty value as a reset', () async {
      await SettingsService.setServerUrl('  http://10.0.0.1:3001/api  ');
      expect(await SettingsService.getServerUrl(), 'http://10.0.0.1:3001/api');

      await SettingsService.setServerUrl('   ');
      expect(await SettingsService.getServerUrl(), SettingsService.defaultServerUrl);
    });

    test('only accepts languages the app actually ships', () async {
      await SettingsService.setLocale('id');
      expect(await SettingsService.getLocale(), 'id');

      await SettingsService.setLocale(null);
      expect(await SettingsService.getLocale(), isNull);
    });
  });

  group('PendingScanService resilience', () {
    test('keeps the readable scans when one stored entry is corrupt', () async {
      // The queue is work still owed to the server. One unparseable record used
      // to take the entire queue with it, so nothing could ever be delivered.
      //
      // These two still carry a batchName, from before batches were removed.
      // That is deliberate: a scan queued on a phone by the old build must
      // still reach the server after the update, and an unknown key has to be
      // ignored rather than take the record down with it.
      SharedPreferences.setMockInitialValues({
        'atara_pending_scans': <String>[
          '{"id":"1","sampleCode":"NKL-2026-00001","stageId":"stage-1",'
              '"stageName":"Preparation","batchName":"Block A","queuedAt":'
              '"2026-09-08T10:00:00.000"}',
          'this is not json',
          '{"id":"3","sampleCode":"NKL-2026-00003","stageId":"stage-1",'
              '"stageName":"Preparation","batchName":"Block A","queuedAt":'
              '"2026-09-08T12:00:00.000"}',
        ],
      });

      final scans = await PendingScanService.getAll();
      expect(scans.map((scan) => scan.id), ['1', '3']);
    });

    test('survives an entry that is valid json but the wrong shape', () async {
      SharedPreferences.setMockInitialValues({
        'atara_pending_scans': <String>['{"unexpected":true}'],
      });
      expect(await PendingScanService.getAll(), isEmpty);
    });
  });

  group('SettingsService.isValidServerUrl', () {
    test('accepts the addresses an operator would actually type', () {
      expect(SettingsService.isValidServerUrl('http://10.10.50.14:3001/api'), isTrue);
      expect(SettingsService.isValidServerUrl('https://lab.example.com/api'), isTrue);
      // Empty means "use the default", which is a valid choice.
      expect(SettingsService.isValidServerUrl('   '), isTrue);
    });

    test('rejects what would only fail later as a network error', () {
      expect(SettingsService.isValidServerUrl('hello'), isFalse);
      expect(SettingsService.isValidServerUrl('10.10.50.14:3001'), isFalse);
      expect(SettingsService.isValidServerUrl('ftp://10.10.50.14/api'), isFalse);
      expect(SettingsService.isValidServerUrl('http://'), isFalse);
    });
  });

  group('ApiException', () {
    test('separates "never reached the server" from "the server refused"', () {
      const offline = ApiException('no network', kind: ApiErrorKind.unreachable);
      expect(offline.isOffline, isTrue);
      expect(offline.isUnauthorized, isFalse);

      const refused = ApiException('wrong stage', statusCode: 409, kind: ApiErrorKind.server);
      expect(refused.isOffline, isFalse);
    });

    test('recognises an expired session, which must not count as a refusal', () {
      const expired = ApiException('signed out', statusCode: 401, kind: ApiErrorKind.server);
      expect(expired.isUnauthorized, isTrue);
    });
  });
}
