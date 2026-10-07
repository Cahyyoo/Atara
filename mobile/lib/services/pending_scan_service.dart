import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/pending_scan.dart';

/// Durable queue of scans that have not reached the server.
///
/// Unlike the scan history, which is a receipt of what already succeeded, this
/// is work still owed to the server. Nothing is ever removed without either
/// succeeding or the operator explicitly discarding it.
class PendingScanService {
  static const _key = 'atara_pending_scans';

/// Decodes stored entries, dropping any that no longer parse.
///
/// One malformed entry used to take the whole list with it: `jsonDecode` throws,
/// the throw escapes the read, and nothing could be recovered. For the pending
/// queue that is the worst case in the app — a single bad record would make
/// every unsent scan unreadable, so none of them could ever be delivered.
  static Future<List<PendingScan>> getAll() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_key) ?? [];

    final scans = <PendingScan>[];
    for (final item in raw) {
      try {
        scans.add(PendingScan.fromJson(jsonDecode(item) as Map<String, dynamic>));
      } catch (_) {
        // Unreadable, so it can never be sent. Keeping the rest is the priority.
      }
    }
    return scans;
  }

  /// The queue as it belongs to one operator.
  ///
  /// Deliberately not a filter inside [getAll]: the writers below read the
  /// whole list, change one entry and write it back, so a filtered read there
  /// would delete every other account's queued work on the next save.
  ///
  /// Entries with no operator were queued by a build that did not record one.
  /// They are included rather than orphaned — see [PendingScan.operatorId].
  static Future<List<PendingScan>> getFor(String? operatorId) async {
    final scans = await getAll();
    return scans
        .where((scan) => scan.operatorId == null || scan.operatorId == operatorId)
        .toList();
  }

  static Future<void> _save(List<PendingScan> scans) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(
      _key,
      scans.map((scan) => jsonEncode(scan.toJson())).toList(),
    );
  }

  static Future<void> add(PendingScan scan) async {
    final scans = await getAll();
    scans.add(scan);
    await _save(scans);
  }

  static Future<void> remove(String id) async {
    final scans = await getAll();
    scans.removeWhere((scan) => scan.id == id);
    await _save(scans);
  }

  static Future<void> markFailed(String id, String reason) async {
    final scans = await getAll();
    final index = scans.indexWhere((scan) => scan.id == id);
    if (index == -1) return;
    scans[index] = scans[index].copyWith(failureReason: reason);
    await _save(scans);
  }

  /// Puts a rejected scan back in line for another attempt.
  static Future<void> markForRetry(String id) async {
    final scans = await getAll();
    final index = scans.indexWhere((scan) => scan.id == id);
    if (index == -1) return;
    scans[index] = scans[index].copyWith(clearFailure: true);
    await _save(scans);
  }
}
