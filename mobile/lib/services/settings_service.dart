import 'dart:io';

import 'package:flutter/foundation.dart' show kIsWeb;

import 'package:shared_preferences/shared_preferences.dart';

/// Device-local settings: where the server lives and which language to use.
///
/// The server address used to be compiled in, so moving the app to another site
/// meant a rebuild. It is stored here instead, seeded with the previous value so
/// existing installs keep working untouched.
class SettingsService {
  static const _serverKey = 'atara_server_url';
  static const _localeKey = 'atara_locale';
  static const _onboardingKey = 'atara_onboarding_seen';
  static const _themeKey = 'atara_theme_mode';
  static const _dismissedAnnouncementsKey = 'atara_dismissed_announcements';

  /// The notices this reader has closed, so they stay closed.
  ///
  /// Only INFO can be closed; a warning is not the reader's to dismiss. Ids
  /// of announcements that have since ended are harmless here -- the server
  /// stops sending them, and the list is trimmed to what it still sees.
  static Future<Set<String>> getDismissedAnnouncements() async {
    final prefs = await SharedPreferences.getInstance();
    return (prefs.getStringList(_dismissedAnnouncementsKey) ?? const [])
        .toSet();
  }

  static Future<void> setDismissedAnnouncements(Set<String> ids) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_dismissedAnnouncementsKey, ids.toList());
  }

  static const supportedLocales = ['id', 'en'];

  static String get defaultServerUrl {
    // kIsWeb first: dart:io's Platform is unsupported in a browser and throws,
    // which a development run in Chrome would otherwise trip over before
    // making a single request.
    final host = !kIsWeb && Platform.isAndroid ? '10.10.50.14' : 'localhost';
    return 'http://$host:3000/api';
  }

  static Future<String> getServerUrl() async {
    final prefs = await SharedPreferences.getInstance();
    final stored = prefs.getString(_serverKey)?.trim();
    if (stored == null || stored.isEmpty) return defaultServerUrl;
    return stored;
  }

  /// Whether a typed address is usable before it is saved.
  ///
  /// Without this, a typo is stored happily and every later request fails with a
  /// generic "could not reach the server", which points at the network rather
  /// than at the setting that actually caused it.
  static bool isValidServerUrl(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) return true; // Empty means "use the default".

    final uri = Uri.tryParse(trimmed);
    if (uri == null) return false;
    if (uri.scheme != 'http' && uri.scheme != 'https') return false;
    if (uri.host.isEmpty) return false;
    return true;
  }

  static Future<void> setServerUrl(String value) async {
    final prefs = await SharedPreferences.getInstance();
    final trimmed = value.trim();
    if (trimmed.isEmpty) {
      await prefs.remove(_serverKey);
      return;
    }
    await prefs.setString(_serverKey, trimmed);
  }

  /// Null means "follow the device language".
  static Future<String?> getLocale() async {
    final prefs = await SharedPreferences.getInstance();
    final stored = prefs.getString(_localeKey);
    if (stored == null || !supportedLocales.contains(stored)) return null;
    return stored;
  }

  static Future<void> setLocale(String? value) async {
    final prefs = await SharedPreferences.getInstance();
    if (value == null) {
      await prefs.remove(_localeKey);
      return;
    }
    await prefs.setString(_localeKey, value);
  }

  /// Whether the guide has already run on this device.
  ///
  /// Absent means no: a fresh install is exactly when it should run.
  static Future<bool> getOnboardingSeen() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_onboardingKey) ?? false;
  }

  static Future<void> setOnboardingSeen(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_onboardingKey, value);
  }

  /// Null means "follow the device", the same as [getLocale].
  ///
  /// The lab is often dim and the phones are the preparators' own, so following
  /// the system remains the default -- this only exists for the preparator whose
  /// phone is set one way and who wants the app the other.
  static Future<String?> getThemeMode() async {
    final prefs = await SharedPreferences.getInstance();
    final stored = prefs.getString(_themeKey);
    if (stored != 'light' && stored != 'dark') return null;
    return stored;
  }

  static Future<void> setThemeMode(String? value) async {
    final prefs = await SharedPreferences.getInstance();
    if (value == null) {
      await prefs.remove(_themeKey);
      return;
    }
    await prefs.setString(_themeKey, value);
  }
}
