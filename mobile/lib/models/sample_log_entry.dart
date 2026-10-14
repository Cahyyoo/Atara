/// One line of a sample's history: who moved it where, when, and why.
///
/// The server has always sent these — `GET /api/samples/[code]` includes the
/// whole `logs` array with its stage and preparator joined — and the app threw
/// them away while parsing. So a preparator could write a field note and no
/// one could ever read it back from a phone, and every scan downloaded a
/// sample's entire lifetime to display three fields.
class SampleLogEntry {
  const SampleLogEntry({
    this.stageKey,
    required this.stageName,
    required this.preparatorName,
    required this.scannedAt,
    this.notes,
    this.isCorrection = false,
  });

  final String? stageKey;
  final String stageName;
  final String preparatorName;
  final DateTime scannedAt;

  /// What the preparator typed at the time. For a correction the server stores
  /// the required reason here instead.
  final String? notes;

  /// Somebody overrode the stage order. The reason is in [notes].
  final bool isCorrection;

  Map<String, dynamic> toJson() {
    return {
      'stageKey': stageKey,
      'stageName': stageName,
      'preparatorName': preparatorName,
      'scannedAt': scannedAt.toIso8601String(),
      'notes': notes,
      'isCorrection': isCorrection,
    };
  }

  /// Reads both the server's nested shape and the flat one the cache writes.
  ///
  /// A row that cannot be read is skipped by the caller rather than throwing:
  /// history is context beside the thing the preparator came to do, and losing a
  /// line of it must never cost them the screen.
  factory SampleLogEntry.fromJson(Map<String, dynamic> json) {
    final stage = json['stage'];
    // `operator` and `operatorName` are the names before the rename, still
    // found in samples cached on the phone by an older build.
    final preparator = json['preparator'] ?? json['operator'];

    return SampleLogEntry(
      // Nested from the server, flat from the cache, and absent in anything an
      // older build wrote.
      stageKey: stage is Map<String, dynamic>
          ? stage['key'] as String?
          : json['stageKey'] as String?,
      stageName: stage is Map<String, dynamic>
          ? stage['name'] as String
          : json['stageName'] as String,
      preparatorName: preparator is Map<String, dynamic>
          ? preparator['name'] as String
          : (json['preparatorName'] ?? json['operatorName']) as String? ?? '',
      scannedAt: DateTime.parse(json['scannedAt'] as String),
      notes: json['notes'] as String?,
      isCorrection: json['isCorrection'] as bool? ?? false,
    );
  }
}
