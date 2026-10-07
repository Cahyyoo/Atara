import 'package:flutter_test/flutter_test.dart';

import 'package:atara/models/login_result.dart';
import 'package:atara/services/client_device.dart';

/// Both halves of "what was that other device": the description this phone
/// sends about itself, and the one it reads back about whoever replaced it.
/// Pure functions on either side, so no transport is needed.
void main() {
  group('reading details.deviceInfo off a session-replaced', () {
    test('a full description', () {
      final replaced = SessionReplaced.fromDetails({
        'at': '2026-09-30T05:26:00Z',
        'device': 'Aplikasi · Android',
        'deviceInfo': {
          'kind': 'phone',
          'os': 'Android',
          'osVersion': '14',
          'browser': null,
          'browserVersion': null,
          'model': 'Samsung SM-A515F',
          'app': true,
        },
      });

      final info = replaced.deviceInfo!;
      expect(info.kind, DeviceKind.phone);
      expect(info.os, 'Android');
      expect(info.osVersion, '14');
      expect(info.browser, isNull);
      expect(info.browserVersion, isNull);
      expect(info.model, 'Samsung SM-A515F');
      expect(info.app, isTrue);
      expect(replaced.device, 'Aplikasi · Android');
      expect(replaced.at, DateTime.utc(2026, 9, 30, 5, 26));
    });

    test('a partial one keeps what it has', () {
      final info = DeviceInfo.tryParse({'kind': 'tablet', 'os': 'iOS'})!;
      expect(info.kind, DeviceKind.tablet);
      expect(info.os, 'iOS');
      expect(info.osVersion, isNull);
      expect(info.model, isNull);
      expect(info.app, isFalse);
    });

    test('missing, null or not an object is no description', () {
      expect(SessionReplaced.fromDetails({'device': 'x'}).deviceInfo, isNull);
      expect(DeviceInfo.tryParse(null), isNull);
      expect(DeviceInfo.tryParse('desktop'), isNull);
      expect(DeviceInfo.tryParse(const <String, Object?>{}), isNull);
    });

    test('an unknown kind is no kind, and wrong types are dropped', () {
      final info = DeviceInfo.tryParse({
        'kind': 'watch',
        'os': 42,
        'osVersion': '  ',
        'browser': 'Firefox',
        'browserVersion': 130,
        'app': 'yes',
      })!;
      expect(info.kind, isNull);
      expect(info.os, isNull);
      expect(info.osVersion, isNull);
      expect(info.browser, 'Firefox');
      expect(info.browserVersion, isNull);
      expect(info.app, isFalse, reason: 'only a real true is the app');
    });

    test('nothing usable at all falls back to the plain label', () {
      final replaced = SessionReplaced.fromDetails({
        'device': 'Chrome · Windows',
        'deviceInfo': {'kind': 'watch', 'app': false},
      });
      expect(replaced.deviceInfo, isNull);
      expect(replaced.device, 'Chrome · Windows');
    });
  });

  group('describing this phone', () {
    test('Android: capitalised maker, then model', () {
      final device = ClientDevice.android(
        manufacturer: 'samsung',
        model: 'SM-A515F',
        release: '14',
      );
      expect(device.model, 'Samsung SM-A515F');
      expect(device.osVersion, '14');
      expect(device.headers, {
        'X-Atara-Device-Model': 'Samsung SM-A515F',
        'X-Atara-OS-Version': '14',
      });
    });

    test('Android: a model that already names its maker says it once', () {
      expect(
        ClientDevice.android(
          manufacturer: 'Xiaomi',
          model: 'xiaomi 13T',
          release: '14',
        ).model,
        'Xiaomi 13T',
      );
      expect(
        ClientDevice.android(
          manufacturer: 'Google',
          model: 'Pixel 8',
          release: '15',
        ).model,
        'Google Pixel 8',
      );
    });

    test('iOS: the marketing name, else the hardware identifier', () {
      final named = ClientDevice.ios(
        modelName: 'iPhone 14 Pro',
        machine: 'iPhone15,2',
        systemVersion: '17.5',
      );
      expect(named.model, 'iPhone 14 Pro');
      expect(named.osVersion, '17.5');

      final unnamed = ClientDevice.ios(
        modelName: '',
        machine: 'iPhone15,2',
        systemVersion: '17.5',
      );
      expect(unnamed.model, 'iPhone15,2');
    });

    test('long or odd values are trimmed to something a header can carry', () {
      final device = ClientDevice.android(
        manufacturer: 'acme',
        model: 'X' * 100,
        release: '14\n',
      );
      expect(device.model!.length, ClientDevice.maxLength);
      expect(device.model, startsWith('Acme XXX'));
      expect(device.osVersion, '14');
    });

    test('nothing known sends no headers', () {
      final device = ClientDevice.android(
        manufacturer: '',
        model: ' ',
        release: '',
      );
      expect(device.headers, isEmpty);
    });
  });
}
