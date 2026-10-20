import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../providers/scan_history_provider.dart';
import '../services/api_error_text.dart';
import '../services/api_exception.dart';
import '../services/time_text.dart';
import '../theme/app_theme.dart';
import '../widgets/ios/app_page.dart';
import '../widgets/ios/inset_section.dart';
import '../widgets/ios/ios_button.dart';
import '../widgets/my_work_section.dart';
import '../widgets/skeletons.dart';
import '../widgets/status_view.dart';

/// Every scan this preparator has sent, grouped by the shift day the server
/// filed it under.
///
/// Home only ever showed the current shift, and the phone's copy of it is a
/// single slot overwritten by the next shift's first fetch — so yesterday was
/// unreachable from the rack. This is the screen that answers "what did I do
/// on Tuesday".
///
/// **One sliver, not one per day.** The first version gave each day its own
/// `InsetSectionSliver`, which put ninety top-level slivers in one viewport —
/// and a viewport lays out every sliver above the fold on every frame. Scrolled
/// to day sixty, that was some three hundred and sixty `performLayout` calls
/// and sixty build scopes per frame, growing with how far down the preparator
/// had got. The day cards are painted per row instead; the list below does
/// work proportional to what is on screen.
class ScanHistoryScreen extends ConsumerWidget {
  const ScanHistoryScreen({super.key, this.isTab = false});

  /// A tab of its own on the home shell, rather than a page pushed from Home:
  /// no back button, because there is nothing to go back to.
  final bool isTab;

  /// How far from the bottom to ask for the next page — one row, which is as
  /// close to "not until you get there" as this can honestly be set.
  ///
  /// This number does not set the cadence. When a page lands, `maxScrollExtent`
  /// grows by that page's height and the threshold moves down with it, so from
  /// wherever the preparator is standing the distance to the next threshold is
  /// always one page, whatever the lead. What it sets is the runway: how much
  /// content is still below when the request fires, and therefore whether the
  /// spinner shows.
  ///
  /// It was 600, then 400 on the reasoning that a visible spinner is a cost.
  /// That was the wrong trade for this screen. At 400 the list grew about six
  /// rows before the preparator arrived, so the bottom was never actually reached
  /// and rows kept appearing underneath unasked — which is the weight complained
  /// about, not a nicety. **The visible spinner is now the intended outcome**, not
  /// something tolerated: nothing is fetched until the preparator has asked for it
  /// by arriving.
  ///
  /// Why not zero, which is what "only at the bottom" sounds like. AppPage runs
  /// BouncingScrollPhysics, whose ballistic simulation settles within
  /// `Tolerance.distance` — `1.0 / devicePixelRatio`, about a third of a pixel —
  /// and it settles on the INSIDE of the boundary. So `pixels >= maxScrollExtent`
  /// can be false at rest at the bottom, and a lead of zero would fire only when
  /// an overscroll bounce carried past the edge. A careful drag that eased to a
  /// stop would never trigger at all. `maxScrollExtent` is also still an estimate
  /// while the last row is unbuilt, so the threshold itself drifts.
  ///
  /// One row is the first value that is true for a position which is VISIBLY at
  /// the bottom rather than at a sub-pixel boundary: the last row fully in view,
  /// nothing below it but the footer.
  ///
  /// The consequence, which is deliberate and is covered: a drag that stops a few
  /// hundred pixels short now fetches nothing. The footer's "Muat lagi" button is
  /// what carries the preparator on from there, so it is load-bearing rather than a
  /// safety net — see the note on that branch.
  static const double _loadMoreLead = 64;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;

    // Everything the body is shaped by, and deliberately nothing that changes
    // while a page is in flight. `isLoadingMore` used to be in here, so the
    // whole screen rebuilt — ninety day headers formatted, hundreds of widgets
    // allocated — in the middle of the drag that triggered the request.
    final body = ref.watch(
      scanHistoryProvider.select(
        (state) => (
          rows: state.rows,
          shiftDate: state.shiftDate,
          isLoadingFirst: state.isLoadingFirst,
          isEmpty: state.entries.isEmpty,
          error: state.error,
          isFromCache: state.isFromCache,
        ),
      ),
    );

    return NotificationListener<ScrollUpdateNotification>(
      onNotification: (notification) {
        final metrics = notification.metrics;
        if (metrics.axis == Axis.vertical &&
            metrics.pixels >= metrics.maxScrollExtent - _loadMoreLead) {
          // Fires on every frame near the bottom, and is a no-op once a page
          // is in flight, there is nothing left, the auto-load budget is spent,
          // or the last page failed. Every one of those decisions lives in the
          // notifier rather than here, for the same reason: this callback is not
          // the only caller, and a policy that lives at one call site is a policy
          // the next call site will not have.
          //
          // loadMoreAutomatically, not loadMore — the difference is the budget.
          // The footer's button calls loadMore directly and so renews it.
          unawaited(
            ref.read(scanHistoryProvider.notifier).loadMoreAutomatically(),
          );
        }
        // False, or CupertinoSliverRefreshControl stops seeing scroll updates
        // and pull-to-refresh quietly dies.
        return false;
      },
      child: AppPage(
        title: l10n.scanHistoryTitle,
        automaticallyImplyLeading: !isTab,
        onRefresh: () => ref.read(scanHistoryProvider.notifier).refresh(),
        slivers: _slivers(context, ref, l10n, palette, body),
      ),
    );
  }

  List<Widget> _slivers(
    BuildContext context,
    WidgetRef ref,
    AppLocalizations l10n,
    AppColors palette,
    ({
      List<ScanHistoryRow> rows,
      String shiftDate,
      bool isLoadingFirst,
      bool isEmpty,
      ApiException? error,
      bool isFromCache,
    }) body,
  ) {
    if (body.isLoadingFirst && body.isEmpty) {
      // A sliver, handed straight to a sliver slot. It used to go through
      // LoadingSwap, whose AnimatedSwitcher wraps its child in a Stack and a
      // FadeTransition — both box widgets — so this sliver was rejected at
      // mount and the preparator watched an ErrorWidget for the length of the
      // request.
      return const [
        SliverPadding(
          padding: EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.lg,
            AppSpacing.lg,
            0,
          ),
          sliver: MyWorkSkeleton(rows: 6, showTallies: false),
        ),
      ];
    }

    if (body.isEmpty) {
      return [
        SliverFillRemaining(
          hasScrollBody: false,
          child: body.error != null
              ? StatusView(
                  icon: CupertinoIcons.wifi_slash,
                  tone: palette.danger,
                  liveRegion: true,
                  title: l10n.loadFailed,
                  message: apiErrorText(l10n, body.error!),
                  action: AppButton(
                    label: l10n.tryAgain,
                    icon: CupertinoIcons.refresh,
                    onPressed: () =>
                        ref.read(scanHistoryProvider.notifier).refresh(),
                  ),
                )
              : StatusView(
                  icon: CupertinoIcons.clock,
                  tone: palette.neutral,
                  title: l10n.scanHistoryEmptyTitle,
                  message: l10n.scanHistoryEmptyBody,
                ),
        ),
      ];
    }

    final localeName = Localizations.localeOf(context).toLanguageTag();

    return [
      if (body.isFromCache)
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.lg,
              AppSpacing.lg,
              0,
            ),
            child: ToneBanner(
              dense: true,
              icon: CupertinoIcons.cloud_download,
              tone: palette.warning,
              title: l10n.scanHistoryCachedNotice,
            ),
          ),
        ),
      SliverPadding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
        sliver: SliverList(
          delegate: SliverChildBuilderDelegate(
            childCount: body.rows.length,
            // Neither is wanted here and both cost per realised child. Keep
            // alives would pin rows the preparator has scrolled past; the
            // semantic index is for a list whose position means something,
            // which a dated log's does not.
            addAutomaticKeepAlives: false,
            addSemanticIndexes: false,
            (context, index) {
              final row = body.rows[index];
              if (row.isHeading) {
                return Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.lg),
                  child: InsetSectionHeading(
                    text: shiftDayText(
                      l10n,
                      row.shiftDate!,
                      todayShiftDate: body.shiftDate,
                      localeName: localeName,
                    ),
                  ),
                );
              }
              return _HistoryCardRow(row: row, palette: palette);
            },
          ),
        ),
      ),
      SliverToBoxAdapter(
        child: Consumer(
          builder: (context, ref, child) => _Footer(
            l10n: l10n,
            palette: palette,
            // Watched here and nowhere else, so a page arriving repaints a
            // footer rather than rebuilding the list above it.
            paging: ref.watch(
              scanHistoryProvider.select(
                (state) => (
                  isLoadingMore: state.isLoadingMore,
                  loadMoreError: state.loadMoreError,
                  hasMore: state.hasMore,
                  isFromCache: state.isFromCache,
                ),
              ),
            ),
            onLoadMore: () => ref.read(scanHistoryProvider.notifier).loadMore(),
          ),
        ),
      ),
      const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.xxl)),
    ];
  }
}

/// One scan, wearing the slice of the day card that belongs to it.
///
/// The card used to be painted once per day by a `DecoratedSliver`. Now that
/// every day shares one list, each row carries its own corner — which also
/// fixes something the sliver never could: a pressed first or last row used to
/// paint a square tint over the card's rounded corner.
class _HistoryCardRow extends StatelessWidget {
  const _HistoryCardRow({required this.row, required this.palette});

  final ScanHistoryRow row;
  final AppColors palette;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.vertical(
      top: Radius.circular(row.isFirstOfDay ? AppRadius.lg : 0),
      bottom: Radius.circular(row.isLastOfDay ? AppRadius.lg : 0),
    );

    return DecoratedBox(
      decoration: BoxDecoration(color: palette.cardBackground, borderRadius: radius),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          WorkRow(entry: row.entry!, tintRadius: radius),
          // The hairline lives inside the row rather than as a separator child
          // of the list: a separator is a realised delegate child of its own,
          // and doubling the child count doubles the wrappers the delegate
          // puts around each one.
          //
          // InsetHairline rather than Material's Divider, which was eight render
          // objects and four inherited lookups for half a pixel. See its doc for
          // why the width it sets is load-bearing HERE in particular: the Column
          // above uses the default centre alignment, so its children arrive with
          // loose width.
          if (!row.isLastOfDay) const InsetHairline(),
        ],
      ),
    );
  }
}

/// What is happening at the end of the list: another page arriving, one that
/// failed, or the end of the window.
class _Footer extends StatelessWidget {
  const _Footer({
    required this.l10n,
    required this.palette,
    required this.paging,
    required this.onLoadMore,
  });

  final AppLocalizations l10n;
  final AppColors palette;
  final ({
    bool isLoadingMore,
    ApiException? loadMoreError,
    bool hasMore,
    bool isFromCache,
  }) paging;

  /// A callback rather than a WidgetRef: a ref belongs to the element that
  /// handed it out, and holding one across a widget boundary is the shape that
  /// breaks later.
  final VoidCallback onLoadMore;

  @override
  Widget build(BuildContext context) {
    final Widget child;

    // A request in flight outranks everything, and the spinner REPLACES the
    // button rather than disabling it: a dimmed but still tappable-looking
    // target for a state that is already resolving is worse than no target.
    if (paging.isLoadingMore) {
      child = const Center(child: CupertinoActivityIndicator());
    } else if (paging.loadMoreError != null) {
      // Above the plain-button branch because a failure needs its explanation,
      // not a bare button. The scroll trigger also stops asking once this is
      // set, so this is the only way forward and has to say why.
      child = Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            paging.isFromCache
                ? l10n.scanHistoryOlderOffline
                : l10n.scanHistoryLoadMoreFailed,
            textAlign: TextAlign.center,
            style: AppText.footnote.copyWith(color: palette.secondaryLabel),
          ),
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            label: l10n.scanHistoryLoadMore,
            style: AppButtonStyle.plain,
            onPressed: onLoadMore,
          ),
        ],
      );
    } else if (paging.isFromCache) {
      // Above `hasMore` defensively. The two should be mutually exclusive — the
      // cache fallback only answers page one and reports totalPages: 1 — but if
      // that ever stops holding, the offline notice must win over a button that
      // cannot possibly succeed.
      child = Text(
        l10n.scanHistoryOlderOffline,
        textAlign: TextAlign.center,
        style: AppText.footnote.copyWith(color: palette.secondaryLabel),
      );
    } else if (paging.hasMore) {
      // The way forward whenever there is one, and do not remove it: three
      // separate states now depend on this button being here.
      //
      // It began as a fix for a comment that lied. One above the error branch
      // claimed that button was "also the manual way forward when the scroll
      // trigger never fires because the list is shorter than the viewport", and
      // the branch order never delivered it — in the healthy state this slot
      // rendered SizedBox.shrink(), so the only reachable button came after a
      // failure.
      //
      // What depends on it now:
      //
      //   1. A first page shorter than the viewport. Twenty rows is about 1300
      //      pixels, so a tall phone or a tablet can hold all of it with nothing
      //      left to scroll. The list is still draggable — AppPage's
      //      AlwaysScrollableScrollPhysics sees to that — but nothing on screen
      //      suggests dragging a list that visibly does not move, and a downward
      //      drag hits the refresh control instead. Reachable and undiscoverable
      //      is the same as absent.
      //   2. The auto-load budget stopping on purpose, which is a state the
      //      preparator is MEANT to leave by tapping.
      //   3. A drag that eases to a stop short of the bottom. `_loadMoreLead` is
      //      one row now, so unlike at 400 there is no prefetch to cover that;
      //      this is the only thing that carries them on.
      child = AppButton(
        label: l10n.scanHistoryLoadMore,
        style: AppButtonStyle.plain,
        onPressed: onLoadMore,
      );
    } else {
      // The end of the window, and now the genuine else: branches four and five
      // are complements, so once there are rows the footer always says
      // something. A paused list reads `hasMore == true`, so it can never land
      // here and claim the history has run out.
      child = Text(
        l10n.scanHistoryWindow,
        textAlign: TextAlign.center,
        style: AppText.footnote.copyWith(color: palette.secondaryLabel),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.lg,
        AppSpacing.lg,
        0,
      ),
      child: child,
    );
  }
}
