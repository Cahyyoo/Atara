import 'sample_identity.dart';
import 'sample_log_entry.dart';
import 'stage_model.dart';

enum SampleStatus { pending, inProgress, completed }

SampleStatus sampleStatusFromString(String value) {
  switch (value) {
    // The server sends the first form; the device cache round-trips the second.
    case 'IN_PROGRESS':
    case 'inProgress':
      return SampleStatus.inProgress;
    case 'COMPLETED':
    case 'completed':
      return SampleStatus.completed;
    default:
      return SampleStatus.pending;
  }
}

class SampleModel {
  final String id;
  final String sampleCode;

  /// What the lab sheet calls this sample, e.g. `MOL/LIM/S3/PA4/B42/919.3/25`.
  ///
  /// Null for most samples: the identity is often not known when the barcode is
  /// printed, and is filled in later from the web.
  final String? sampleIdent;

  /// The parts [sampleIdent] is composed from, and the Lab Code.
  ///
  /// Null when the reply carried no whole lab record — the scan reply, and
  /// caches written by older builds — which is not the same as a sample with
  /// no identity: that has an identity whose parts are all empty.
  final SampleIdentity? identity;

  final SampleStatus status;
  final StageModel? currentStage;
  final String createdByName;
  final DateTime updatedAt;

  /// Every stage this sample has been through, oldest first.
  ///
  /// Empty rather than null when unknown — a cache entry written by an older
  /// build has no history, and that is a thing the screen can say plainly
  /// without a second state to carry.
  final List<SampleLogEntry> logs;

  /// True when this came off the device rather than the server, so the screen
  /// can say plainly that the stage shown may have moved on since.
  final bool isFromCache;

  const SampleModel({
    required this.id,
    required this.sampleCode,
    required this.status,
    required this.currentStage,
    required this.createdByName,
    required this.updatedAt,
    this.sampleIdent,
    this.identity,
    this.logs = const [],
    this.isFromCache = false,
  });

  SampleModel asCached() {
    return SampleModel(
      id: id,
      sampleCode: sampleCode,
      sampleIdent: sampleIdent,
      identity: identity,
      status: status,
      currentStage: currentStage,
      createdByName: createdByName,
      updatedAt: updatedAt,
      logs: logs,
      isFromCache: true,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'sampleCode': sampleCode,
      'sampleIdent': sampleIdent,
      if (identity != null) 'labRecord': identity!.toJson(),
      'status': status.name,
      'currentStage': currentStage?.toJson(),
      'createdBy': {'name': createdByName},
      'updatedAt': updatedAt.toIso8601String(),
      'logs': logs.map((entry) => entry.toJson()).toList(),
    };
  }

  /// Reads the three shapes this model actually arrives in.
  ///
  /// The server nests the Sample ID under `labRecord` on both the lookup and
  /// the scan reply; the device cache round-trips it flat, from [toJson]. And a
  /// cache entry written by an older build has no such key at all — that has to
  /// read as null rather than throw, or updating the app mid-shift would burn
  /// every sample the preparator had saved for going offline.
  static String? _identFrom(Map<String, dynamic> json) {
    final flat = json['sampleIdent'];
    if (flat is String) return flat;

    final labRecord = json['labRecord'];
    if (labRecord is Map<String, dynamic>) return labRecord['sampleIdent'] as String?;
    return null;
  }

  /// Absent on the scan reply and on caches written by older builds, so its
  /// absence is normal rather than an error. One unreadable row is skipped;
  /// history is context, and losing a line of it must not cost the screen.
  static List<SampleLogEntry> _logsFrom(Map<String, dynamic> json) {
    final raw = json['logs'];
    if (raw is! List) return const [];

    final entries = <SampleLogEntry>[];
    for (final item in raw) {
      if (item is! Map<String, dynamic>) continue;
      try {
        entries.add(SampleLogEntry.fromJson(item));
      } catch (_) {
        // Skipped on purpose; see above.
      }
    }
    return entries;
  }

  factory SampleModel.fromJson(Map<String, dynamic> json) {
    return SampleModel(
      id: json['id'] as String,
      sampleCode: json['sampleCode'] as String,
      sampleIdent: _identFrom(json),
      identity: SampleIdentity.tryFromJson(json['labRecord']),
      status: sampleStatusFromString(json['status'] as String),
      currentStage: json['currentStage'] == null
          ? null
          : StageModel.fromJson(json['currentStage'] as Map<String, dynamic>),
      createdByName: (json['createdBy'] as Map<String, dynamic>)['name'] as String,
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      logs: _logsFrom(json),
    );
  }
}
