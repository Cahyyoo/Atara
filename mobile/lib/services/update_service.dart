import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';

/// Published with every release by .github/workflows/mobile-release.yml.
///
/// The asset address rather than GitHub's REST API, which allows sixty requests
/// an hour per IP address: a whole lab behind one router would run out.
const String updateManifestUrl =
    'https://github.com/Cahyyoo/Atara/releases/latest/download/atara-update.json';

/// A release, as its manifest describes it.
class AppUpdate {
  const AppUpdate({
    required this.versionName,
    required this.versionCode,
    required this.url,
    required this.sha256,
    required this.size,
    this.notes = '',
  });

  final String versionName;
  final int versionCode;
  final String url;
  final String sha256;
  final int size;
  final String notes;

  /// Null for anything malformed: a bad manifest means no update is offered.
  static AppUpdate? fromJson(Object? json) {
    if (json is! Map) return null;
    final versionName = json['versionName'];
    final versionCode = json['versionCode'];
    final url = json['url'];
    final sha256 = json['sha256'];
    final size = json['size'];
    final notes = json['notes'];
    if (versionName is! String ||
        versionCode is! int ||
        url is! String ||
        !url.startsWith('https://') ||
        sha256 is! String ||
        size is! int) {
      return null;
    }
    return AppUpdate(
      versionName: versionName,
      versionCode: versionCode,
      url: url,
      sha256: sha256,
      size: size,
      notes: notes is String ? notes : '',
    );
  }
}

/// Whether a release is newer than the build installed. A build number that
/// cannot be read offers nothing: an update prompt nobody can be sure of is
/// worse than a late one.
bool isNewer(int versionCode, String installedBuildNumber) {
  final installed = int.tryParse(installedBuildNumber);
  return installed != null && versionCode > installed;
}

/// A download that arrived but is not the file the manifest described.
class UpdateCorruptedException implements Exception {
  const UpdateCorruptedException();
}

/// Checks for, downloads and hands over an update.
///
/// Its own [Dio], not ApiService's: that one attaches the session's bearer
/// token and the device headers to everything it sends, and none of that is
/// any business of GitHub's.
class UpdateService {
  UpdateService({
    Dio? dio,
    bool? enabled,
    Future<String> Function()? installedBuildNumber,
    Future<Directory> Function()? cacheDirectory,
    Future<void> Function(String path)? installer,
  }) : _dio =
           dio ??
           Dio(
             BaseOptions(
               connectTimeout: const Duration(seconds: 10),
               receiveTimeout: const Duration(seconds: 30),
             ),
           ),
       // Release builds on Android only. A debug or profile build is signed
       // with another key, so Android would refuse whatever it downloaded.
       _enabled = enabled ?? (Platform.isAndroid && kReleaseMode),
       _installedBuildNumber = installedBuildNumber ?? _readBuildNumber,
       _cacheDirectory = cacheDirectory ?? getTemporaryDirectory,
       _installer = installer ?? _openSystemInstaller;

  final Dio _dio;
  final bool _enabled;
  final Future<String> Function() _installedBuildNumber;
  final Future<Directory> Function() _cacheDirectory;
  final Future<void> Function(String path) _installer;

  static const MethodChannel _channel = MethodChannel(
    'com.atara.mobile/update',
  );

  static Future<String> _readBuildNumber() async =>
      (await PackageInfo.fromPlatform()).buildNumber;

  static Future<void> _openSystemInstaller(String path) =>
      _channel.invokeMethod<void>('install', {'path': path});

  /// The newer release, if there is one.
  ///
  /// Every failure is simply "nothing to offer": no internet, or GitHub being
  /// down, must never get in the way of work in the lab.
  Future<AppUpdate?> check() async {
    if (!_enabled) return null;
    try {
      final response = await _dio.get<String>(
        updateManifestUrl,
        options: Options(responseType: ResponseType.plain),
      );
      final update = AppUpdate.fromJson(jsonDecode(response.data ?? ''));
      if (update == null) return null;
      final installed = await _installedBuildNumber();
      return isNewer(update.versionCode, installed) ? update : null;
    } catch (_) {
      return null;
    }
  }

  /// Downloads [update] and returns its path once its checksum has matched.
  ///
  /// Throws [UpdateCorruptedException] on a mismatch, and whatever [Dio] throws
  /// for a failed or cancelled download.
  Future<String> download(
    AppUpdate update, {
    required void Function(int received) onProgress,
    CancelToken? cancelToken,
  }) async {
    // Must match res/xml/update_paths.xml, the only folder the installer can
    // be handed anything from.
    final folder = Directory('${(await _cacheDirectory()).path}/updates');
    await folder.create(recursive: true);
    final file = File('${folder.path}/atara-lab.apk');

    await _dio.download(
      update.url,
      file.path,
      cancelToken: cancelToken,
      onReceiveProgress: (received, _) => onProgress(received),
    );

    final digest = await sha256.bind(file.openRead()).first;
    if (digest.toString() != update.sha256.toLowerCase()) {
      await file.delete();
      throw const UpdateCorruptedException();
    }
    return file.path;
  }

  /// Opens Android's installer, which asks the person to confirm.
  Future<void> install(String path) => _installer(path);
}
