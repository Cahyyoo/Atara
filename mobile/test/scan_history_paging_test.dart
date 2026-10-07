import 'dart:async';

import 'package:flutter_test/flutter_test.dart';

import 'package:atara/models/work_summary.dart';
import 'package:atara/providers/scan_history_provider.dart';
import 'support/scan_history_fixtures.dart';

/// The flat index as readable strings, because [ScanHistoryRow] has no `==` and
/// a failure printing two lists of instance hashes teaches nobody anything.
///
/// A heading becomes `H:<date>`. A scan becomes `S:<code>:` followed by F if it
/// carries the day card's top corner and L if it carries the bottom one.
List<String> shapeOf(List<ScanHistoryRow> rows) {
  return [
    for (final row in rows)
      if (row.isHeading)
        'H:${row.shiftDate}'
      else
        'S:${row.entry!.sampleCode}:'
            '${row.isFirstOfDay ? 'F' : '-'}${row.isLastOfDay ? 'L' : '-'}',
  ];
}

void main() {
  test('accumulates pages in order', () async {
    final notifier = ScriptedHistory({
      1: page(1, codes: ['A', 'B']),
      2: page(2, codes: ['C', 'D']),
    });
    await pumpEventQueue();

    await notifier.loadMore();

    expect(notifier.state.entries.map((e) => e.sampleCode), ['A', 'B', 'C', 'D']);
    expect(notifier.state.loadedPages, 2);
    expect(notifier.requested, [1, 2]);
  });

  test('stops asking once the last page has landed', () async {
    final notifier = ScriptedHistory({
      1: page(1, codes: ['A'], totalPages: 1),
    });
    await pumpEventQueue();

    expect(notifier.state.hasMore, isFalse);
    await notifier.loadMore();

    expect(notifier.requested, [1], reason: 'no second request was made');
  });

  test('a second request while one is in flight is a no-op', () async {
    // Infinite scroll fires this on every frame near the bottom.
    final notifier = ScriptedHistory(
      {1: page(1, codes: ['A']), 2: page(2, codes: ['B'])},
      hold: true,
    );
    notifier.release();
    await pumpEventQueue();

    unawaited(notifier.loadMore());
    unawaited(notifier.loadMore());
    unawaited(notifier.loadMore());
    notifier.release();
    await pumpEventQueue();

    expect(notifier.requested, [1, 2]);
  });

  test('refresh collapses what was accumulated back to one page', () async {
    final notifier = ScriptedHistory({
      1: page(1, codes: ['A', 'B']),
      2: page(2, codes: ['C']),
      3: page(3, codes: ['D']),
    });
    await pumpEventQueue();
    await notifier.loadMore();
    await notifier.loadMore();
    expect(notifier.state.entries, hasLength(4));

    await notifier.refresh();

    expect(notifier.state.entries.map((e) => e.sampleCode), ['A', 'B']);
    expect(notifier.state.loadedPages, 1);
  });

  test('a later page failing keeps the rows already on screen', () async {
    final notifier = ScriptedHistory(
      {1: page(1, codes: ['A', 'B'])},
      failOn: 2,
    );
    await pumpEventQueue();

    await notifier.loadMore();

    expect(
      notifier.state.entries.map((e) => e.sampleCode),
      ['A', 'B'],
      reason: 'losing the page already read would be worse than the failure',
    );
    expect(notifier.state.loadMoreError, isNotNull);
    expect(notifier.state.error, isNull, reason: 'the screen is not empty');
  });

  test('a first page failing takes over the screen', () async {
    final notifier = ScriptedHistory(const {}, failOn: 1);
    await pumpEventQueue();

    expect(notifier.state.error, isNotNull);
    expect(notifier.state.isLoadingFirst, isFalse);
  });

  test('a row repeated across a page boundary is only kept once', () async {
    // Offset pagination shifts when a scan lands at the head between requests.
    final notifier = ScriptedHistory({
      1: page(1, codes: ['A', 'B']),
      2: page(2, codes: ['B', 'C']),
    });
    await pumpEventQueue();

    await notifier.loadMore();

    expect(notifier.state.entries.map((e) => e.sampleCode), ['A', 'B', 'C']);
  });

  test('groups entries by the shift day the server filed them under',
      () async {
    final notifier = ScriptedHistory({
      1: ScanHistoryPage(
        page: 1,
        totalPages: 1,
        total: 3,
        shiftDate: '2026-09-22',
        entries: [
          WorkEntry(
            sampleCode: 'A',
            stageName: 'PREP BASAH',
            scannedAt: DateTime.utc(2026, 9, 22, 8),
            isCorrection: false,
            shiftDate: '2026-09-22',
          ),
          WorkEntry(
            sampleCode: 'B',
            stageName: 'PREP BASAH',
            scannedAt: DateTime.utc(2026, 9, 21, 20),
            isCorrection: false,
            shiftDate: '2026-09-21',
          ),
          WorkEntry(
            sampleCode: 'C',
            stageName: 'PREP BASAH',
            scannedAt: DateTime.utc(2026, 9, 21, 9),
            isCorrection: false,
            shiftDate: '2026-09-21',
          ),
        ],
      ),
    });
    await pumpEventQueue();

    expect(notifier.state.days.map((d) => d.shiftDate),
        ['2026-09-22', '2026-09-21']);
    expect(notifier.state.days.first.entries, hasLength(1));
    expect(notifier.state.days.last.entries.map((e) => e.sampleCode), ['B', 'C']);
  });

  test('flattens the days into headings followed by their scans', () async {
    final notifier = ScriptedHistory({
      1: page(1, codes: ['A', 'B'], totalPages: 1),
    });
    await pumpEventQueue();

    final rows = notifier.state.rows;

    expect(rows.first.isHeading, isTrue);
    expect(rows.first.shiftDate, '2026-09-22');
    expect(rows.map((r) => r.entry?.sampleCode), [null, 'A', 'B']);
    // The corners of the day card are carried by the rows now.
    expect(rows[1].isFirstOfDay, isTrue);
    expect(rows[1].isLastOfDay, isFalse);
    expect(rows[2].isLastOfDay, isTrue);
  });

  test('the flat index grows with the pages', () async {
    final notifier = ScriptedHistory({
      1: page(1, codes: ['A', 'B']),
      2: page(2, codes: ['C']),
    });
    await pumpEventQueue();
    expect(notifier.state.rows, hasLength(3)); // heading + 2

    await notifier.loadMore();

    expect(notifier.state.rows, hasLength(4)); // heading + 3
    expect(notifier.state.rows.last.entry?.sampleCode, 'C');
  });

  test('a refresh forgets what it deduped against', () async {
    // The dedup keys are kept on the notifier rather than rebuilt from every
    // accumulated row on each page. A reset therefore has to clear them, or
    // page one would dedup itself away the second time round.
    final notifier = ScriptedHistory({
      1: page(1, codes: ['A', 'B']),
      2: page(2, codes: ['C']),
    });
    await pumpEventQueue();
    await notifier.loadMore();

    await notifier.refresh();

    expect(notifier.state.entries.map((e) => e.sampleCode), ['A', 'B']);
  });

  group('appending a page instead of rebuilding everything', () {
    // _extend replaced a full rebuild of the day groups and the flat index on
    // every page. It has one sharp edge -- a shift day straddling the page
    // boundary -- and these pin it. The old code got that right by construction
    // because it always derived from scratch; the incremental version has to
    // earn it.

    test('matches a from-scratch derivation, whatever the pages look like',
        () async {
      // The equivalence test. _extend exists only to produce the same answer as
      // deriveRows without doing as much work, so this holds one against the
      // other -- covering the straddle, a new day at a boundary, and a page that
      // both continues a day and starts another, as one property.
      final notifier = ScriptedHistory({
        1: page(1, codes: ['A', 'B']),
        2: page(2, codes: ['C']),
        3: ScanHistoryPage(
          page: 3,
          totalPages: 3,
          total: 6,
          shiftDate: '2026-09-22',
          entries: [
            WorkEntry(
              sampleCode: 'D',
              stageName: 'PREP BASAH',
              scannedAt: DateTime.utc(2026, 9, 22, 8),
              isCorrection: false,
              shiftDate: '2026-09-22',
            ),
            WorkEntry(
              sampleCode: 'E',
              stageName: 'PREP BASAH',
              scannedAt: DateTime.utc(2026, 9, 21, 20),
              isCorrection: false,
              shiftDate: '2026-09-21',
            ),
            WorkEntry(
              sampleCode: 'F',
              stageName: 'PREP BASAH',
              scannedAt: DateTime.utc(2026, 9, 21, 9),
              isCorrection: false,
              shiftDate: '2026-09-21',
            ),
          ],
        ),
      });
      await pumpEventQueue();

      for (var p = 2; p <= 3; p++) {
        await notifier.loadMore();
        expect(
          shapeOf(notifier.state.rows),
          shapeOf(ScanHistoryNotifier.deriveRows(notifier.state.entries)),
          reason: 'the flat index diverged from its definition at page $p',
        );
      }
    });

    test('a day straddling the page boundary keeps one heading', () async {
      // page() files both pages under 2026-09-22, so this is the straddle. The
      // test that was already here asserted only the row COUNT, which a wrong
      // isLastOfDay sails straight past.
      final notifier = ScriptedHistory({
        1: page(1, codes: ['A', 'B']),
        2: page(2, codes: ['C']),
      });
      await pumpEventQueue();

      await notifier.loadMore();

      expect(
        shapeOf(notifier.state.rows),
        ['H:2026-09-22', 'S:A:F-', 'S:B:--', 'S:C:-L'],
        reason: 'B carried the day bottom corner until C arrived',
      );
    });

    test('a single-scan day that gains a second keeps its top corner',
        () async {
      // Why isFirstOfDay has to travel with the demoted tail row: A is both
      // first and last here, and only the last half may be taken away.
      final notifier = ScriptedHistory({
        1: page(1, codes: ['A']),
        2: page(2, codes: ['B']),
      });
      await pumpEventQueue();
      expect(shapeOf(notifier.state.rows), ['H:2026-09-22', 'S:A:FL']);

      await notifier.loadMore();

      expect(shapeOf(notifier.state.rows),
          ['H:2026-09-22', 'S:A:F-', 'S:B:-L']);
    });

    test('a new day at the boundary opens a group and closes the last one',
        () async {
      final notifier = ScriptedHistory({
        1: page(1, codes: ['A', 'B']),
        2: page(2, codes: ['C'], entryShiftDate: '2026-09-21'),
      });
      await pumpEventQueue();

      await notifier.loadMore();

      expect(shapeOf(notifier.state.rows), [
        'H:2026-09-22',
        'S:A:F-',
        'S:B:-L',
        'H:2026-09-21',
        'S:C:FL',
      ]);
    });

    test('rows the new page did not touch keep their identity', () async {
      // What makes the append cheap: untouched rows are carried over rather than
      // rebuilt. take(2) and not take(3) on purpose -- with page()'s straddling
      // default, row 2 is the tail that MUST change, because it is giving up the
      // day's bottom corner.
      final notifier = ScriptedHistory({
        1: page(1, codes: ['A', 'B']),
        2: page(2, codes: ['C']),
      });
      await pumpEventQueue();
      final before = notifier.state.rows.take(2).toList();

      await notifier.loadMore();

      expect(identical(notifier.state.rows[0], before[0]), isTrue);
      expect(identical(notifier.state.rows[1], before[1]), isTrue);
    });

    test('a page of nothing but duplicates changes nothing at all', () async {
      // Then the screen's select() record compares equal and it does not rebuild
      // at all, which is correct because nothing changed.
      final notifier = ScriptedHistory({
        1: page(1, codes: ['A', 'B']),
        2: page(2, codes: ['A', 'B']),
      });
      await pumpEventQueue();
      final rows = notifier.state.rows;
      final entries = notifier.state.entries;
      final days = notifier.state.days;

      await notifier.loadMore();

      expect(identical(notifier.state.rows, rows), isTrue);
      expect(identical(notifier.state.entries, entries), isTrue);
      expect(identical(notifier.state.days, days), isTrue);
      expect(notifier.state.loadedPages, 2, reason: 'the page still landed');
    });

    test('a refresh derives afresh rather than extending', () async {
      // refresh() has to keep going through the from-scratch path. Routing it
      // through _extend would append page one onto the rows it must replace.
      final notifier = ScriptedHistory({
        1: page(1, codes: ['A', 'B']),
        2: page(2, codes: ['C']),
      });
      await pumpEventQueue();
      await notifier.loadMore();
      final before = notifier.state.rows.first;

      await notifier.refresh();

      expect(shapeOf(notifier.state.rows),
          ['H:2026-09-22', 'S:A:F-', 'S:B:-L']);
      expect(
        identical(notifier.state.rows.first, before),
        isFalse,
        reason: 'nothing is carried over across a refresh',
      );
    });
  });

  group('the auto-load budget', () {
    // The screen used to fetch for as long as the operator kept scrolling, so
    // one long drag could pull the whole ninety-day window onto the phone. These
    // pin the brake. Everything here drives the notifier directly: the budget is
    // policy and has nothing to do with pixels, and routing it through a drag
    // would tie these tests to row height and viewport size, so a padding change
    // in the design system would break a paging test.

    test('auto-loading stops once the budget is spent', () async {
      final notifier = ScriptedHistory(scriptOf(25));
      await pumpEventQueue();

      await nudge(notifier);

      expect(
        notifier.requested,
        [for (var p = 1; p <= kScanHistoryAutoLoadPages; p++) p],
        reason: 'asked far more often than the budget allows; it must stop',
      );
      expect(notifier.state.isAutoLoadPaused, isTrue);
      expect(notifier.state.hasMore, isTrue, reason: 'paused, not finished');
    });

    test('an explicit tap grants a fresh budget', () async {
      final notifier = ScriptedHistory(scriptOf(25));
      await pumpEventQueue();
      await nudge(notifier);
      expect(notifier.state.isAutoLoadPaused, isTrue);

      await notifier.loadMore();

      expect(notifier.state.isAutoLoadPaused, isFalse);
      expect(notifier.state.autoLoadAnchor, kScanHistoryAutoLoadPages);

      await nudge(notifier);

      // Twenty exactly, not "more than ten": an anchor moved when the page LANDS
      // rather than when the request starts drifts by one, and only a terminal
      // count catches that.
      expect(notifier.state.loadedPages, kScanHistoryAutoLoadPages * 2);
      expect(notifier.state.isAutoLoadPaused, isTrue);
    });

    test('a refresh resets the budget', () async {
      final notifier = ScriptedHistory(scriptOf(25));
      await pumpEventQueue();

      // The tap is what makes this test mean anything, and it was missing the
      // first time: the anchor starts at zero, so refreshing from a budget that
      // had never been renewed left it at zero either way and the assertion
      // below passed against a refresh that reset nothing. A mutation run caught
      // it. Tapping first puts the anchor at ten, so a refresh that forgets to
      // clear it leaves one page measured against a stale ten -- a difference of
      // minus nine, which is also not paused, quietly handing over nineteen free
      // pages instead of ten.
      await nudge(notifier);
      await notifier.loadMore();
      await nudge(notifier);
      expect(notifier.state.autoLoadAnchor, kScanHistoryAutoLoadPages);

      await notifier.refresh();
      await nudge(notifier);

      // The assertion has to be the terminal loadedPages. Checking only
      // `autoLoadAnchor == 0`, or only that nine more pages arrived, both pass
      // against the mutation that matters: leave the anchor at a stale ten while
      // loadedPages is back to one and the difference is minus nine, which is
      // ALSO not paused -- so the operator silently gets nineteen free pages.
      expect(notifier.state.loadedPages, kScanHistoryAutoLoadPages);
      expect(notifier.state.isAutoLoadPaused, isTrue);
    });

    test('the end of the window is an ending, not a pause', () async {
      final notifier = ScriptedHistory(scriptOf(kScanHistoryAutoLoadPages));
      await pumpEventQueue();

      await nudge(notifier);

      expect(notifier.state.hasMore, isFalse);
      expect(
        notifier.state.isAutoLoadPaused,
        isFalse,
        reason: 'the page difference is exactly the budget here, so this is the '
            'one state that catches dropping the hasMore conjunct -- and with '
            'it dropped the footer offers a button whose tap does nothing',
      );
    });

    test('a duplicate page still spends budget', () async {
      // Offset pagination repeats a row whenever a fresh scan lands at the head
      // between two requests, and a page that is entirely duplicates adds no
      // rows at all. Anchored on a row count the ceiling would not exist for a
      // window like this.
      final notifier = ScriptedHistory({
        1: page(1, codes: ['A']),
        2: page(2, codes: ['A']),
      });
      await pumpEventQueue();
      final rowsBefore = notifier.state.rows;

      await notifier.loadMoreAutomatically();

      expect(identical(notifier.state.rows, rowsBefore), isTrue,
          reason: 'nothing new arrived');
      expect(notifier.state.loadedPages - notifier.state.autoLoadAnchor, 2,
          reason: 'but the round trip was charged for');
    });

    test('the offline cache page never claims there is more', () async {
      // ScanHistoryPage.fromCache is the production shape; built by hand here so
      // the test does not need a WorkSummary.
      final notifier = ScriptedHistory({
        1: ScanHistoryPage(
          page: 1,
          totalPages: 1,
          total: 1,
          shiftDate: '2026-09-22',
          isFromCache: true,
          entries: [
            WorkEntry(
              sampleCode: 'A',
              stageName: 'PREP BASAH',
              scannedAt: DateTime.utc(2026, 9, 22, 8),
              isCorrection: false,
              shiftDate: '2026-09-22',
            ),
          ],
        ),
      });
      await pumpEventQueue();

      await nudge(notifier);

      expect(notifier.state.hasMore, isFalse);
      expect(notifier.state.isAutoLoadPaused, isFalse);
      expect(notifier.requested, [1], reason: 'there is nowhere to go offline');
    });

    test('a failed page stops the scroll trigger from retrying', () async {
      // Before this, loadMoreError stayed set while the list still had more, so
      // the next scroll frame retried against a network that had just failed --
      // every frame, for as long as the operator stayed near the bottom.
      final notifier = ScriptedHistory(
        {1: page(1, codes: ['A'])},
        failOn: 2,
      );
      await pumpEventQueue();

      await notifier.loadMoreAutomatically();
      expect(notifier.state.loadMoreError, isNotNull);
      final afterFailure = List<int>.of(notifier.requested);

      await nudge(notifier);

      expect(notifier.requested, afterFailure,
          reason: 'the automatic path must not hammer a failed connection');
    });

    test('the button still asks after a failure', () async {
      // The other half of the branch above: declining the automatic path must
      // not also block the operator, because the footer's error branch is the
      // only way forward. ScriptedHistory records the request before it decides
      // to fail, so a second entry for page two is proof the explicit path was
      // not gated by loadMoreError.
      final notifier = ScriptedHistory(
        {1: page(1, codes: ['A'])},
        failOn: 2,
      );
      await pumpEventQueue();
      await notifier.loadMoreAutomatically();
      expect(notifier.requested, [1, 2]);

      await notifier.loadMore();

      expect(notifier.requested, [1, 2, 2]);
    });
  });
}
