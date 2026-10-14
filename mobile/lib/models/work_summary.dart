/// One scan the preparator recorded, as the server has it.
class WorkEntry {
  final String sampleCode;
  final String? stageKey;
  final String stageName;
  final DateTime scannedAt;
  final bool isCorrection;

  /// The shift day the server filed this scan under, "YYYY-MM-DD".
  ///
  /// Never computed here. A shift begins at 07:00 WITA, which is a business
  /// rule living in the server's shift-date.ts with one test suite; a second
  /// copy in Dart would be the copy nobody updates, and a handset set to WIB
  /// would disagree with the shift date the same response already carries.
  ///
  /// Null in anything an older build cached, and from an older server.
  final String? shiftDate;

  /// The note, or the correction reason, truncated by the server.
  ///
  /// The two are one column: `notes` is the reason whenever [isCorrection] is
  /// true, which makes it the line a preparator scrolling back a week is
  /// actually looking for.
  final String? notes;

  const WorkEntry({
    required this.sampleCode,
    this.stageKey,
    required this.stageName,
    required this.scannedAt,
    required this.isCorrection,
    this.shiftDate,
    this.notes,
  });

  Map<String, dynamic> toJson() => {
        'sampleCode': sampleCode,
        'stageKey': stageKey,
        'stageName': stageName,
        'scannedAt': scannedAt.toIso8601String(),
        'isCorrection': isCorrection,
        'shiftDate': shiftDate,
        'notes': notes,
      };

  factory WorkEntry.fromJson(Map<String, dynamic> json) {
    return WorkEntry(
      sampleCode: json['sampleCode'] as String,
      // Null in anything an older build cached, which must still read.
      stageKey: json['stageKey'] as String?,
      stageName: json['stageName'] as String? ?? '',
      scannedAt: DateTime.parse(json['scannedAt'] as String),
      isCorrection: json['isCorrection'] as bool? ?? false,
      shiftDate: json['shiftDate'] as String?,
      notes: json['notes'] as String?,
    );
  }
}

/// Rows per request.
///
/// Small on purpose, and much smaller than the endpoint's own default of 100 —
/// which exists only to keep a phone already in the field behaving as it always
/// has. The server accepts anything from 1 to 200, so this number is the whole
/// of the client's say in how gradually the list fills.
///
/// It was 50, and fifty rows is about 3200 logical pixels arriving in one
/// frame's worth of appended state. Twenty is about 1300, which against a phone
/// viewport of roughly 700 is still twice what is on screen — enough that the
/// preparator never scrolls into emptiness, little enough that no single landing
/// is a lurch.
///
/// Twenty has one consequence worth knowing before changing it back: 1300
/// pixels can be SHORTER than a tall phone or a tablet, so the first page may
/// leave nothing to scroll. See the footer in scan_history_screen.dart, which
/// has to offer a way forward for exactly that case.
const int kScanHistoryPageSize = 20;

/// How many pages may land before the screen stops fetching on its own.
///
/// Ten at [kScanHistoryPageSize] is about two hundred rows — roughly a
/// fortnight of a busy rack — and then the preparator says "Muat lagi" once and
/// gets another ten. The product is what matters, which is why both numbers
/// live here rather than one of them beside the notifier that reads it.
///
/// An ABSOLUTE ceiling was the other option and is worse. Past it, every
/// further twenty rows would cost a tap, so working back through a week would
/// be hundreds of taps. A budget that an explicit ask RENEWS charges one tap
/// per two hundred rows however far back the preparator goes.
///
/// Counted in pages, not rows, and that is not arbitrary — see
/// `ScanHistoryState.isAutoLoadPaused` for the duplicate-page argument.
const int kScanHistoryAutoLoadPages = 10;

/// How far back to ask for. The server refuses more.
const int kScanHistoryDays = 90;

/// One page of the preparator's own scans, across shift days.
///
/// The same endpoint and the same `logs` shape as [WorkSummary] — this is the
/// paged view of it, so the entries are [WorkEntry] rather than a parallel
/// model that would drift from it.
///
/// `byStage` is deliberately absent, and the server now leans on that: the
/// per-stage grouping needs a column that is in no usable index, so it costs one
/// clustered row lookup per row in the window, and it used to run on every page
/// of a ninety-day request for a tally nothing here reads. The server computes it
/// only for a one-day window now. So a future reader adding a `byStage` field
/// below will get an empty list and should ask for `days: 1` rather than
/// "fixing" the route — see `tallyScanHistory` in `web/src/lib/scan-history.ts`.
class ScanHistoryPage {
  final List<WorkEntry> entries;

  /// The server's CURRENT shift day, which is how the screen knows which
  /// group to call "today" without consulting the handset's clock.
  final String shiftDate;

  /// Rows in the whole window, not on this page.
  final int total;

  final int page;
  final int totalPages;

  /// True when this was synthesised from the phone's cache rather than fetched.
  final bool isFromCache;

  const ScanHistoryPage({
    required this.entries,
    required this.shiftDate,
    required this.total,
    required this.page,
    required this.totalPages,
    this.isFromCache = false,
  });

  /// What the phone can offer with no signal: the shift tally it already has,
  /// as a single page that infinite scroll will stop cleanly at.
  factory ScanHistoryPage.fromCache(WorkSummary summary) {
    return ScanHistoryPage(
      entries: summary.entries,
      shiftDate: summary.shiftDate,
      total: summary.total,
      page: 1,
      totalPages: 1,
      isFromCache: true,
    );
  }

  factory ScanHistoryPage.fromJson(Map<String, dynamic> json) {
    final pagination = json['pagination'] as Map<String, dynamic>? ?? const {};
    return ScanHistoryPage(
      entries: (json['logs'] as List<dynamic>? ?? [])
          .map((item) => WorkEntry.fromJson(item as Map<String, dynamic>))
          .toList(),
      shiftDate: json['shiftDate'] as String? ?? '',
      total: json['total'] as int? ?? 0,
      page: pagination['page'] as int? ?? 1,
      // A server that has not been updated sends no pagination at all. One
      // page is the honest reading of that, and it stops the scroll rather
      // than asking for a second page that would repeat the first.
      totalPages: pagination['totalPages'] as int? ?? 1,
    );
  }
}

class StageTally {
  final String? stageKey;
  final String stageName;
  final int count;

  const StageTally({required this.stageName, required this.count, this.stageKey});

  Map<String, dynamic> toJson() => {
        'stageKey': stageKey,
        'stageName': stageName,
        'count': count,
      };

  factory StageTally.fromJson(Map<String, dynamic> json) {
    return StageTally(
      stageKey: json['stageKey'] as String?,
      stageName: json['stageName'] as String? ?? '',
      count: json['count'] as int? ?? 0,
    );
  }
}

/// The preparator's own work for the current shift day.
///
/// [total] and [byStage] are counted by the server across the whole shift, so
/// they stay right even though [entries] is capped.
class WorkSummary {
  final String shiftDate;
  final int total;
  final List<StageTally> byStage;
  final List<WorkEntry> entries;

  /// True when this came off the device, so it reflects the last time the phone
  /// was online rather than now.
  final bool isFromCache;

  const WorkSummary({
    required this.shiftDate,
    required this.total,
    required this.byStage,
    required this.entries,
    this.isFromCache = false,
  });

  static const empty = WorkSummary(shiftDate: '', total: 0, byStage: [], entries: []);

  WorkSummary asCached() => WorkSummary(
        shiftDate: shiftDate,
        total: total,
        byStage: byStage,
        entries: entries,
        isFromCache: true,
      );

  Map<String, dynamic> toJson() => {
        'shiftDate': shiftDate,
        'total': total,
        'byStage': byStage.map((tally) => tally.toJson()).toList(),
        'logs': entries.map((entry) => entry.toJson()).toList(),
      };

  factory WorkSummary.fromJson(Map<String, dynamic> json) {
    return WorkSummary(
      shiftDate: json['shiftDate'] as String? ?? '',
      total: json['total'] as int? ?? 0,
      byStage: (json['byStage'] as List<dynamic>? ?? [])
          .map((item) => StageTally.fromJson(item as Map<String, dynamic>))
          .toList(),
      entries: (json['logs'] as List<dynamic>? ?? [])
          .map((item) => WorkEntry.fromJson(item as Map<String, dynamic>))
          .toList(),
    );
  }
}
