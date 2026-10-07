import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/work_summary.dart';
import '../services/api_exception.dart';
import '../services/api_service.dart';

/// One shift day of scans, with the day the server filed them under.
class ScanDay {
  const ScanDay({required this.shiftDate, required this.entries});

  final String shiftDate;
  final List<WorkEntry> entries;
}

/// One line of the history list: a day heading, or a scan under it.
///
/// Flat on purpose, and this is the whole performance story of the screen.
/// Rendering a sliver per day put ninety of them in one viewport, and a
/// viewport lays out every sliver above the fold on every frame — so the cost
/// grew with how far the operator had scrolled, which is exactly what "it gets
/// heavier the longer I scroll" feels like. One SliverList over this list does
/// work proportional to what is on screen instead.
@immutable
class ScanHistoryRow {
  const ScanHistoryRow.heading(String this.shiftDate)
      : entry = null,
        isFirstOfDay = false,
        isLastOfDay = false;

  const ScanHistoryRow.scan(
    WorkEntry this.entry, {
    required this.isFirstOfDay,
    required this.isLastOfDay,
  }) : shiftDate = null;

  /// Set on a heading; null on a scan.
  final String? shiftDate;

  /// Set on a scan; null on a heading.
  final WorkEntry? entry;

  /// Where in its day this scan sits. The card is painted per row now rather
  /// than once per sliver, so these are what round the top and bottom corners.
  final bool isFirstOfDay;
  final bool isLastOfDay;

  bool get isHeading => entry == null;
}

@immutable
class ScanHistoryState {
  const ScanHistoryState({
    this.entries = const [],
    this.days = const [],
    this.rows = const [],
    this.shiftDate = '',
    this.total = 0,
    this.loadedPages = 0,
    this.totalPages = 1,
    this.isLoadingFirst = true,
    this.isLoadingMore = false,
    this.error,
    this.loadMoreError,
    this.isFromCache = false,
    this.autoLoadAnchor = 0,
  });

  final List<WorkEntry> entries;

  /// The same entries, grouped. Derived once when [entries] changes rather than
  /// in build.
  final List<ScanDay> days;

  /// The same entries again, flattened into what the list actually renders.
  ///
  /// Built here so its identity only changes when the entries do — which is
  /// what lets the screen watch this alone and stop rebuilding itself when a
  /// paging flag flips mid-gesture.
  final List<ScanHistoryRow> rows;

  /// The server's current shift day, so the screen can name a group "today"
  /// without asking the handset what day it is.
  final String shiftDate;

  final int total;
  final int loadedPages;
  final int totalPages;
  final bool isLoadingFirst;
  final bool isLoadingMore;

  /// A first-page failure, with nothing to show behind it.
  final ApiException? error;

  /// A later page failing, with rows already on screen.
  final ApiException? loadMoreError;

  final bool isFromCache;

  /// The [loadedPages] value at the last time the operator ASKED for a page.
  ///
  /// Auto-loading may run [kScanHistoryAutoLoadPages] past this and then stops
  /// until asked again. Zero after a first load or a refresh, both of which are
  /// themselves explicit requests.
  final int autoLoadAnchor;

  bool get hasMore => loadedPages > 0 && loadedPages < totalPages;

  /// True when the list has grown as far as it may without being asked again.
  ///
  /// The screen used to fetch on its own for as long as the operator kept
  /// scrolling, so one long drag could pull the whole ninety-day window onto the
  /// phone. This is the brake, and it is deliberately NOT a brake on rendering —
  /// nothing is ever removed from the list, and a pause is only a refusal to
  /// append, which by construction cannot shift a row that is already laid out.
  ///
  /// **Counted in pages, not rows.** A page of nothing but duplicates advances
  /// [loadedPages] and adds no rows at all (see the `added.isEmpty` branch in
  /// `_load`). Anchored on a row count, such a page would cost nothing — and a
  /// duplicate-heavy window, which is exactly what offset pagination produces
  /// when fresh scans keep landing at the head, would auto-load for ever without
  /// pausing once. Anchored on pages, the round trip is charged for, which is
  /// the honest accounting: what this bounds is requests and appends, not rows.
  /// A row count would also drift with how many shift days the window spans,
  /// since `rows` carries a heading per day.
  ///
  /// The [hasMore] conjunct is load-bearing. Without it, a window whose last
  /// page happens to land on the budget boundary would report itself paused, the
  /// footer would offer "Muat lagi" instead of saying the history ends here, and
  /// the tap would do nothing because [ScanHistoryNotifier.loadMore]'s own guard
  /// refuses once there is no more. The offline cache page is the same shape from
  /// the other direction — it arrives as `totalPages: 1`, so `hasMore` is false
  /// and this can never claim there is more to fetch than there is.
  bool get isAutoLoadPaused =>
      hasMore && loadedPages - autoLoadAnchor >= kScanHistoryAutoLoadPages;

  ScanHistoryState copyWith({
    List<WorkEntry>? entries,
    List<ScanDay>? days,
    List<ScanHistoryRow>? rows,
    String? shiftDate,
    int? total,
    int? loadedPages,
    int? totalPages,
    bool? isLoadingFirst,
    bool? isLoadingMore,
    ApiException? error,
    ApiException? loadMoreError,
    bool? isFromCache,
    int? autoLoadAnchor,
    bool clearError = false,
    bool clearLoadMoreError = false,
  }) {
    return ScanHistoryState(
      entries: entries ?? this.entries,
      days: days ?? this.days,
      rows: rows ?? this.rows,
      shiftDate: shiftDate ?? this.shiftDate,
      total: total ?? this.total,
      loadedPages: loadedPages ?? this.loadedPages,
      totalPages: totalPages ?? this.totalPages,
      isLoadingFirst: isLoadingFirst ?? this.isLoadingFirst,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      error: clearError ? null : (error ?? this.error),
      loadMoreError: clearLoadMoreError ? null : (loadMoreError ?? this.loadMoreError),
      isFromCache: isFromCache ?? this.isFromCache,
      autoLoadAnchor: autoLoadAnchor ?? this.autoLoadAnchor,
    );
  }
}

/// The operator's own scans, accumulated a page at a time.
class ScanHistoryNotifier extends StateNotifier<ScanHistoryState> {
  ScanHistoryNotifier() : super(const ScanHistoryState()) {
    _load(1, replace: true);
  }

  /// The one network call, isolated so a test can subclass and answer it.
  ///
  /// ApiService.instance is a singleton with no injection point, which is why
  /// the existing tests reach for a notifier subclass rather than a fake
  /// client. The logic worth testing is everything around this line.
  @protected
  @visibleForTesting
  Future<ScanHistoryPage> fetchPage(int page) =>
      ApiService.instance.getMyScanHistory(page: page);

  /// Starts again from page one without emptying the screen on the way.
  ///
  /// Collapsing several loaded pages back to one is the honest answer to a
  /// refresh, and the pull gesture has put the operator at the top anyway.
  /// What it must not do is blank the list while the request is in flight —
  /// the detail screen has a post-mortem of exactly that mistake.
  Future<void> refresh() => _load(1, replace: true);

  /// The operator asking, by tap. Grants a fresh auto-load budget.
  ///
  /// The anchor is moved when the request STARTS rather than when the page
  /// lands, so a tap that fails over the network still leaves the budget
  /// granted: the error branches below copyWith without it. The operator asked;
  /// a dead connection should not also cost them their budget.
  Future<void> loadMore() => _requestNextPage(anchor: state.loadedPages);

  /// The scroll trigger asking, which happens on every frame near the bottom.
  ///
  /// A method of its own rather than `loadMore({bool automatic})`, and the
  /// reason is concrete: the in-flight guard stays exactly where it is and is
  /// inherited here for free by delegating. A parameter would put the budget
  /// check inside the guarded method and make "explicit" the default, so any
  /// caller that forgot the flag would silently grant a fresh budget — and the
  /// failure mode would be the ceiling quietly not existing.
  ///
  /// It also declines after a failure. Before this existed, a failed page left
  /// `loadMoreError` set while the list still had more, so the very next scroll
  /// frame retried — against a network that had just failed, every frame, for as
  /// long as the operator stayed near the bottom. The footer offers the button
  /// for that, and [loadMore] is not gated by the error, so the way forward is
  /// intact and now deliberate.
  Future<void> loadMoreAutomatically() {
    if (state.isAutoLoadPaused) return Future.value();
    if (state.loadMoreError != null) return Future.value();
    return _requestNextPage(anchor: null);
  }

  /// The one place a next page is asked for, and the one place the in-flight
  /// guard lives.
  ///
  /// It exists because the first version had [loadMoreAutomatically] delegate to
  /// [loadMore] to inherit this guard — and [loadMore] is what GRANTS the budget,
  /// so every automatic page renewed it too. The anchor tracked `loadedPages`,
  /// the difference never grew past one, and the ceiling was code that could
  /// never fire. Splitting the guard out is what lets the two entry points share
  /// it without sharing the grant.
  ///
  /// A null [anchor] leaves the existing one alone, which is how spending the
  /// budget differs from renewing it.
  Future<void> _requestNextPage({required int? anchor}) {
    if (state.isLoadingMore || !state.hasMore) return Future.value();
    return _load(state.loadedPages + 1, replace: false, anchor: anchor);
  }

  Future<void> _load(int page, {required bool replace, int? anchor}) async {
    state = replace
        // A refresh is itself an explicit request, and resetting to zero rather
        // than to loadedPages is what makes the first screenful behave like
        // every other: loadedPages is 1 after a replace, so 1 - 0 leaves nine
        // free pages, the same budget any tap grants.
        ? state.copyWith(
            clearError: true,
            clearLoadMoreError: true,
            autoLoadAnchor: 0,
          )
        : state.copyWith(
            isLoadingMore: true,
            clearLoadMoreError: true,
            autoLoadAnchor: anchor,
          );

    try {
      final result = await fetchPage(page);
      // autoDispose means the screen being popped mid-request is the ordinary
      // case, not the rare one, and a StateNotifier throws if its state is set
      // after it is disposed.
      if (!mounted) return;

      final List<WorkEntry> entries;
      final List<ScanDay> days;
      final List<ScanHistoryRow> rows;

      if (replace) {
        entries = _replace(result.entries);
        days = _group(entries);
        rows = _flatten(days);
      } else {
        // Deduped first, so `added` is exactly what is new. Offset pagination
        // can repeat a row when a scan lands at the head between two requests;
        // the alternative — a cursor — costs the total that tells the screen
        // when to stop.
        final added = result.entries
            .where((entry) => _seen.add(_keyOf(entry)))
            .toList(growable: false);

        if (added.isEmpty) {
          // A page that was entirely duplicates. Carrying the existing lists
          // over by identity means the screen's select() record compares equal
          // and it does not rebuild at all — correct, because nothing changed.
          // The footer still updates through its own Consumer, because
          // loadedPages and therefore hasMore did change.
          entries = state.entries;
          days = state.days;
          rows = state.rows;
        } else {
          entries = [...state.entries, ...added];
          final derived = _extend(
            days: state.days,
            rows: state.rows,
            added: added,
          );
          days = derived.days;
          rows = derived.rows;
        }
      }

      state = state.copyWith(
        entries: entries,
        days: days,
        rows: rows,
        shiftDate: result.shiftDate,
        total: result.total,
        loadedPages: page,
        totalPages: result.totalPages,
        isLoadingFirst: false,
        isLoadingMore: false,
        isFromCache: result.isFromCache,
        clearError: true,
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      state = replace
          // Only a first load with nothing behind it takes over the screen. A
          // refresh that fails keeps the rows it already had.
          ? state.copyWith(
              isLoadingFirst: false,
              error: state.entries.isEmpty ? error : null,
              loadMoreError: state.entries.isEmpty ? null : error,
            )
          : state.copyWith(isLoadingMore: false, loadMoreError: error);
    } catch (error) {
      if (!mounted) return;
      state = state.copyWith(
        isLoadingFirst: false,
        isLoadingMore: false,
        error: state.entries.isEmpty ? const ApiException('') : null,
      );
    }
  }

  /// Every key already accumulated, kept rather than rebuilt.
  ///
  /// Recomputing this from scratch on every page meant formatting an ISO
  /// timestamp for all nine hundred rows already loaded — on the UI isolate, at
  /// the moment the operator was dragging towards the bottom.
  final Set<String> _seen = {};

  static String _keyOf(WorkEntry entry) =>
      '${entry.sampleCode}|${entry.scannedAt.toIso8601String()}';

  List<WorkEntry> _replace(List<WorkEntry> entries) {
    _seen
      ..clear()
      ..addAll(entries.map(_keyOf));
    return entries;
  }

  /// Extends the day groups and the flat index with one page's worth of
  /// entries.
  ///
  /// Both derived lists used to be rebuilt from the whole accumulated set on
  /// every page. At nine hundred rows that allocated a fresh [ScanHistoryRow]
  /// for every row already on screen, a fresh sublist per day and a fresh outer
  /// list built through nested spreads — order of eighty kilobytes of
  /// young-generation garbage in one synchronous burst, on the UI isolate, at
  /// the moment the operator was dragging towards the bottom. The burst grew
  /// linearly with how far down they had got, which made it the one thing left
  /// in this screen that got heavier the longer you scrolled.
  ///
  /// The only part of the existing structure an append can touch is its TAIL,
  /// and only when a shift day straddles the page boundary — page p ending with
  /// three scans of one day and page p+1 opening with seven more. Then the last
  /// [ScanDay] has to be EXTENDED rather than a second group started, no second
  /// heading may be emitted, and the row that carried [ScanHistoryRow.isLastOfDay]
  /// has to give it up while the new final row takes it. Get that wrong and the
  /// day card splits in two mid-day: a rounded corner and a missing hairline
  /// appear in the middle of a run of scans. Everything before that tail is
  /// carried over by reference.
  ///
  /// Copy-on-write, never in place, and this is the invariant that keeps the
  /// shared mutability in [_group] safe: _group mutates the sublists it has just
  /// created and still owns, and its result is published only afterwards. This
  /// function extends structures that are ALREADY published on the state the
  /// screen is currently showing, so it replaces the straddling day rather than
  /// growing it. Nothing mutates a [ScanDay] after it has been handed to a
  /// [ScanHistoryState].
  ///
  /// The two outer list copies stay O(n), and they have to. Mutating the
  /// published lists in place would leave `rows` with its existing identity, so
  /// the screen's select() would compare equal, the screen would not rebuild,
  /// nothing would mark the sliver needing layout, and the new rows would never
  /// appear.
  static ({List<ScanDay> days, List<ScanHistoryRow> rows}) _extend({
    required List<ScanDay> days,
    required List<ScanHistoryRow> rows,
    required List<WorkEntry> added,
  }) {
    final addedDays = _group(added);
    final newDays = List<ScanDay>.of(days);
    final newRows = List<ScanHistoryRow>.of(rows);

    var first = 0;
    if (newDays.isNotEmpty &&
        addedDays.first.shiftDate == newDays.last.shiftDate) {
      final carry = newDays.removeLast();
      final continuation = addedDays.first;
      newDays.add(
        ScanDay(
          shiftDate: carry.shiftDate,
          entries: [...carry.entries, ...continuation.entries],
        ),
      );

      // The row that used to end the day stops ending it. isFirstOfDay has to
      // travel with it, or a day holding a single scan loses its top corner the
      // moment a second one arrives.
      //
      // The last row of a day is always a scan, never a heading: _group never
      // produces an empty ScanDay, so _flatten always emits at least one scan
      // after each heading.
      final tail = newRows.removeLast();
      newRows.add(
        ScanHistoryRow.scan(
          tail.entry!,
          isFirstOfDay: tail.isFirstOfDay,
          isLastOfDay: false,
        ),
      );

      for (var i = 0; i < continuation.entries.length; i++) {
        newRows.add(
          ScanHistoryRow.scan(
            continuation.entries[i],
            isFirstOfDay: false,
            isLastOfDay: i == continuation.entries.length - 1,
          ),
        );
      }
      first = 1;
    }

    for (var d = first; d < addedDays.length; d++) {
      final day = addedDays[d];
      newDays.add(day);
      newRows.add(ScanHistoryRow.heading(day.shiftDate));
      for (var i = 0; i < day.entries.length; i++) {
        newRows.add(
          ScanHistoryRow.scan(
            day.entries[i],
            isFirstOfDay: i == 0,
            isLastOfDay: i == day.entries.length - 1,
          ),
        );
      }
    }

    return (days: newDays, rows: newRows);
  }

  /// The from-scratch derivation, kept reachable because it is the DEFINITION of
  /// correct here: [_extend] exists only to produce this answer without doing
  /// this much work. A test holds one against the other.
  @visibleForTesting
  static List<ScanHistoryRow> deriveRows(List<WorkEntry> entries) =>
      _flatten(_group(entries));

  /// Turns the day groups into the flat list the screen renders.
  ///
  /// Serves the replace path — page one and refresh — where it is already
  /// O(page). Appends go through [_extend].
  static List<ScanHistoryRow> _flatten(List<ScanDay> days) {
    return [
      for (final day in days) ...[
        ScanHistoryRow.heading(day.shiftDate),
        for (var i = 0; i < day.entries.length; i++)
          ScanHistoryRow.scan(
            day.entries[i],
            isFirstOfDay: i == 0,
            isLastOfDay: i == day.entries.length - 1,
          ),
      ],
    ];
  }

  /// Groups by the server's shift day, preserving order.
  ///
  /// Entries with no shift day came from an older server or an older cache;
  /// they fall into one group keyed by the empty string, which the screen
  /// renders under the current day.
  static List<ScanDay> _group(List<WorkEntry> entries) {
    final days = <ScanDay>[];
    for (final entry in entries) {
      final key = entry.shiftDate ?? '';
      if (days.isNotEmpty && days.last.shiftDate == key) {
        days.last.entries.add(entry);
      } else {
        days.add(ScanDay(shiftDate: key, entries: [entry]));
      }
    }
    return days;
  }
}

/// autoDispose, which is new in this codebase and deliberate: Home does not
/// read this, the screen is pushed, and ninety days of accumulated rows should
/// not outlive it.
final scanHistoryProvider =
    StateNotifierProvider.autoDispose<ScanHistoryNotifier, ScanHistoryState>(
  (ref) => ScanHistoryNotifier(),
);
