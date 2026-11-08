import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';

import 'settings_service.dart';

/// What a server says about where the phones should be.
class ServerConfig {
  const ServerConfig({required this.serverUrl, required this.serverId});

  /// Empty means "the app's built-in address".
  final String serverUrl;

  /// The installation answering: the same id at two addresses is the same lab.
  final String serverId;

  /// Null for anything malformed, which is simply no answer.
  static ServerConfig? fromJson(Object? json) {
    if (json is! Map || json['success'] != true) return null;
    final data = json['data'];
    if (data is! Map) return null;
    final serverUrl = data['serverUrl'];
    final serverId = data['serverId'];
    if (serverUrl is! String || serverId is! String || serverId.isEmpty) {
      return null;
    }
    if (serverUrl.isNotEmpty &&
        !serverUrl.startsWith('http://') &&
        !serverUrl.startsWith('https://')) {
      return null;
    }
    return ServerConfig(serverUrl: serverUrl, serverId: serverId);
  }
}

/// Follows the server address the lab admin sets on the website.
///
/// A phone moves only to an address it has reached itself and that answers as
/// the same installation, so neither a typo nor a server that is not up yet can
/// strand it. If the address it holds stops answering, it tries its built-in
/// one: that is the way back after a release changes it.
///
/// Its own [Dio], not ApiService's, so no token or device header goes with it.
class ServerConfigSync {
  ServerConfigSync({
    Dio? dio,
    bool? enabled,
    Future<String> Function()? currentUrl,
    Future<void> Function(String url)? storeUrl,
    String? builtInUrl,
  }) : _dio =
           dio ??
           Dio(
             BaseOptions(
               connectTimeout: const Duration(seconds: 5),
               receiveTimeout: const Duration(seconds: 5),
             ),
           ),
       // Off under `flutter test`, where every widget test that builds the app
       // would otherwise leave a request and its timers running.
       _enabled = enabled ?? !Platform.environment.containsKey('FLUTTER_TEST'),
       _currentUrl = currentUrl ?? SettingsService.getServerUrl,
       _storeUrl = storeUrl ?? SettingsService.setServerUrl,
       _builtInUrl = builtInUrl ?? SettingsService.defaultServerUrl;

  final Dio _dio;
  final bool _enabled;
  final Future<String> Function() _currentUrl;
  final Future<void> Function(String url) _storeUrl;
  final String _builtInUrl;

  bool _running = false;

  /// Asks, and moves if it should. Never throws: every failure keeps the
  /// address as it is, and the next launch, resume or reconnect asks again.
  Future<void> run() async {
    if (!_enabled || _running) return;
    _running = true;
    try {
      await _run();
    } catch (_) {
      // Nothing to report to; the address is unchanged.
    } finally {
      _running = false;
    }
  }

  Future<void> _run() async {
    final current = await _currentUrl();
    var base = current;
    var config = await _fetch(current);
    if (config == null) {
      if (_builtInUrl == current) return;
      config = await _fetch(_builtInUrl);
      if (config == null) return;
      base = _builtInUrl;
    }

    final wanted = config.serverUrl.isEmpty ? _builtInUrl : config.serverUrl;
    var next = base;
    if (wanted != base) {
      final confirmed = await _fetch(wanted);
      if (confirmed?.serverId == config.serverId) next = wanted;
    }
    if (next != current) await _store(next);
  }

  Future<ServerConfig?> _fetch(String baseUrl) async {
    try {
      final response = await _dio.get<String>(
        '$baseUrl/mobile-config',
        options: Options(responseType: ResponseType.plain),
      );
      return ServerConfig.fromJson(jsonDecode(response.data ?? ''));
    } catch (_) {
      return null;
    }
  }

  /// The built-in address is stored as empty, so a later release's new
  /// default reaches a phone that was simply following it.
  Future<void> _store(String url) => _storeUrl(url == _builtInUrl ? '' : url);
}
