import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/settings_service.dart';

/// Null means "follow the device language".
class LocaleNotifier extends StateNotifier<String?> {
  LocaleNotifier() : super(null) {
    _load();
  }

  Future<void> _load() async {
    // A store that will not answer must not throw out of the first build.
    // This runs while AtaraApp is watching, so an escaping error surfaces as
    // an unhandled exception before a single frame is on screen — and the
    // fallback is already the right one: null means "follow the device".
    try {
      state = await SettingsService.getLocale();
    } catch (_) {}
  }

  Future<void> setLocale(String? value) async {
    await SettingsService.setLocale(value);
    state = value;
  }
}

final localeProvider = StateNotifierProvider<LocaleNotifier, String?>((ref) {
  return LocaleNotifier();
});
