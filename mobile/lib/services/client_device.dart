import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;

/// What this phone says about itself beyond "android" or "ios".
///
/// Sent on every request as `X-Atara-Device-Model` and `X-Atara-OS-Version`,
/// so that when this phone takes an account over, the device that loses it can
/// be told "Samsung SM-A515F, Android 14" instead of merely "a phone". The
/// server reads nothing else from it; it is a label, not an identity.
class ClientDevice {
  const ClientDevice({this.model, this.osVersion});

  /// "Samsung SM-A515F", "iPhone 15 Pro". Null when the platform gave nothing.
  final String? model;

  /// "14", "17.5".
  final String? osVersion;

  /// Longest value either header may carry. The server stores these next to
  /// the session and shows them in a sentence; a runaway build string must not
  /// become a paragraph.
  static const maxLength = 60;

  /// From `android.os.Build`: the manufacturer, capitalised, then the model —
  /// unless the model already names the manufacturer, as Xiaomi's and Google's
  /// sometimes do, where saying it twice would read as a typo.
  factory ClientDevice.android({
    required String manufacturer,
    required String model,
    required String release,
  }) {
    final maker = _clean(manufacturer);
    final name = _clean(model);
    final String? label;
    if (name == null) {
      label = maker == null ? null : _capitalise(maker);
    } else if (maker == null ||
        name.toLowerCase().startsWith(maker.toLowerCase())) {
      label = _capitalise(name);
    } else {
      label = '${_capitalise(maker)} $name';
    }
    return ClientDevice(model: _fit(label), osVersion: _fit(_clean(release)));
  }

  /// From `UIDevice`: the marketing name ("iPhone 15 Pro") where the plugin
  /// knows it, the hardware identifier ("iPhone15,2") where it does not.
  factory ClientDevice.ios({
    required String modelName,
    required String machine,
    required String systemVersion,
  }) {
    return ClientDevice(
      model: _fit(_clean(modelName) ?? _clean(machine)),
      osVersion: _fit(_clean(systemVersion)),
    );
  }

  /// The headers this device adds to a request. Empty when it knows nothing.
  Map<String, String> get headers => {
    'X-Atara-Device-Model': ?model,
    'X-Atara-OS-Version': ?osVersion,
  };

  /// Asks the platform. Null anywhere but a phone.
  ///
  /// `defaultTargetPlatform` rather than `dart:io`'s `Platform`, as with
  /// `ApiService.deviceHeader`: identical on a device, and a test can pin it.
  /// May throw — the caller owns catching, because the caller owns deciding
  /// that a failure here costs a header and never a request.
  static Future<ClientDevice?> read() async {
    if (kIsWeb) return null;
    final plugin = DeviceInfoPlugin();
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        final info = await plugin.androidInfo;
        return ClientDevice.android(
          manufacturer: info.manufacturer,
          model: info.model,
          release: info.version.release,
        );
      case TargetPlatform.iOS:
        final info = await plugin.iosInfo;
        return ClientDevice.ios(
          modelName: info.modelName,
          machine: info.utsname.machine,
          systemVersion: info.systemVersion,
        );
      default:
        return null;
    }
  }
}

/// Printable ASCII only, whitespace collapsed. A header value with a control
/// character in it is refused by `dart:io` outright, and one byte of a vendor's
/// odd build string must not be what stops a sign-in.
String? _clean(String value) {
  final printable = value
      .replaceAll(RegExp(r'[^\x20-\x7E]'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  return printable.isEmpty ? null : printable;
}

String? _fit(String? value) {
  if (value == null || value.length <= ClientDevice.maxLength) return value;
  return value.substring(0, ClientDevice.maxLength).trimRight();
}

String _capitalise(String value) =>
    value.isEmpty ? value : value[0].toUpperCase() + value.substring(1);
