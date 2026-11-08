import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:atara/services/server_config_sync.dart';

const builtIn = 'http://10.10.50.14:3000/api';
const fresh = 'http://10.10.50.20:3000/api';
const stranger = 'http://10.10.99.9:3000/api';

/// A lab of servers by base address. A missing one does not answer at all.
class FakeLab implements HttpClientAdapter {
  FakeLab(this.servers);

  final Map<String, Object> servers;
  final List<String> asked = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final url = options.uri.toString();
    asked.add(url);
    final base = url.replaceFirst(RegExp(r'/mobile-config$'), '');
    final answer = servers[base];
    if (answer == null) {
      throw DioException.connectionError(
        requestOptions: options,
        reason: 'unreachable',
      );
    }
    final body = answer is String ? answer : jsonEncode(answer);
    return ResponseBody.fromString(body, 200);
  }

  @override
  void close({bool force = false}) {}
}

Map<String, Object> config(String serverUrl, {String id = 'lab-1'}) => {
  'success': true,
  'data': {'serverUrl': serverUrl, 'serverId': id},
};

/// Runs one sync from [current] against [lab], and returns what was stored:
/// null when nothing was, '' for "the built-in address".
Future<String?> sync(String current, FakeLab lab) async {
  String? stored;
  await ServerConfigSync(
    dio: Dio()..httpClientAdapter = lab,
    enabled: true,
    currentUrl: () async => current,
    storeUrl: (url) async => stored = url,
    builtInUrl: builtIn,
  ).run();
  return stored;
}

void main() {
  group('ServerConfig.fromJson', () {
    test('reads an answer', () {
      final answer = ServerConfig.fromJson(config(fresh));
      expect(answer?.serverUrl, fresh);
      expect(answer?.serverId, 'lab-1');
    });

    test('anything malformed is no answer', () {
      expect(ServerConfig.fromJson(null), isNull);
      expect(ServerConfig.fromJson({'success': false}), isNull);
      expect(
        ServerConfig.fromJson({
          'success': true,
          'data': {'serverUrl': fresh},
        }),
        isNull,
      );
      expect(
        ServerConfig.fromJson({
          'success': true,
          'data': {'serverUrl': 'ftp://x', 'serverId': 'a'},
        }),
        isNull,
      );
    });
  });

  test('stays put when the admin has set nothing', () async {
    final lab = FakeLab({builtIn: config('')});
    expect(await sync(builtIn, lab), isNull);
  });

  test('moves to the address the admin set, once it answers as the same lab', () async {
    final lab = FakeLab({builtIn: config(fresh), fresh: config(fresh)});
    expect(await sync(builtIn, lab), fresh);
  });

  test('does not move to an address that does not answer', () async {
    // The new server is not up yet: the phone keeps the one that works.
    final lab = FakeLab({builtIn: config(fresh)});
    expect(await sync(builtIn, lab), isNull);
  });

  test('does not move to an address that answers as another lab', () async {
    final lab = FakeLab({
      builtIn: config(stranger),
      stranger: config('', id: 'lab-2'),
    });
    expect(await sync(builtIn, lab), isNull);
  });

  test('a server that is not the Atara API is no answer', () async {
    final lab = FakeLab({builtIn: config(fresh), fresh: '<html>router</html>'});
    expect(await sync(builtIn, lab), isNull);
  });

  test('clearing the address on the website returns phones to the built-in one', () async {
    final lab = FakeLab({fresh: config(''), builtIn: config('')});
    // Stored as empty, so a later release's new default applies.
    expect(await sync(fresh, lab), '');
  });

  test('falls back to the built-in address when the stored one is gone', () async {
    final lab = FakeLab({builtIn: config('')});
    expect(await sync(stranger, lab), '');
  });

  test('from the built-in address, follows on to where the admin points', () async {
    final lab = FakeLab({builtIn: config(fresh), fresh: config(fresh)});
    expect(await sync(stranger, lab), fresh);
  });

  test('nowhere answering changes nothing', () async {
    final lab = FakeLab({});
    expect(await sync(fresh, lab), isNull);
  });

  test('sends no session token: it has its own client', () async {
    final lab = FakeLab({builtIn: config('')});
    await sync(builtIn, lab);
    expect(lab.asked, ['$builtIn/mobile-config']);
  });

  test('a disabled sync asks nothing', () async {
    final lab = FakeLab({builtIn: config(fresh), fresh: config(fresh)});
    String? stored;
    await ServerConfigSync(
      dio: Dio()..httpClientAdapter = lab,
      enabled: false,
      currentUrl: () async => builtIn,
      storeUrl: (url) async => stored = url,
      builtInUrl: builtIn,
    ).run();
    expect(lab.asked, isEmpty);
    expect(stored, isNull);
  });
}

