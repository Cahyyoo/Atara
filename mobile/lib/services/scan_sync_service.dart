import '../models/pending_scan.dart';
import 'api_exception.dart';
import 'api_service.dart';
import 'pending_scan_service.dart';
import 'session_service.dart';

class SyncOutcome {
  final int synced;
  final int rejected;

  /// True when the queue stopped because the network is still unavailable.
  final bool stoppedOffline;

  const SyncOutcome({
    this.synced = 0,
    this.rejected = 0,
    this.stoppedOffline = false,
  });
}

/// Sends queued scans to the server, one at a time, in the order they happened.
class ScanSyncService {
  static bool _isRunning = false;

  static Future<SyncOutcome> drain() async {
    // A connectivity change and an app resume can land together; only one
    // drain should be sending at a time or a scan could be posted twice.
    if (_isRunning) return const SyncOutcome();
    _isRunning = true;

    var synced = 0;
    var rejected = 0;
    var stoppedOffline = false;

    try {
      // Only this operator's own work.
      //
      // The queue outlives a sign-out, and the server takes the operator from
      // the session rather than from the body. So a handful of scans queued
      // offline by one operator, drained after somebody else signs in on the
      // same handset, were being filed as that second operator's work. The
      // scans are left in the queue for whoever actually made them.
      final operatorId = (await SessionService.getUser())?.id;
      final queue = await PendingScanService.getFor(operatorId);

      for (final PendingScan scan in queue) {
        // Rejected scans wait for the operator, not for another attempt.
        if (scan.hasFailed) continue;

        try {
          await ApiService.instance.scanUpdate(
            sampleCode: scan.sampleCode,
            stageId: scan.stageId,
            notes: scan.notes,
            force: scan.force,
            reason: scan.reason,
          );
          await PendingScanService.remove(scan.id);
          synced++;
        } on ApiException catch (error) {
          if (error.statusCode == null || error.isUnauthorized) {
            // Still no server, or the session has expired. Neither says anything
            // about the scan itself, so the queue is kept intact for a later
            // attempt. Order matters, so stop rather than skipping ahead.
            //
            // Treating a 401 as a refusal here would be the worst outcome: every
            // queued scan would be marked rejected because the token aged out,
            // and the operator would have to sort real refusals from noise.
            stoppedOffline = true;
            break;
          }
          if (error.isAlreadyRecorded) {
            // A timeout counts as offline, so a scan the server had already
            // saved was queued and sent again -- and then shown to the operator
            // as refused. The sample is where the scan meant to put it.
            await PendingScanService.remove(scan.id);
            synced++;
            continue;
          }
          if (error.isRetryableConflict) {
            // A lost race: this scan arrived while another one was landing on
            // the same sample. The scan itself is sound, so it is left queued
            // and the drain stops to keep the order — but the network is fine,
            // so this is not the offline case above.
            break;
          }
          // The server answered and refused it — a stage-order clash, say, or
          // a 403 because the account is no longer an operator. Surface it
          // instead of retrying forever; a 403 is final for every scan in the
          // queue, and each is left for the operator to retry or discard.
          await PendingScanService.markFailed(scan.id, error.message);
          rejected++;
        }
      }
    } finally {
      _isRunning = false;
    }

    return SyncOutcome(
      synced: synced,
      rejected: rejected,
      stoppedOffline: stoppedOffline,
    );
  }
}
