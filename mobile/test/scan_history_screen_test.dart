import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/models/work_summary.dart';
import 'package:atara/providers/scan_history_provider.dart';
import 'package:atara/screens/scan_history_screen.dart';
import 'package:atara/theme/app_theme.dart';

import 'support/finders.dart';
import 'support/scan_history_fixtures.dart';

/// The gap that let a render error ship.
///
/// This screen had provider tests and no widget test at all, so nothing ever
/// built it. Its first-load branch handed a sliver — `MyWorkSkeleton`, which
/// resolves to `SliverMainAxisGroup` — to `LoadingSwap`, whose `AnimatedSwitcher`
/// wraps its child in a `Stack` and a `FadeTransition`. `RenderAnimatedOpacity`
/// only takes a `RenderBox`, so the tree threw at mount, Flutter healed it with
/// an `ErrorWidget`, and the operator got a grey slab a hundred thousand pixels
/// tall for as long as the request took.
///
/// Any test that merely pumps this screen catches that: the exception reaches
/// `takeException()` and fails the test at teardown even with no assertion.

Future<void> pumpHistory(
  WidgetTester tester,
  ScanHistoryNotifier notifier, {
  Locale locale = const Locale('id'),
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [scanHistoryProvider.overrideWith((ref) => notifier)],
      child: MaterialApp(
        locale: locale,
        theme: AppTheme.light,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Builder(
          // The skeleton pulse repeats for ever, so pumpAndSettle would hang
          // here. Turning motion off is both what a test needs and what the
          // widget already honours.
          builder: (context) => MediaQuery(
            data: MediaQuery.of(context).copyWith(disableAnimations: true),
            child: const ScanHistoryScreen(),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

ScanHistoryPage daysOf(int days, {int perDay = 3}) {
  return ScanHistoryPage(
    page: 1,
    totalPages: 1,
    total: days * perDay,
    shiftDate: '2026-09-22',
    entries: [
      for (var d = 0; d < days; d++)
        for (var i = 0; i < perDay; i++)
          WorkEntry(
            sampleCode: 'SMPL-$d-$i',
            stageName: 'PREP BASAH',
            scannedAt: DateTime.utc(2026, 9, 22 - d, 8, i),
            isCorrection: false,
            shiftDate: '2026-09-${(22 - d).toString().padLeft(2, '0')}',
          ),
    ],
  );
}

void main() {
  testWidgets('builds its first load without throwing', (tester) async {
    // hold: true parks the notifier in exactly the broken branch —
    // isLoadingFirst true, no entries — and keeps it there.
    await pumpHistory(tester, ScriptedHistory(const {}, hold: true));

    expect(
      tester.takeException(),
      isNull,
      reason: 'a sliver in a box slot throws at mount and paints an ErrorWidget',
    );
  });

  testWidgets('shows a skeleton while the first page is in flight',
      (tester) async {
    await pumpHistory(tester, ScriptedHistory(const {}, hold: true));

    // Both halves matter: the first assertion alone would also pass on a
    // screen that rendered nothing at all.
    expect(find.byType(ErrorWidget), findsNothing);
    expect(anyBusyIndicator, findsWidgets);
  });

  testWidgets('groups what it loads under day headers', (tester) async {
    await pumpHistory(
      tester,
      ScriptedHistory({
        1: ScanHistoryPage(
          page: 1,
          totalPages: 1,
          total: 2,
          shiftDate: '2026-09-22',
          entries: [
            WorkEntry(
              sampleCode: 'SMPL-2026-00001',
              stageName: 'PREP BASAH',
              scannedAt: DateTime.utc(2026, 9, 22, 8),
              isCorrection: false,
              shiftDate: '2026-09-22',
            ),
            WorkEntry(
              sampleCode: 'SMPL-2026-00002',
              stageName: 'PREP BASAH',
              scannedAt: DateTime.utc(2026, 9, 21, 20),
              isCorrection: false,
              shiftDate: '2026-09-21',
            ),
          ],
        ),
      }),
    );
    await tester.pump();

    expect(tester.takeException(), isNull);
    // Section headings are upper-cased by the design system.
    expect(find.text('Hari ini'.toUpperCase()), findsOneWidget);
    expect(find.text('Kemarin'.toUpperCase()), findsOneWidget);
    expect(find.text('SMPL-2026-00001'), findsOneWidget);
  });

  testWidgets('says so when there is nothing to show', (tester) async {
    await pumpHistory(
      tester,
      ScriptedHistory({
        1: const ScanHistoryPage(
          page: 1,
          totalPages: 1,
          total: 0,
          shiftDate: '2026-09-22',
          entries: [],
        ),
      }),
    );
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.text('Belum ada riwayat'), findsOneWidget);
  });

  testWidgets('offers a way back when the first page fails', (tester) async {
    await pumpHistory(tester, ScriptedHistory(const {}, failOn: 1));
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.text('Coba Lagi'), findsOneWidget);
  });

  testWidgets('reads in English too', (tester) async {
    await pumpHistory(
      tester,
      ScriptedHistory({
        1: const ScanHistoryPage(
          page: 1,
          totalPages: 1,
          total: 0,
          shiftDate: '2026-09-22',
          entries: [],
        ),
      }),
      locale: const Locale('en'),
    );
    await tester.pump();

    expect(find.text('No history yet'), findsOneWidget);
  });

  testWidgets('renders every day through one list, however many there are',
      (tester) async {
    // The fix, as a property. Each day used to get its own top-level sliver,
    // and a viewport lays out every sliver above the fold on every frame --
    // so scrolling got heavier the further down you went. One list does work
    // proportional to what is on screen; thirty days must not mean thirty
    // slivers.
    tester.view.physicalSize = const Size(400 * 3, 2400 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    await pumpHistory(tester, ScriptedHistory({1: daysOf(30)}));
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(
      find.byType(SliverList),
      findsOneWidget,
      reason: 'one list for the whole history, not one per day',
    );
  });

  testWidgets('keeps the day headings when flattened', (tester) async {
    tester.view.physicalSize = const Size(400 * 3, 2400 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    await pumpHistory(tester, ScriptedHistory({1: daysOf(3)}));
    await tester.pump();

    // Flattening is an implementation change, not a visual one.
    expect(find.text('Hari ini'.toUpperCase()), findsOneWidget);
    expect(find.text('Kemarin'.toUpperCase()), findsOneWidget);
    expect(find.text('SMPL-0-0'), findsOneWidget);
    expect(find.text('SMPL-2-2'), findsOneWidget);
  });

  group('the way forward when scrolling will not do it', () {
    // A twenty-row page is about 1300 logical pixels, so a tall phone or a
    // tablet can hold the whole first page with nothing left to scroll -- and the
    // auto-load budget now stops fetching on purpose, which is a state the
    // operator is MEANT to leave by tapping. Neither was reachable before,
    // because the footer only ever offered its button after a failure.

    testWidgets('offers the button when the list is shorter than the viewport',
        (tester) async {
      // Nothing is scrolled here, and that is the whole point of the test.
      //
      // A drag-based version would pass against the OLD branch order too:
      // AppPage uses AlwaysScrollableScrollPhysics, so a list shorter than the
      // screen is still draggable and the trigger still fires. Reachable by a
      // gesture nothing on screen suggests is the same as absent, so the honest
      // assertion is that the button is simply there.
      await pumpHistory(
        tester,
        ScriptedHistory({
          1: page(1, codes: ['A', 'B'], totalPages: 3),
          2: page(2, codes: ['C'], totalPages: 3),
        }),
      );
      await tester.pump();

      expect(find.text('Muat lagi'), findsOneWidget);
    });

    testWidgets('the button actually fetches', (tester) async {
      final notifier = ScriptedHistory({
        1: page(1, codes: ['A', 'B'], totalPages: 3),
        2: page(2, codes: ['C'], totalPages: 3),
      });
      await pumpHistory(tester, notifier);
      await tester.pump();

      await tester.tap(find.text('Muat lagi'));
      await tester.pump();

      expect(notifier.requested, [1, 2]);
    });

    testWidgets('a paused list offers the button, not the end of the window',
        (tester) async {
      // Driven to the pause before pumping: the budget is policy, and reaching it
      // through gestures would tie this to row height and viewport size.
      // scriptOf(11) rather than (10) so hasMore is genuinely true at the pause.
      // Tall enough that the footer is actually built: ten rows plus a heading
      // and the nav bar overflow the default 800x600 view, and a sliver below
      // the fold is not in the tree to be found.
      tester.view.physicalSize = const Size(400 * 3, 2400 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);

      //
      // runAsync, and it is not optional: testWidgets runs under FakeAsync, so
      // awaiting a real Future before anything has pumped simply never returns.
      // The paging tests can await freely because they are plain `test`s.
      final notifier = ScriptedHistory(scriptOf(11));
      await tester.runAsync(() async {
        await pumpEventQueue();
        await nudge(notifier);
      });
      expect(notifier.state.isAutoLoadPaused, isTrue);

      await pumpHistory(tester, notifier);
      await tester.pump();

      expect(find.text('Muat lagi'), findsOneWidget);
      expect(
        find.text('Riwayat mencakup 90 hari shift terakhir.'),
        findsNothing,
        reason: 'paused is not finished, and the footer must not say otherwise',
      );
    });

    testWidgets('the end of the window says so, with no button', (tester) async {
      await pumpHistory(tester, ScriptedHistory(scriptOf(1)));
      await tester.pump();

      expect(find.text('Riwayat mencakup 90 hari shift terakhir.'), findsOneWidget);
      expect(find.text('Muat lagi'), findsNothing);
    });

    testWidgets('an offline page offers no button it could not honour',
        (tester) async {
      await pumpHistory(
        tester,
        ScriptedHistory({
          1: ScanHistoryPage(
            page: 1,
            totalPages: 1,
            total: 1,
            shiftDate: '2026-09-22',
            isFromCache: true,
            entries: [
              WorkEntry(
                sampleCode: 'SMPL-2026-00001',
                stageName: 'PREP BASAH',
                scannedAt: DateTime.utc(2026, 9, 22, 8),
                isCorrection: false,
                shiftDate: '2026-09-22',
              ),
            ],
          ),
        }),
      );
      await tester.pump();

      expect(find.text('Hari sebelumnya butuh koneksi ke server.'), findsWidgets);
      expect(find.text('Muat lagi'), findsNothing);
    });

    /// A first page long enough to overflow the test view, with more to come.
    ///
    /// Forty rows rather than the production twenty: a widget fixture only has to
    /// make the list taller than 800x600, and the page size is not what these two
    /// tests are about.
    ScriptedHistory scrollableHistory() => ScriptedHistory({
          1: ScanHistoryPage(
            page: 1,
            totalPages: 3,
            total: 120,
            shiftDate: '2026-09-22',
            entries: [
              for (var i = 0; i < 40; i++)
                WorkEntry(
                  sampleCode: 'SMPL-$i',
                  stageName: 'PREP BASAH',
                  scannedAt: DateTime.utc(2026, 9, 22, 8, 0, i),
                  isCorrection: false,
                  shiftDate: '2026-09-22',
                ),
            ],
          ),
          2: page(2, codes: ['Z'], totalPages: 3),
        });

    /// The live scroll position, so a test can talk about where it actually is
    /// rather than how many pixels it asked for.
    ///
    /// Reading `extentAfter` is what keeps these tests independent of row height,
    /// nav-bar extent and footer height — the geometry a design-system padding
    /// change would shift underneath a hardcoded distance.
    ScrollPosition positionOf(WidgetTester tester) =>
        tester.state<ScrollableState>(find.byType(Scrollable).first).position;

    /// Drags with the pointer held down until [target] pixels of list remain
    /// below, landing ON that figure rather than somewhere past it.
    ///
    /// The final step is shortened to exactly what is left, and that precision is
    /// the whole point. A first version moved a fixed 200px at a time and stopped
    /// at the first reading under its target, so it came to rest anywhere in a
    /// 200px band — wide enough that it straddled the old 400px lead and the new
    /// 64px one alike, and the test passed against both. A mutation run is what
    /// exposed it.
    Future<void> dragUntilExtentAfter(
      WidgetTester tester,
      TestGesture gesture,
      double target, {
      int maxMoves = 200,
    }) async {
      for (var move = 0; move < maxMoves; move++) {
        final remaining = positionOf(tester).extentAfter;
        if (remaining <= target) return;
        await gesture.moveBy(Offset(0, -math.min(200.0, remaining - target)));
        await tester.pump();
      }
    }

    testWidgets('reaching the bottom is what asks for the next page',
        (tester) async {
      // What pins the NotificationListener, its threshold arithmetic and the
      // `return false` that keeps pull-to-refresh alive.
      final notifier = scrollableHistory();
      await pumpHistory(tester, notifier);
      await tester.pump();
      expect(notifier.requested, [1]);

      // The pointer is held down throughout and the assertion made before it
      // lifts. A bare tester.drag would leave a ballistic scroll running, and its
      // ticker would still be unfinished at teardown — which also means the
      // overscroll bounce must not be what saves this test.
      //
      // Dragged until genuinely at the bottom rather than a fixed number of
      // moves. `_loadMoreLead` is one row now, so a fixed count would leave a
      // margin of a single move and a padding change in the design system would
      // break a paging test. The loop bound only stops a runaway.
      final gesture = await tester.startGesture(
        tester.getCenter(find.byType(CustomScrollView)),
      );
      await dragUntilExtentAfter(tester, gesture, 0);

      // Asserted before the interesting one: without this, a test that simply
      // failed to reach the bottom would look like a passing threshold test.
      expect(
        positionOf(tester).extentAfter,
        lessThanOrEqualTo(0),
        reason: 'the drag has to actually arrive, or the next expectation is '
            'about nothing',
      );
      expect(notifier.requested, contains(2));

      await gesture.up();
      await tester.pump();
      // A long single pump drains the bouncing overscroll simulation. Settling
      // is not used here: this screen has repeating animations elsewhere and
      // pumpAndSettle hangs on them.
      await tester.pump(const Duration(seconds: 2));
    });

    testWidgets('scrolling part of the way asks for nothing', (tester) async {
      // The property the whole change exists for: nothing is fetched until the
      // operator has arrived.
      //
      // 250 is chosen to sit inside the old 400px lead and outside the new 64px
      // one, which is what makes this catch a regression rather than restate the
      // code. Against a 400px lead the request fires here and this fails.
      //
      // What it deliberately does NOT pin: why the lead is not zero. That
      // reasoning is about the ballistic spring settling a third of a pixel
      // inside the boundary on a real device, and a test that drags to an exact
      // offset cannot express it. It lives in the doc comment on _loadMoreLead
      // instead, and a lead of zero would pass both of these tests.
      final notifier = scrollableHistory();
      await pumpHistory(tester, notifier);
      await tester.pump();

      final gesture = await tester.startGesture(
        tester.getCenter(find.byType(CustomScrollView)),
      );
      await dragUntilExtentAfter(tester, gesture, 250);

      expect(
        positionOf(tester).extentAfter,
        closeTo(250, 1),
        reason: 'the drag must stop where it was told, or this proves nothing',
      );
      expect(
        notifier.requested,
        [1],
        reason: 'the operator has not arrived, so nothing should have been asked '
            'for',
      );

      await gesture.up();
      await tester.pump();
      await tester.pump(const Duration(seconds: 2));
    });
  });
}
