import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/work_summary.dart';
import '../services/api_service.dart';
import '../services/work_summary_cache_service.dart';

/// The operator's own shift tally. Errors are swallowed into an empty summary:
/// this is a panel on the home screen, not something worth an error state of
/// its own — being offline is already reported by the queue section below it.
class MyWorkNotifier extends StateNotifier<WorkSummary?> {
  MyWorkNotifier() : super(null) {
    _seedFromCache();
    refresh();
  }

  /// Puts last shift's tally on screen while the real one is fetched.
  ///
  /// `null` renders a spinner, and the panel sat on one after every launch and
  /// every save even though the previous answer was on disk — the cache was
  /// only ever consulted when the request failed offline.
  Future<void> _seedFromCache() async {
    if (state != null) return;
    try {
      final cached = await WorkSummaryCacheService.load();
      if (cached != null && state == null) state = cached;
    } catch (_) {
      // A cache miss is not worth reporting; the refresh is already running.
    }
  }

  Future<void> refresh() async {
    try {
      state = await ApiService.instance.getMyWork();
    } catch (_) {
      // Keep the last good tally rather than blanking it. A failed refresh
      // says nothing about the work already recorded, and showing zero after a
      // successful shift reads as lost work.
      state ??= WorkSummary.empty;
    }
  }
}

final myWorkProvider = StateNotifierProvider<MyWorkNotifier, WorkSummary?>((ref) {
  return MyWorkNotifier();
});
