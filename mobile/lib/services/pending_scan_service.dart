import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/pending_scan.dart';

/// Durable queue of scans that have not reached the server.
///
/// Unlike the scan history, which is a receipt of what already succeeded, this
/// is work still owed to the server. Nothing is ever removed without either
/// succeeding or the preparator explicitly discarding it.
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

    // Each stored entry is parsed once and remembered, keyed by its own text,
    // rather than the whole queue being re-parsed on every change. After a long
    // offline shift that re-parse was most of the cost: a single add took
    // 15 ms with 250 queued and 100 ms with 2,000, and draining 1,000 took 26 s.
    final seen = <String, PendingScan>{};
    final scans = <PendingScan>[];
    for (final item in raw) {
      final known = _decoded[item];
      if (known != null) {
        seen[item] = known;
        scans.add(known);
        continue;
      }
      try {
        final scan = PendingScan.fromJson(jsonDecode(item) as Map<String, dynamic>);
        _encoded[scan] = item;
        seen[item] = scan;
        scans.add(scan);
      } catch (_) {
        // Unreadable, so it can never be sent. Keeping the rest is the priority.
      }
    }
    _decoded
      ..clear()
      ..addAll(seen);
    return scans;
  }

  static final Map<String, PendingScan> _decoded = {};
  static final Expando<String> _encoded = Expando('pendingScanJson');

  /// The tail of the queue of changes. Every writer reads the whole list,
  /// changes one entry and writes it all back; two of them interleaved -- the
  /// drain removing a sent scan while the preparator queues a new one -- and the
  /// later write put back a list without the other's change, so a freshly
  /// queued scan could vanish. Changes now run one after another.
  static Future<void> _tail = Future<void>.value();

  static Future<T> _serial<T>(Future<T> Function() change) {
    final run = _tail.then((_) => change());
    _tail = run.then<void>((_) {}, onError: (Object _) {});
    return run;
  }

  /// The queue as it belongs to one preparator.
  ///
  /// Deliberately not a filter inside [getAll]: the writers below read the
  /// whole list, change one entry and write it back, so a filtered read there
  /// would delete every other account's queued work on the next save.
  ///
  /// Entries with no preparator were queued by a build that did not record one.
  /// They are included rather than orphaned — see [PendingScan.preparatorId].
  static Future<List<PendingScan>> getFor(String? preparatorId) async {
    final scans = await getAll();
    return scans
        .where((scan) => scan.preparatorId == null || scan.preparatorId == preparatorId)
        .toList();
  }

  static Future<void> _save(List<PendingScan> scans) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(
      _key,
      scans.map((scan) => _encoded[scan] ??= jsonEncode(scan.toJson())).toList(),
    );
  }

  static Future<void> add(PendingScan scan) => _serial(() async {
        final scans = await getAll();
        scans.add(scan);
        await _save(scans);
      });

  static Future<void> remove(String id) => _serial(() async {
        final scans = await getAll();
        scans.removeWhere((scan) => scan.id == id);
        await _save(scans);
      });

  static Future<void> markFailed(String id, String reason) => _serial(() async {
        final scans = await getAll();
        final index = scans.indexWhere((scan) => scan.id == id);
        if (index == -1) return;
        scans[index] = scans[index].copyWith(failureReason: reason);
        await _save(scans);
      });

  /// Puts a rejected scan back in line for another attempt.
  static Future<void> markForRetry(String id) => _serial(() async {
        final scans = await getAll();
        final index = scans.indexWhere((scan) => scan.id == id);
        if (index == -1) return;
        scans[index] = scans[index].copyWith(clearFailure: true);
        await _save(scans);
      });
}
