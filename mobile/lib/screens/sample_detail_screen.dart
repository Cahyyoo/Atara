import 'package:flutter/cupertino.dart';

import '../l10n/app_localizations.dart';
import '../models/sample_model.dart';
import '../services/api_error_text.dart';
import '../services/api_exception.dart';
import '../services/api_service.dart';
import '../services/sample_cache_service.dart';
import '../theme/app_theme.dart';
import '../widgets/ios/app_page.dart';
import '../widgets/ios/inset_section.dart';
import '../widgets/ios/ios_button.dart';
import '../widgets/sample_history.dart';
import '../widgets/sample_summary_card.dart';
import '../widgets/status_view.dart';
import '../widgets/skeletons.dart';
import 'update_status_screen.dart';

/// A sample, read rather than changed: what it is, where it has been, and who
/// moved it there.
///
/// Reached by tapping a row in My Work, which until now was inert — an operator
/// could see that they had recorded a stage but had no way to look at what they
/// had recorded. It takes a **code** rather than a loaded sample, so it can be
/// opened from anywhere that knows one.
///
/// Nothing here writes. The one action offered is the update screen, because
/// looking and then acting is the natural order and sending the operator back
/// to Home to do it is not.
class SampleDetailScreen extends StatefulWidget {
  const SampleDetailScreen({
    super.key,
    required this.sampleCode,
    @visibleForTesting this.fetchSample,
  });

  final String sampleCode;

  /// The one network call, isolated so a test can answer it.
  ///
  /// ApiService.instance is a singleton with no injection point, which is the
  /// same problem ScanHistoryNotifier solves with its @visibleForTesting
  /// `fetchPage` seam; this is that pattern for a StatefulWidget. Null in every
  /// production call site, so the default below is what ships.
  ///
  /// It exists because this screen had NO widget test at all — the gap that let
  /// a render error reach an operator's hands once already — and it could not
  /// get one: initState fires a real dio request, which leaves a pending timer
  /// that fails the test binding at teardown. Waiting the timeout out instead
  /// is no good either, because a failed fetch replaces whatever the cache had
  /// put on screen, so the loaded page would never be reachable from a test.
  final Future<SampleModel> Function(String sampleCode)? fetchSample;

  @override
  State<SampleDetailScreen> createState() => _SampleDetailScreenState();
}

enum _LoadState { loading, notFound, error, loaded }

class _SampleDetailScreenState extends State<SampleDetailScreen> {
  _LoadState _loadState = _LoadState.loading;
  String? _errorMessage;
  SampleModel? _sample;

  @override
  void initState() {
    super.initState();
    _showCachedWhileFetching();
    _fetch();
  }

  /// Puts a sample the phone already knows on screen without waiting, exactly
  /// as the update screen does. The server stays authoritative: whatever it
  /// answers replaces this, including a 404.
  Future<void> _showCachedWhileFetching() async {
    try {
      final cached = await SampleCacheService.load(widget.sampleCode);
      if (!mounted || cached == null || _loadState != _LoadState.loading) return;
      setState(() {
        _sample = cached;
        _loadState = _LoadState.loaded;
      });
    } catch (_) {
      // Showing something early is a nicety; the fetch is already in flight.
    }
  }

  Future<void> _fetch() async {
    // Only the first load empties the screen. Pull-to-refresh used to come
    // through here and reset the state, which threw away a perfectly good
    // page -- and swapped the collapsing large title for a plain bar on the
    // way down and back. The refresh control is the feedback; the content
    // stays put until there is something better to show.
    if (_loadState == _LoadState.error || _loadState == _LoadState.notFound) {
      setState(() => _loadState = _LoadState.loading);
    }

    try {
      final fetch = widget.fetchSample ?? ApiService.instance.getSampleByCode;
      final sample = await fetch(widget.sampleCode);
      if (!mounted) return;
      setState(() {
        _sample = sample;
        _loadState = _LoadState.loaded;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      // Read after the await and behind the mounted check: past initState, and
      // the element is still in the tree.
      final l10n = AppLocalizations.of(context)!;
      setState(() {
        _errorMessage = apiErrorText(l10n, error);
        // Offline with nothing cached is an error here, unlike on the update
        // screen — there, the operator still has a stage to record; here there
        // is simply nothing to show.
        _loadState =
            error.isNotFound ? _LoadState.notFound : _LoadState.error;
      });
    } catch (_) {
      if (!mounted) return;
      final l10n = AppLocalizations.of(context)!;
      setState(() {
        _errorMessage = l10n.unexpectedError;
        _loadState = _LoadState.error;
      });
    }
  }

  Future<void> _openUpdate() async {
    final saved = await Navigator.of(context).push<bool>(
      CupertinoPageRoute(
        builder: (context) => UpdateStatusScreen(sampleCode: widget.sampleCode),
      ),
    );
    // A stage was recorded while we were away, so what is on screen is stale.
    if (saved == true && mounted) await _fetch();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final sample = _sample;

    switch (_loadState) {
      case _LoadState.loading:
        // AppPage everywhere on this screen, never AppModalPage, and the reason
        // grew since this comment was first written.
        //
        // It started as a cosmetic point: switching between them made the
        // navigation bar change shape the moment the data landed. The error
        // branches below kept AppModalPage anyway, and that turned out to cost
        // more than a shape change. CupertinoSliverNavigationBar and
        // CupertinoNavigationBar each register their own Hero for the
        // cross-route bar transition, so a route that swaps one for another
        // mid-life breaks the flight chain, and popping afterwards trips
        //
        //   heroes.dart: 'manifest.toHero == newManifest.fromHero' is not true
        //
        // which in debug paints an ErrorWidget over the bar. Reachable in the
        // ordinary way: open a sample with no signal, let it fail, go back.
        return AppPage(
          title: l10n.detailTitle,
          slivers: [
            SliverToBoxAdapter(
              child: SampleDetailSkeleton(historyHeader: l10n.historyTitle),
            ),
          ],
        );

      case _LoadState.notFound:
        return AppPage(
          title: l10n.detailTitle,
          slivers: [
            SliverFillRemaining(
              hasScrollBody: false,
              child: StatusView(
                icon: CupertinoIcons.exclamationmark_circle,
                tone: context.palette.danger,
                title: l10n.sampleNotRegistered,
                message: l10n.sampleNotFoundBody(widget.sampleCode),
              ),
            ),
          ],
        );

      case _LoadState.error:
        // SliverFillRemaining rather than a bare child, which is how the
        // history screen carries the same StatusView inside the same AppPage.
        return AppPage(
          title: l10n.detailTitle,
          slivers: [
            SliverFillRemaining(
              hasScrollBody: false,
              child: StatusView(
                icon: CupertinoIcons.wifi_slash,
                tone: context.palette.danger,
                liveRegion: true,
                title: l10n.loadFailed,
                message: _errorMessage,
                action: AppButton(
                  label: l10n.tryAgain,
                  icon: CupertinoIcons.refresh,
                  onPressed: _fetch,
                ),
              ),
            ),
          ],
        );

      case _LoadState.loaded:
        return _buildDetail(l10n, sample!);
    }
  }

  Widget _buildDetail(AppLocalizations l10n, SampleModel sample) {
    // Newest first: what happened last is what is being checked against.
    final history = sample.logs.reversed.toList();

    return AppPage(
      title: l10n.detailTitle,
      onRefresh: _fetch,
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.lg,
            AppSpacing.lg,
            0,
          ),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              if (sample.isFromCache)
                ToneBanner(
                  dense: true,
                  icon: CupertinoIcons.cloud_download,
                  tone: context.palette.warning,
                  title: l10n.cachedNotice,
                ),
              SampleSummaryCard(sample: sample),
            ]),
          ),
        ),
        // The whole history, built as it scrolls. No three-row cap here: on the
        // update screen history is context beside the task, but on this screen
        // it *is* the screen.
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
          sliver: history.isEmpty
              ? SliverToBoxAdapter(child: _buildEmptyHistory(l10n, sample))
              : InsetSectionSliver(
                  header: l10n.historyTitle,
                  itemCount: history.length,
                  itemBuilder: (context, index) =>
                      HistoryRow(entry: history[index], transparent: true),
                ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            0,
            AppSpacing.lg,
            AppSpacing.xxl,
          ),
          sliver: SliverToBoxAdapter(
            child: AppButton(
              label: l10n.detailUpdateStage,
              icon: CupertinoIcons.arrow_right_circle,
              onPressed: _openUpdate,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildEmptyHistory(AppLocalizations l10n, SampleModel sample) {
    return InsetSection(
      header: l10n.historyTitle,
      children: [
        InsetCustomRow(
          child: Text(
            // A sample straight off the printer genuinely has no history; one
            // read from the phone's cache has one the phone never kept. Those
            // are different facts.
            sample.isFromCache ? l10n.historyUnknownOnCache : l10n.historyEmpty,
            style: AppText.subhead.copyWith(color: context.palette.secondaryLabel),
          ),
        ),
      ],
    );
  }
}
