/// One line of a sample's history: who moved it where, when, and why.
///
/// The server has always sent these — `GET /api/samples/[code]` includes the
/// whole `logs` array with its stage and operator joined — and the app threw
/// them away while parsing. So an operator could write a field note and no
/// one could ever read it back from a phone, and every scan downloaded a
/// sample's entire lifetime to display three fields.
class SampleLogEntry {
  const SampleLogEntry({
    this.stageKey,
    required this.stageName,
    required this.operatorName,
    required this.scannedAt,
    this.notes,
    this.isCorrection = false,
  });

  final String? stageKey;
  final String stageName;
  final String operatorName;
  final DateTime scannedAt;

  /// What the operator typed at the time. For a correction the server stores
  /// the required reason here instead.
  final String? notes;

  /// Somebody overrode the stage order. The reason is in [notes].
  final bool isCorrection;

  Map<String, dynamic> toJson() {
    return {
      'stageKey': stageKey,
      'stageName': stageName,
      'operatorName': operatorName,
      'scannedAt': scannedAt.toIso8601String(),
      'notes': notes,
      'isCorrection': isCorrection,
    };
  }

  /// Reads both the server's nested shape and the flat one the cache writes.
  ///
  /// A row that cannot be read is skipped by the caller rather than throwing:
  /// history is context beside the thing the operator came to do, and losing a
  /// line of it must never cost them the screen.
  factory SampleLogEntry.fromJson(Map<String, dynamic> json) {
    final stage = json['stage'];
    final operator = json['operator'];

    return SampleLogEntry(
      // Nested from the server, flat from the cache, and absent in anything an
      // older build wrote.
      stageKey: stage is Map<String, dynamic>
          ? stage['key'] as String?
          : json['stageKey'] as String?,
      stageName: stage is Map<String, dynamic>
          ? stage['name'] as String
          : json['stageName'] as String,
      operatorName: operator is Map<String, dynamic>
          ? operator['name'] as String
          : json['operatorName'] as String? ?? '',
      scannedAt: DateTime.parse(json['scannedAt'] as String),
      notes: json['notes'] as String?,
      isCorrection: json['isCorrection'] as bool? ?? false,
    );
  }
}
