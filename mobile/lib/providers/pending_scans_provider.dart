import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/pending_scan.dart';
import '../services/pending_scan_service.dart';
import '../services/scan_sync_service.dart';
import '../services/session_service.dart';

class PendingScansNotifier extends StateNotifier<List<PendingScan>> {
  PendingScansNotifier() : super(const []) {
    refresh();
  }

  Future<void> refresh() async {
    // Scoped to the signed-in operator, matching what ScanSyncService will
    // actually send. Showing another account's queued scans in a list with
    // Retry and Discard on it would offer actions that do not belong to
    // whoever is holding the phone.
    final operatorId = (await SessionService.getUser())?.id;
    state = await PendingScanService.getFor(operatorId);
  }

  /// Sends whatever it can and returns what happened, for the UI to report.
  Future<SyncOutcome> sync() async {
    final outcome = await ScanSyncService.drain();
    await refresh();
    return outcome;
  }

  Future<void> retry(String id) async {
    await PendingScanService.markForRetry(id);
    await refresh();
  }

  Future<void> discard(String id) async {
    await PendingScanService.remove(id);
    await refresh();
  }
}

final pendingScansProvider =
    StateNotifierProvider<PendingScansNotifier, List<PendingScan>>((ref) {
  return PendingScansNotifier();
});
