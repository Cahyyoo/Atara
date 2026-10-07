import 'dart:async';

import 'package:atara/models/work_summary.dart';
import 'package:atara/providers/scan_history_provider.dart';
import 'package:atara/services/api_exception.dart';

/// Pages answered from a script rather than a server.
///
/// ApiService.instance is a singleton with no injection point, so the existing
/// tests in this suite reach for a notifier subclass. The logic worth testing
/// is everything around that one call: accumulation, the re-entrancy guard,
/// the reset, and what a failure does to rows already on screen.
class ScriptedHistory extends ScanHistoryNotifier {
  ScriptedHistory(this.pages, {this.failOn, this.hold = false});

  final Map<int, ScanHistoryPage> pages;

  /// A page number that throws instead of answering.
  final int? failOn;

  /// Leaves every request in flight until [release] is called.
  final bool hold;

  final List<int> requested = [];
  final List<Completer<ScanHistoryPage>> _pending = [];

  void release() {
    for (final completer in _pending) {
      if (!completer.isCompleted) {
        completer.complete(pages[requested.last]!);
      }
    }
    _pending.clear();
  }

  @override
  Future<ScanHistoryPage> fetchPage(int page) {
    requested.add(page);
    if (page == failOn) {
      return Future.error(
        const ApiException('offline', kind: ApiErrorKind.unreachable),
      );
    }
    if (hold) {
      final completer = Completer<ScanHistoryPage>();
      _pending.add(completer);
      return completer.future;
    }
    return Future.value(pages[page]!);
  }
}

ScanHistoryPage page(
  int number, {
  required List<String> codes,
  int totalPages = 3,
  String shiftDate = '2026-09-22',
  String? entryShiftDate,
}) {
  return ScanHistoryPage(
    page: number,
    totalPages: totalPages,
    total: 120,
    shiftDate: shiftDate,
    entries: [
      for (final code in codes)
        WorkEntry(
          sampleCode: code,
          stageName: 'PREP BASAH',
          // Derived from the code, not from its position: a row that really is
          // the same row carries the same instant on whichever page it lands.
          scannedAt: DateTime.utc(2026, 9, 22, 8, code.codeUnitAt(0)),
          isCorrection: false,
          shiftDate: entryShiftDate ?? shiftDate,
        ),
    ],
  );
}

/// A script of [n] single-row pages, each reporting `totalPages: n`.
///
/// One row per page on purpose: the auto-load budget counts PAGES, so ten pages
/// reach the ceiling without a test having to build two hundred rows. Single
/// letters keep both the code and the instant [page] derives from it unique, so
/// nothing is deduped away.
Map<int, ScanHistoryPage> scriptOf(int n) => {
      for (var p = 1; p <= n; p++)
        p: page(p, codes: [String.fromCharCode(64 + p)], totalPages: n),
    };

/// Asks the automatic path far more often than any budget allows.
///
/// So a test asserts where the list STOPPED rather than how many times it was
/// nudged — which is the only assertion that catches an off-by-one in the
/// budget rather than merely restating it.
Future<void> nudge(ScanHistoryNotifier notifier, {int times = 30}) async {
  for (var i = 0; i < times; i++) {
    await notifier.loadMoreAutomatically();
  }
}
