import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/models/pending_scan.dart';
import 'package:atara/models/stage_model.dart';
import 'package:atara/models/user_model.dart';
import 'package:atara/providers/my_work_provider.dart';
import 'package:atara/providers/stages_provider.dart';
import 'package:atara/screens/update_status_screen.dart';
import 'package:atara/services/api_exception.dart';
import 'package:atara/services/api_service.dart';
import 'package:atara/services/pending_scan_service.dart';
import 'package:atara/services/scan_sync_service.dart';
import 'package:atara/services/session_service.dart';

/// Heavy use, from the phone's side: long offline shifts, a server slow enough
/// to time out, thumbs faster than a frame, and answers arriving out of order.
///
/// Each test states the behaviour the operator is owed. Where the app falls
/// short, the test fails and names the finding (H6-H9 in load-tests/REPORT.md).

/// Answers each request with whatever [answer] decides: a reply, a thrown
/// DioException, or a future the test completes by hand.
class _Server implements HttpClientAdapter {
  _Server(this.answer);

  final Future<ResponseBody> Function(RequestOptions options) answer;
  final List<RequestOptions> requests = [];

  int countTo(String path) => requests.where((r) => r.path.endsWith(path)).length;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) {
    requests.add(options);
    return answer(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(int status, Object body) => ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

const _operator = UserModel(
  id: 'op-1',
  name: 'Operator Satu',
  email: 'op@atara.local',
  role: UserRole.operator,
);

const _stages = [
  StageModel(id: 'st-1', key: 'RECEIVED', name: 'DITERIMA', sequenceOrder: 1),
  StageModel(id: 'st-2', key: 'WET_PREP', name: 'PREP BASAH', sequenceOrder: 2),
  StageModel(id: 'st-3', key: 'DRY_PREP', name: 'PREP KERING', sequenceOrder: 3),
];

Map<String, dynamic> _sampleJson(String code, {String? stageId}) {
  final stage = _stages.where((s) => s.id == stageId).firstOrNull;
  return {
    'id': 'id-$code',
    'sampleCode': code,
    'status': stage == null ? 'PENDING' : 'IN_PROGRESS',
    'currentStage': stage == null
        ? null
        : {'id': stage.id, 'key': stage.key, 'name': stage.name, 'sequenceOrder': stage.sequenceOrder},
    'createdBy': {'id': 'u', 'name': 'Admin'},
    'updatedAt': '2026-10-09T01:00:00.000Z',
    'logs': <Object>[],
  };
}

PendingScan _queued(int i, {String? stageId}) => PendingScan(
      id: 'q-$i',
      sampleCode: 'SMPL-2026-${i.toString().padLeft(5, '0')}',
      stageId: stageId ?? 'st-1',
      stageName: 'DITERIMA',
      queuedAt: DateTime(2026, 10, 9, 8).add(Duration(seconds: i)),
      operatorId: _operator.id,
    );

late HttpClientAdapter _realAdapter;

void main() {
  setUpAll(() => _realAdapter = ApiService.instance.httpClientAdapter);
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    ApiService.clientDeviceReader = () async => null;
    await SessionService.saveSession('token-1', _operator);
  });
  tearDown(() {
    ApiService.instance.httpClientAdapter = _realAdapter;
    ApiService.clientDeviceReader = null;
    ApiService.instance.onUnauthorized = null;
  });

  group('M1 offline queue under a long shift', () {
    test('a long offline shift: one more queued scan stays cheap as the queue grows', () async {
      // Cost of a single add at each queue size. A queue that is cheap to grow
      // costs about the same at 2,000 as at 250.
      final perAdd = <int, double>{};
      var size = 0;
      for (final target in [250, 500, 1000, 2000]) {
        while (size < target - 20) {
          await PendingScanService.add(_queued(size++));
        }
        final watch = Stopwatch()..start();
        for (var i = 0; i < 20; i++) {
          await PendingScanService.add(_queued(size++));
        }
        perAdd[target] = watch.elapsedMicroseconds / 20 / 1000;
      }
      final all = await PendingScanService.getFor(_operator.id);
      // ignore: avoid_print
      print('M1: ms per add by queue size $perAdd');
      expect(all, hasLength(2000));
      expect(perAdd[2000]! / perAdd[250]!, lessThan(3), reason: 'each add rewrites the whole queue: $perAdd');
    }, timeout: const Timeout(Duration(minutes: 20)));

    test('H7: a scan queued while the drain is removing another is not lost', () async {
      for (var i = 0; i < 10; i++) {
        await PendingScanService.add(_queued(i));
      }
      // The drain removes what it sent while the operator queues a new scan.
      await Future.wait([
        PendingScanService.remove('q-0'),
        PendingScanService.add(_queued(100)),
        PendingScanService.markFailed('q-1', 'refused'),
        PendingScanService.add(_queued(101)),
      ]);
      final ids = (await PendingScanService.getAll()).map((s) => s.id).toSet();

      expect(ids.contains('q-100'), isTrue, reason: 'newly queued scan was overwritten');
      expect(ids.contains('q-101'), isTrue, reason: 'newly queued scan was overwritten');
      expect(ids.contains('q-0'), isFalse, reason: 'a sent scan came back');
      expect(ids, hasLength(11));
    });
  });

  group('M2 draining a big queue against a busy server', () {
    test('1,000 queued scans: each sent once, refusals kept, a race stops the drain', () async {
      // Seeded straight into storage: queueing 1,000 one by one is itself the
      // quadratic cost M1 measures.
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(
        'atara_pending_scans',
        [for (var i = 0; i < 1000; i++) jsonEncode(_queued(i).toJson())],
      );
      final server = _Server((options) async {
        final code = (options.data as Map)['sample_code'] as String;
        final n = int.parse(code.split('-').last);
        if (n == 700) {
          return _json(409, {'success': false, 'error': 'moved', 'code': 'STAGE_MOVED'});
        }
        if (n % 50 == 0) {
          return _json(409, {'success': false, 'error': 'Stage DITERIMA has already been recorded for this sample.'});
        }
        return _json(200, {'success': true, 'data': _sampleJson(code, stageId: 'st-1')});
      });
      ApiService.instance.httpClientAdapter = server;

      final watch = Stopwatch()..start();
      final outcome = await ScanSyncService.drain();
      // ignore: avoid_print
      print('M2: drained ${outcome.synced} + ${outcome.rejected} rejected in ${watch.elapsedMilliseconds}ms');

      final codes = server.requests.map((r) => (r.data as Map)['sample_code']).toList();
      expect(codes.toSet(), hasLength(codes.length), reason: 'a scan was posted twice');
      expect(outcome.synced + outcome.rejected, 700);
      final left = await PendingScanService.getAll();
      expect(left.where((s) => !s.hasFailed), hasLength(300), reason: 'from the raced scan on, all kept in order');
    }, timeout: const Timeout(Duration(minutes: 10)));
  });

  group('M3 a server slow enough to time out', () {
    test('H6: a scan the server saved before the timeout is not reported as rejected', () async {
      var committed = false;
      final server = _Server((options) async {
        if (!committed) {
          // The server saves it, but the answer never makes it back in time.
          committed = true;
          throw DioException.receiveTimeout(
            timeout: const Duration(seconds: 10),
            requestOptions: options,
          );
        }
        return _json(409, {
          'success': false,
          'error': 'Stage DITERIMA has already been recorded for this sample.',
          'code': 'STAGE_ALREADY_RECORDED',
        });
      });
      ApiService.instance.httpClientAdapter = server;

      // What UpdateStatusScreen does with the timeout: it counts as offline,
      // so the scan is queued for later.
      ApiException? error;
      try {
        await ApiService.instance.scanUpdate(sampleCode: 'SMPL-2026-00001', stageId: 'st-1');
      } on ApiException catch (e) {
        error = e;
      }
      expect(error?.isOffline, isTrue);
      await PendingScanService.add(_queued(1));

      final outcome = await ScanSyncService.drain();
      final left = await PendingScanService.getAll();

      expect(outcome.rejected, 0, reason: 'the operator is told a saved scan was refused');
      expect(left.where((s) => s.hasFailed), isEmpty);
    });
  });

  group('M4 thumbs faster than a frame', () {
    testWidgets('H8: two taps on Save in one frame send one scan', (tester) async {
      final server = _Server((options) async {
        if (options.path.contains('/samples/scan/mine')) {
          return _json(200, {'success': true, 'data': {'shiftDate': '2026-10-09', 'total': 0}});
        }
        if (options.method == 'POST') {
          await Future<void>.delayed(const Duration(milliseconds: 300));
          return _json(200, {'success': true, 'data': _sampleJson('SMPL-2026-00001', stageId: 'st-1')});
        }
        return _json(200, {'success': true, 'data': _sampleJson('SMPL-2026-00001')});
      });
      ApiService.instance.httpClientAdapter = server;

      await tester.pumpWidget(
        ProviderScope(
          overrides: [stagesProvider.overrideWith((ref) async => _stages)],
          child: const MaterialApp(
            locale: Locale('id'),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: UpdateStatusScreen(sampleCode: 'SMPL-2026-00001'),
          ),
        ),
      );
      for (var i = 0; i < 20; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      await tester.tap(find.text('DITERIMA'));
      await tester.pump(const Duration(milliseconds: 100));
      final save = find.text('Simpan & Perbarui Tahap');
      await tester.scrollUntilVisible(save, 200, scrollable: find.byType(Scrollable).first);
      await tester.pump(const Duration(milliseconds: 100));
      // Tap Save twice, with no frame in between.
      await tester.tap(save, warnIfMissed: false);
      await tester.tap(save, warnIfMissed: false);
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }

      final posts = server.requests.where((r) => r.method == 'POST' && r.path.endsWith('/samples/scan')).length;
      expect(posts, 1, reason: 'double tap posted the scan $posts times');
    });
  });

  group('M6 answers arriving out of order', () {
    test('H8: an older My Work answer never replaces a newer one', () async {
      final slow = Completer<ResponseBody>();
      var call = 0;
      final server = _Server((options) {
        call++;
        if (call == 1) return slow.future; // the first refresh is the slow one
        return Future.value(_json(200, {'success': true, 'data': {'shiftDate': '2026-10-09', 'total': 2}}));
      });
      ApiService.instance.httpClientAdapter = server;

      final container = ProviderContainer();
      addTearDown(container.dispose);
      final notifier = container.read(myWorkProvider.notifier); // refresh #1 starts
      await Future<void>.delayed(Duration.zero);
      await notifier.refresh(); // refresh #2 after a second scan: total 2
      expect(container.read(myWorkProvider)?.total, 2);

      slow.complete(_json(200, {'success': true, 'data': {'shiftDate': '2026-10-09', 'total': 1}}));
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(container.read(myWorkProvider)?.total, 2, reason: 'stale tally overwrote the newer one');
    });
  });

  group('M9 a sign-in racing an old request', () {
    test('H9: a 401 for the old token does not sign out the new session', () async {
      final pending = Completer<ResponseBody>();
      final server = _Server((options) {
        if (options.path.endsWith('/stages')) return pending.future;
        return Future.value(_json(200, {'success': true, 'data': <Object>[]}));
      });
      ApiService.instance.httpClientAdapter = server;
      var signedOut = false;
      ApiService.instance.onUnauthorized = (_) => signedOut = true;

      // A request leaves with the old token...
      final inFlight = ApiService.instance.getStages().catchError((_) => <StageModel>[]);
      // The interceptor reads the token asynchronously; wait until the request
      // has actually gone out with the old one.
      while (server.requests.isEmpty) {
        await Future<void>.delayed(const Duration(milliseconds: 1));
      }
      // ...the operator signs in again meanwhile...
      await SessionService.saveSession('token-2', _operator);
      // ...and the old request comes back 401.
      pending.complete(_json(401, {'success': false, 'error': 'Session expired.', 'code': 'session-replaced'}));
      await inFlight;

      expect(await SessionService.getToken(), 'token-2', reason: 'the fresh session was wiped');
      expect(signedOut, isFalse);
    });
  });
}
