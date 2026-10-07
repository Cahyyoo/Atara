import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/stage_model.dart';
import '../services/api_service.dart';
import '../services/stage_cache_service.dart';

/// A fingerprint of the workflow, for deciding whether a refresh changed it.
///
/// [StageModel] has no equality of its own, and adding one only to compare two
/// lists here would be a wider change than the question deserves.
String _signature(List<StageModel> stages) => stages
    .map((s) => '${s.id}|${s.sequenceOrder}|${s.name}|${s.description}')
    .join(';');

/// The stage list, served from the device first and corrected behind the eyes.
///
/// It used to go to the network every time the process needed it, which put a
/// round trip in front of the stage picker on the first scan of every shift —
/// and the cache that existed was only ever read when the phone was fully
/// offline, so a slow-but-alive lab Wi-Fi paid the full wait with the answer
/// already on disk.
///
/// Now the cached list is returned immediately and a refresh runs behind it.
/// The workflow changes about never, so the stale window is a formality; when
/// it does change, the refresh notices and rebuilds the provider rather than
/// waiting for the next launch.
final stagesProvider = FutureProvider<List<StageModel>>((ref) async {
  final cached = await StageCacheService.load();
  if (cached.isEmpty) return ApiService.instance.getStages();

  unawaited(() async {
    try {
      final fresh = await ApiService.instance.getStages();
      if (_signature(fresh) != _signature(cached)) ref.invalidateSelf();
    } catch (_) {
      // Offline, or refused. The cached list is already on screen and is the
      // best answer available; a failed refresh is not worth an error state.
    }
  }());

  return cached;
});
