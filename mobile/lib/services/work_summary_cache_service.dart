import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/work_summary.dart';

/// Keeps the last work summary the server sent, so the card still says something
/// when the phone is offline instead of going blank.
class WorkSummaryCacheService {
  static const _key = 'atara_work_summary';

  static Future<void> save(WorkSummary summary) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(summary.toJson()));
  }

  static Future<WorkSummary?> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return null;

    try {
      return WorkSummary.fromJson(jsonDecode(raw) as Map<String, dynamic>).asCached();
    } catch (_) {
      return null;
    }
  }

  /// Signing out must not leave one operator's tally on screen for the next.
  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }
}
