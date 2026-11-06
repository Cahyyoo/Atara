import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:atara/services/update_service.dart';

/// Answers every request with [body] and counts them.
class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.body);

  final List<int> body;
  int requests = 0;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests++;
    return ResponseBody.fromBytes(body, 200);
  }

  @override
  void close({bool force = false}) {}
}

Map<String, Object?> manifest({int versionCode = 105, String? sha}) => {
  'versionName': '1.1.0',
  'versionCode': versionCode,
  'url': 'https://github.com/Cahyyoo/Atara/releases/download/x/atara-lab.apk',
  'sha256': sha ?? 'abc',
  'size': 3,
  'notes': 'Perbaikan',
};

void main() {
  group('AppUpdate.fromJson', () {
    test('reads a complete manifest', () {
      final update = AppUpdate.fromJson(manifest());
      expect(update?.versionName, '1.1.0');
      expect(update?.versionCode, 105);
      expect(update?.notes, 'Perbaikan');
    });

    test('notes are optional', () {
      final update = AppUpdate.fromJson(manifest()..remove('notes'));
      expect(update?.notes, '');
    });

    test('anything malformed is no update at all', () {
      expect(AppUpdate.fromJson(null), isNull);
      expect(AppUpdate.fromJson('not a map'), isNull);
      expect(AppUpdate.fromJson(manifest()..remove('sha256')), isNull);
      expect(AppUpdate.fromJson(manifest()..['versionCode'] = '105'), isNull);
    });

    test('a download that is not https is refused', () {
      // The app allows cleartext for the lab server, so nothing else stops it.
      expect(
        AppUpdate.fromJson(manifest()..['url'] = 'http://example.com/a.apk'),
        isNull,
      );
    });
  });

  group('isNewer', () {
    test('compares by build number', () {
      expect(isNewer(105, '104'), isTrue);
      expect(isNewer(105, '105'), isFalse);
      expect(isNewer(105, '106'), isFalse);
    });

    test('compares as numbers, not as text', () {
      expect(isNewer(100, '99'), isTrue);
    });

    test('an unreadable build number offers nothing', () {
      expect(isNewer(105, ''), isFalse);
    });
  });

  group('check', () {
    UpdateService service(
      _FakeAdapter adapter, {
      bool enabled = true,
      String installed = '104',
    }) => UpdateService(
      dio: Dio()..httpClientAdapter = adapter,
      enabled: enabled,
      installedBuildNumber: () async => installed,
    );

    test('finds a newer release', () async {
      final adapter = _FakeAdapter(utf8.encode(jsonEncode(manifest())));
      final update = await service(adapter).check();
      expect(update?.versionCode, 105);
    });

    test('says nothing when this build is current', () async {
      final adapter = _FakeAdapter(utf8.encode(jsonEncode(manifest())));
      expect(await service(adapter, installed: '105').check(), isNull);
    });

    test('a disabled build never touches the network', () async {
      // Debug and profile builds, and every platform but Android.
      final adapter = _FakeAdapter(utf8.encode(jsonEncode(manifest())));
      expect(await service(adapter, enabled: false).check(), isNull);
      expect(adapter.requests, 0);
    });

    test('a broken answer is nothing to offer, not an error', () async {
      final adapter = _FakeAdapter(utf8.encode('<html>not json</html>'));
      expect(await service(adapter).check(), isNull);
    });
  });

  group('download', () {
    late Directory cache;

    setUp(() => cache = Directory.systemTemp.createTempSync('atara_update'));
    tearDown(() => cache.deleteSync(recursive: true));

    UpdateService service(List<int> body) => UpdateService(
      dio: Dio()..httpClientAdapter = _FakeAdapter(body),
      enabled: true,
      cacheDirectory: () async => cache,
    );

    test('keeps a file whose checksum matches', () async {
      const body = [1, 2, 3];
      final update = AppUpdate.fromJson(
        manifest(sha: sha256.convert(body).toString()),
      )!;
      final path = await service(body).download(update, onProgress: (_) {});
      expect(File(path).readAsBytesSync(), body);
      // The one folder res/xml/update_paths.xml lets the installer read from.
      expect(path, '${cache.path}/updates/atara-lab.apk');
    });

    test('deletes a file whose checksum does not match', () async {
      final update = AppUpdate.fromJson(
        manifest(sha: sha256.convert([9, 9, 9]).toString()),
      )!;
      await expectLater(
        service([1, 2, 3]).download(update, onProgress: (_) {}),
        throwsA(isA<UpdateCorruptedException>()),
      );
      expect(File('${cache.path}/updates/atara-lab.apk').existsSync(), isFalse);
    });
  });
}
