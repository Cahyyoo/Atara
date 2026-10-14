import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/sample_model.dart';

/// Keeps recently opened samples on the device so a stage can still be recorded
/// when the network is gone.
///
/// One entry per key, with a short index holding the order.
///
/// It used to be a single list of 300 encoded samples, rewritten whole on every
/// scan: 300 decodes, 300 encodes and a ~90 KB write across the platform
/// channel, on the UI isolate, while the preparator watched a spinner. Reading one
/// sample decoded all 300 and then scanned the list linearly. Now a save touches
/// one entry plus a list of codes, and a read touches one entry — the work no
/// longer grows with how long the preparator has been on shift.
class SampleCacheService {
  /// The old single-blob key, kept only so an existing cache can be migrated.
  static const _legacyKey = 'atara_sample_cache';

  /// Codes, most recent first. Short strings, no JSON.
  static const _indexKey = 'atara_sample_index';

  static const _entryPrefix = 'atara_sample_';

  /// Enough to cover a shift without letting the store grow without bound.
  static const _maxItems = 300;

  static String _entryKey(String sampleCode) => '$_entryPrefix$sampleCode';

  static Future<void> save(SampleModel sample) async {
    final prefs = await SharedPreferences.getInstance();
    await _migrateIfNeeded(prefs);

    await prefs.setString(
      _entryKey(sample.sampleCode),
      jsonEncode(sample.toJson()),
    );

    // Most recent first, and never the same code twice.
    final index = prefs.getStringList(_indexKey) ?? <String>[];
    index.remove(sample.sampleCode);
    index.insert(0, sample.sampleCode);

    if (index.length > _maxItems) {
      for (final dropped in index.sublist(_maxItems)) {
        await prefs.remove(_entryKey(dropped));
      }
      index.removeRange(_maxItems, index.length);
    }

    await prefs.setStringList(_indexKey, index);
  }

  static Future<SampleModel?> load(String sampleCode) async {
    final prefs = await SharedPreferences.getInstance();
    await _migrateIfNeeded(prefs);

    final raw = prefs.getString(_entryKey(sampleCode));
    if (raw == null) return null;

    try {
      return SampleModel.fromJson(jsonDecode(raw) as Map<String, dynamic>)
          .asCached();
    } catch (_) {
      // One unreadable entry must not look like a cache failure. Drop it and
      // let the caller ask the server.
      await prefs.remove(_entryKey(sampleCode));
      return null;
    }
  }

  /// Moves an old single-blob cache across, once.
  ///
  /// Updating the app mid-shift must not burn the samples a preparator saved
  /// for going offline — the same reason [SampleModel] still parses the older
  /// shapes it has been written in.
  static Future<void> _migrateIfNeeded(SharedPreferences prefs) async {
    final legacy = prefs.getStringList(_legacyKey);
    if (legacy == null) return;

    final index = <String>[];
    for (final item in legacy.take(_maxItems)) {
      try {
        final sample =
            SampleModel.fromJson(jsonDecode(item) as Map<String, dynamic>);
        if (index.contains(sample.sampleCode)) continue;
        await prefs.setString(_entryKey(sample.sampleCode), item);
        index.add(sample.sampleCode);
      } catch (_) {
        // One unreadable entry must not cost the rest of the cache.
      }
    }

    await prefs.setStringList(_indexKey, index);
    await prefs.remove(_legacyKey);
  }
}
