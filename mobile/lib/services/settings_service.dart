import 'dart:io';

import 'package:flutter/foundation.dart' show kIsWeb;

import 'package:shared_preferences/shared_preferences.dart';

/// Device-local settings: where the server lives and which language to use.
///
/// The server address is no longer typed in on the phone. The lab admin sets
/// it on the website and ServerConfigSync stores it here; with nothing stored,
/// the built-in address applies.
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

  /// Set by the release build from the GitHub variable MOBILE_DEFAULT_SERVER_URL.
  ///
  /// The way back for a phone that can reach no server at all: change the
  /// variable, publish a release, and the update brings the new address.
  static const _builtInServerUrl = String.fromEnvironment('ATARA_DEFAULT_SERVER');

  static String get defaultServerUrl {
    if (_builtInServerUrl.isNotEmpty) return _builtInServerUrl;
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

  /// Empty means the built-in address, so a later release's new default
  /// applies to a phone that was simply following it.
  static Future<void> setServerUrl(String value) async {
    final prefs = await SharedPreferences.getInstance();
    final trimmed = value.trim();
    if (trimmed.isEmpty) {
      await prefs.remove(_serverKey);
      return;
    }
    await prefs.setString(_serverKey, trimmed);
  }

  /// Null means "not chosen", which the app shows as Indonesian.
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
