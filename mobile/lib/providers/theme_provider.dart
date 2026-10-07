import 'package:flutter/material.dart' show ThemeMode;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/settings_service.dart';

/// Which appearance the app uses, [ThemeMode.system] unless the operator said
/// otherwise.
///
/// Shaped like [LocaleNotifier] beside it, including the lesson that one had
/// to learn: the load is wrapped in a try/catch. This notifier is watched by
/// AtaraApp itself, so an escaping error would surface as an unhandled
/// exception before a single frame is on screen -- and the fallback is already
/// the right answer.
class ThemeModeNotifier extends StateNotifier<ThemeMode> {
  ThemeModeNotifier() : super(ThemeMode.system) {
    _load();
  }

  Future<void> _load() async {
    try {
      state = _parse(await SettingsService.getThemeMode());
    } catch (_) {}
  }

  Future<void> setMode(ThemeMode value) async {
    state = value;
    await SettingsService.setThemeMode(_store(value));
  }

  static ThemeMode _parse(String? stored) => switch (stored) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        _ => ThemeMode.system,
      };

  static String? _store(ThemeMode mode) => switch (mode) {
        ThemeMode.light => 'light',
        ThemeMode.dark => 'dark',
        // Null rather than "system": absent means follow the device, which is
        // also what an install with no preference reads as.
        ThemeMode.system => null,
      };
}

final themeModeProvider =
    StateNotifierProvider<ThemeModeNotifier, ThemeMode>((ref) {
  return ThemeModeNotifier();
});
