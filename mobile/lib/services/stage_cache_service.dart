import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/stage_model.dart';

/// Keeps the last stage list on the device so the picker still works offline.
class StageCacheService {
  static const _key = 'atara_stages_cache';

  static Future<void> save(List<StageModel> stages) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(
      _key,
      stages.map((stage) => jsonEncode(stage.toJson())).toList(),
    );
  }

  /// A stale or malformed cache is worth less than an empty one: the caller
  /// falls back to asking the server.
  static Future<List<StageModel>> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_key) ?? [];

    final stages = <StageModel>[];
    for (final item in raw) {
      try {
        stages.add(StageModel.fromJson(jsonDecode(item) as Map<String, dynamic>));
      } catch (_) {
        return const [];
      }
    }
    return stages;
  }
}
