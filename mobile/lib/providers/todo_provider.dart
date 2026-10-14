import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/stage_board.dart';
import '../services/api_service.dart';

/// What is waiting to be moved on, stage by stage: Home's to-do list.
///
/// The same board the lab's wall monitor shows, so it is the whole floor rather
/// than this preparator's share of it — whoever picks up the next bag moves it.
/// Like My Work, the last answer is kept on disk and shown at once, and a
/// failed refresh keeps it rather than blanking the list.
class TodoNotifier extends StateNotifier<StageBoard?> {
  TodoNotifier() : super(null) {
    _seedFromCache();
    refresh();
  }

  static const _cacheKey = 'atara_stage_board';

  Future<void> _seedFromCache() async {
    if (state != null) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_cacheKey);
      if (raw == null) return;
      final cached = StageBoard.fromJson(
        jsonDecode(raw) as Map<String, dynamic>,
      );
      if (state == null && mounted) state = cached;
    } catch (_) {
      // A cache miss is not worth reporting; the refresh is already running.
    }
  }

  /// Which refresh is the latest, for the same reason as MyWorkNotifier's:
  /// a slow early answer must not land last and put an older board back.
  int _latest = 0;

  Future<void> refresh() async {
    final mine = ++_latest;
    try {
      final board = await ApiService.instance.getStageBoard();
      if (mine != _latest || !mounted) return;
      state = board;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_cacheKey, jsonEncode(board.toJson()));
    } catch (_) {
      // Keep what is on screen. With nothing yet, an empty board says "nothing
      // to show" rather than leaving a skeleton up forever.
      if (mounted) {
        state ??= StageBoard(
          generatedAt: DateTime.now(),
          slaHours: 24,
          columns: const [],
        );
      }
    }
  }
}

final todoProvider = StateNotifierProvider<TodoNotifier, StageBoard?>((ref) {
  return TodoNotifier();
});
