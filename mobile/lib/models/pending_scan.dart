/// A scan captured on the device that has not reached the server yet.
class PendingScan {
  final String id;
  final String sampleCode;
  final String stageId;

  /// Captured when the scan was queued, so the queue can name the stage
  /// in the preparator's language rather than in whichever one was on
  /// screen at the time.
  final String? stageKey;
  final String stageName;
  final String? notes;
  final DateTime queuedAt;

  /// A preparator's override of the stage order, carried so that a correction made with no
  /// signal is still a correction when the queue drains — rather than quietly
  /// becoming an ordinary scan the server then refuses.
  final bool force;
  final String? reason;

  /// Set when the server refused the scan on business grounds (wrong stage
  /// order, unknown sample). Those need the preparator to decide, so they are
  /// never retried automatically and never silently dropped.
  final String? failureReason;

  /// Who queued it.
  ///
  /// The server takes the preparator from the session, never from the body — so
  /// a queue drained under a different account files one preparator's work as
  /// another's. That is invisible while the app only shows the current shift,
  /// and plainly wrong the moment a dated history exists.
  ///
  /// Null in anything an older build queued. There is no way to find out who
  /// that was, so those are still sent: losing a scan is worse than crediting
  /// it to whoever is signed in, and it was already being credited that way.
  final String? preparatorId;

  const PendingScan({
    required this.id,
    required this.sampleCode,
    required this.stageId,
    this.stageKey,
    required this.stageName,
    required this.queuedAt,
    this.notes,
    this.force = false,
    this.reason,
    this.failureReason,
    this.preparatorId,
  });

  bool get hasFailed => failureReason != null;

  PendingScan copyWith({String? failureReason, bool clearFailure = false}) {
    return PendingScan(
      id: id,
      sampleCode: sampleCode,
      stageId: stageId,
      stageKey: stageKey,
      stageName: stageName,
      notes: notes,
      force: force,
      reason: reason,
      queuedAt: queuedAt,
      failureReason: clearFailure
          ? null
          : (failureReason ?? this.failureReason),
      preparatorId: preparatorId,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'sampleCode': sampleCode,
      'stageId': stageId,
      'stageKey': stageKey,
      'stageName': stageName,
      'notes': notes,
      'force': force,
      'reason': reason,
      'queuedAt': queuedAt.toIso8601String(),
      'failureReason': failureReason,
      'preparatorId': preparatorId,
    };
  }

  factory PendingScan.fromJson(Map<String, dynamic> json) {
    return PendingScan(
      id: json['id'] as String,
      sampleCode: json['sampleCode'] as String,
      stageId: json['stageId'] as String,
      stageKey: json['stageKey'] as String?,
      stageName: json['stageName'] as String? ?? '',
      notes: json['notes'] as String?,
      // Absent in anything queued by an older build; an ordinary scan is the
      // right reading of that.
      force: json['force'] as bool? ?? false,
      reason: json['reason'] as String?,
      queuedAt: DateTime.parse(json['queuedAt'] as String),
      failureReason: json['failureReason'] as String?,
      // `operatorId` is how builds before the rename wrote it: a scan queued
      // offline before the update must keep the account it belongs to.
      preparatorId: (json['preparatorId'] ?? json['operatorId']) as String?,
    );
  }
}
