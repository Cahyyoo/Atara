import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';

import '../models/sample_model.dart';
import '../models/user_model.dart';
import '../models/stage_model.dart';
import '../providers/my_work_provider.dart';
import '../providers/pending_scans_provider.dart';
import '../providers/session_provider.dart';
import '../providers/stages_provider.dart';
import '../providers/todo_provider.dart';
import '../models/pending_scan.dart';
import '../services/api_error_text.dart';
import '../services/api_exception.dart';
import '../services/api_service.dart';
import '../services/pending_scan_service.dart';
import '../services/sample_cache_service.dart';
import '../services/settings_service.dart';
import '../theme/app_theme.dart';
import '../widgets/ios/app_page.dart';
import '../widgets/ios/app_toast.dart';
import '../widgets/ios/inset_section.dart';
import '../widgets/ios/ios_button.dart';
import '../widgets/app_primitives.dart';
import '../widgets/sample_history.dart';
import '../widgets/sample_identity_card.dart';
import '../widgets/sample_summary_card.dart';
import '../widgets/server_address_notice.dart';
import '../widgets/stage_picker.dart';
import '../widgets/status_view.dart';
import '../widgets/skeletons.dart';
import 'sample_identity_screen.dart';
import 'settings_screen.dart';

/// A sample, in one page: what the barcode says, its Sample ID and history,
/// and the stage to move it to next.
///
/// There used to be a read-only detail page beside this one, reached from
/// past work and the scanner's "check" mode, with nearly the same cards on it.
/// Looking and acting are one visit now: whoever only wanted to look goes
/// back without saving, and the scanner carries on where it was.
class UpdateStatusScreen extends ConsumerStatefulWidget {
  const UpdateStatusScreen({
    super.key,
    required this.sampleCode,
    @visibleForTesting this.fetchSample,
    @visibleForTesting this.identityPage,
  });

  final String sampleCode;

  /// The sample lookup, isolated so a test can answer it; null in every
  /// production call site. ApiService is a singleton with no other way in, and
  /// a real request leaves dio's timer pending past a widget test's teardown.
  final Future<SampleModel> Function(String sampleCode)? fetchSample;

  /// The identity form, swapped for a stand-in by a test: the real one makes
  /// its own request the moment it opens. Null in every production call site.
  final Widget Function(String sampleCode)? identityPage;

  @override
  ConsumerState<UpdateStatusScreen> createState() => _UpdateStatusScreenState();
}

/// `offlineUnknown` is the case that used to be a dead end: no signal, and the
/// phone has never seen this sample, so its current stage cannot be shown. The
/// preparator is standing in front of it either way, so a stage is still recorded
/// and the server checks the order when the queue drains.
enum _LoadState { loading, notFound, error, loaded, offlineUnknown }

/// How long the tick stays on screen before the screen closes itself.
///
/// It was 1200 ms, on both the online and the queued path. That is dead time an
/// preparator pays for every single sample: over a 200-sample shift it alone came
/// to about two and a half minutes of watching a finished screen. This is long
/// enough to read as confirmation and short enough not to be a wait.
const Duration _confirmationHold = Duration(milliseconds: 450);

class _UpdateStatusScreenState extends ConsumerState<UpdateStatusScreen> {
  _LoadState _loadState = _LoadState.loading;
  String? _errorMessage;
  SampleModel? _sample;

  /// The address the failed request used. Named on screen because "could
  /// not reach the server" never says *which* server, and a stale address
  /// after the port moved looks exactly like a network that is down.
  String? _serverUrl;

  StageModel? _selectedStage;

  /// Whether the preparator picked the stage themselves.
  ///
  /// The default is derived from the sample's current stage, and the sample now
  /// arrives twice: once from the cache, then corrected from the server. A
  /// cached copy can be a stage behind, so a default chosen from it would be
  /// wrong — and left alone it would stay wrong, because the default is only
  /// applied when nothing is selected. It is recomputed when the fresh sample
  /// lands, unless the preparator has already made the choice their own.
  bool _stageChosenByPreparator = false;
  final _notesController = TextEditingController();
  final _reasonController = TextEditingController();
  bool _isSubmitting = false;
  bool _isSubmitted = false;

  /// Whether the identity form has already been raised on its own, so backing
  /// out of it does not bring it straight back. The banner and its button stay.
  bool _identityPrompted = false;

  @override
  void initState() {
    super.initState();
    // Both requests, not one after the other. The stage list is watched inside
    // _buildForm, which is only reachable once the sample has arrived — so
    // /stages was not even *started* until /samples/{code} came back, and the
    // preparator paid two round trips nose to tail behind one spinner. Touching
    // the provider here puts them in flight together. It is a plain
    // FutureProvider, so this costs nothing when the list is already loaded.
    ref.read(stagesProvider);
    _showCachedWhileFetching();
    _fetchSample();
  }

  @override
  void dispose() {
    _notesController.dispose();
    _reasonController.dispose();
    super.dispose();
  }

  /// True when the chosen stage is not the one that follows the current stage.
  ///
  /// Mirrors the server's rule rather than waiting to be told: only
  /// `current + 1` is an ordinary move. An unknown current stage means the
  /// sample could not be read, so there is nothing to compare and the server
  /// decides.
  bool get _breaksStageOrder {
    final current = _sample?.currentStage;
    final chosen = _selectedStage;
    if (current == null || chosen == null) return false;
    return chosen.sequenceOrder != current.sequenceOrder + 1;
  }

  /// The preparator is the role the server lets break the stage order (with a
  /// reason). It is also the only role that can be signed in here at all, so in
  /// practice this is always true — it is kept as a check anyway, because the
  /// panel promises a power the server grants by role, and the day that list
  /// changes this line should be the one that has to.
  bool get _canOverride =>
      ref.read(sessionProvider).value?.role == UserRole.preparator;

  /// A sample the phone knows to have no Sample ID yet. It is filled in
  /// before the stage moves — the server refuses the scan otherwise. A sample
  /// the phone has never seen (offline, nothing cached) is not known to lack
  /// one, so it may still be queued and the server decides when it drains.
  bool get _needsSampleIdent => _sample != null && !_sample!.hasSampleIdent;

  /// Whether the override is on offer right now — and so whether a reason is
  /// required before the button does anything.
  bool get _isOverriding => _canOverride && _breaksStageOrder;

  /// Called from initState and again from the retry button.
  ///
  /// Nothing here may read an inherited widget or call setState before the
  /// first await: initState has not finished on the first call, and both are
  /// illegal that early. Hoisting the localisations to the top of this method
  /// is what made the screen throw during initState and sit on its spinner for
  /// ever, never reaching the stage picker.
  Future<void> _fetchSample() async {
    if (_loadState != _LoadState.loading) {
      setState(() => _loadState = _LoadState.loading);
    }

    try {
      final sample = await _lookup(widget.sampleCode);
      if (!mounted) return;
      setState(() {
        final movedOn = _sample?.currentStage?.id != sample.currentStage?.id;
        _sample = sample;
        _loadState = _LoadState.loaded;
        // See _stageChosenByPreparator: a default taken from a stale cached copy
        // has to give way to one taken from the server.
        if (movedOn && !_stageChosenByPreparator) _selectedStage = null;
      });
      _promptForIdentity(sample);
    } on ApiException catch (error) {
      // Only worth resolving when the server was never reached: a refusal came
      // from the right address by definition.
      final serverUrl = error.isOffline ? await _resolveServerUrl() : null;
      if (!mounted) return;
      // Read after the await and behind the mounted check: past initState, and
      // the element is still in the tree.
      final l10n = AppLocalizations.of(context)!;
      setState(() {
        _serverUrl = serverUrl;
        _errorMessage = apiErrorText(l10n, error);
        if (error.isNotFound) {
          _loadState = _LoadState.notFound;
        } else if (error.isOffline) {
          // The server was never reached, so nothing was decided. Carry on
          // without the sample's details rather than stopping the preparator.
          _loadState = _LoadState.offlineUnknown;
        } else {
          _loadState = _LoadState.error;
        }
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

  /// Raises the identity form once, over this page, when the server says the
  /// sample has no Sample ID: that is the first thing to do with it. Only on
  /// the server's answer — never a cached copy, which may be out of date, and
  /// never offline, where the form could not save.
  void _promptForIdentity(SampleModel sample) {
    if (_identityPrompted || sample.isFromCache || sample.hasSampleIdent) {
      return;
    }
    _identityPrompted = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _needsSampleIdent && !_isSubmitted) _openIdentity();
    });
  }

  Future<SampleModel> _lookup(String code) =>
      (widget.fetchSample ?? ApiService.instance.getSampleByCode)(code);

  /// Fetches the sample again without emptying the page: for the pull, and
  /// for coming back from the identity form. The stage being picked stays
  /// picked, and a failure leaves what is on screen alone.
  Future<void> _refreshInPlace() async {
    try {
      final sample = await _lookup(widget.sampleCode);
      if (!mounted) return;
      setState(() {
        final movedOn = _sample?.currentStage?.id != sample.currentStage?.id;
        _sample = sample;
        _loadState = _LoadState.loaded;
        if (movedOn && !_stageChosenByPreparator) _selectedStage = null;
      });
    } catch (_) {
      // The page already shows the last good answer; the pull was a request
      // to try, not a promise.
    }
  }

  /// Puts a sample the phone already knows on screen without waiting.
  ///
  /// The cache held the last 300 samples but was only read when the request
  /// failed offline, so re-opening a label scanned an hour ago still meant a
  /// blank screen and a spinner. The server stays authoritative: whatever it
  /// answers replaces this, including a 404.
  Future<void> _showCachedWhileFetching() async {
    try {
      final cached = await SampleCacheService.load(widget.sampleCode);
      // The network may have won the race, in which case leave its answer be.
      if (!mounted || cached == null || _loadState != _LoadState.loading) {
        return;
      }
      setState(() {
        _sample = cached;
        _loadState = _LoadState.loaded;
      });
    } catch (_) {
      // Showing something early is a nicety; the fetch is already in flight.
    }
  }

  /// Never throws: this only decorates an error that is already on screen,
  /// and the settings read is the very thing that may have failed.
  Future<String?> _resolveServerUrl() async {
    try {
      return await SettingsService.getServerUrl();
    } catch (_) {
      return null;
    }
  }

  Future<void> _handleSubmit() async {
    // The button greys out when _isSubmitting is set, but only from the next
    // frame: two taps inside one frame both reached here and posted the scan
    // twice, the second answered "already recorded" over a scan that worked.
    if (_isSubmitting || _isSubmitted) return;
    final stage = _selectedStage;
    if (stage == null || _needsSampleIdent) return;

    // In offlineUnknown there is no loaded sample, only the code the preparator
    // scanned or typed. That is all the server needs.
    final sampleCode = _sample?.sampleCode ?? widget.sampleCode;

    // Resolved before any await: the preparator can leave this screen mid-request,
    // and touching the context afterwards is what makes that a crash.
    final l10n = AppLocalizations.of(context)!;

    final override = _isOverriding;
    final reason = _reasonController.text.trim();
    // Checked here as well as on the server, so the preparator is told before a
    // round trip rather than after a 422.
    if (override && reason.length < 5) {
      setState(() => _errorMessage = l10n.overrideReasonTooShort);
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    try {
      await ApiService.instance.scanUpdate(
        sampleCode: sampleCode,
        stageId: stage.id,
        notes: _notesController.text,
        force: override,
        reason: reason,
      );

      // The work summary counts what the server has, so refresh it rather than
      // keeping a second tally on the device.
      unawaited(ref.read(myWorkProvider.notifier).refresh());
      // The sample has left one stage's queue for the next one's.
      unawaited(ref.read(todoProvider.notifier).refresh());

      if (!mounted) return;
      setState(() {
        _isSubmitting = false;
        _isSubmitted = true;
      });

      await Future.delayed(_confirmationHold);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      // No status code means the server was never reached. Rather than losing
      // the scan, queue it and let the sync service send it when the network
      // returns. A refusal from the server is a real answer and is shown.
      if (error.isOffline) {
        await _queueOffline(sampleCode, stage, force: override, reason: reason);
        return;
      }
      if (!mounted) return;
      setState(() {
        _isSubmitting = false;
        // Not mapped in apiErrorText itself: the sign-in route also answers 403,
        // for a deactivated account, and its own wording says so better.
        _errorMessage = error.isForbidden
            ? l10n.errorForbidden
            : apiErrorText(l10n, error);
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isSubmitting = false;
        _errorMessage = l10n.unexpectedError;
      });
    }
  }

  /// Takes the code rather than the sample: offline, the details may be unknown
  /// and the scan still has to be kept.
  Future<void> _queueOffline(
    String sampleCode,
    StageModel stage, {
    bool force = false,
    String? reason,
  }) async {
    await PendingScanService.add(
      PendingScan(
        id: '${DateTime.now().microsecondsSinceEpoch}-$sampleCode',
        // Stamped now, because the drain may happen days later under whoever
        // is signed in then.
        preparatorId: ref.read(sessionProvider).valueOrNull?.id,
        sampleCode: sampleCode,
        stageId: stage.id,
        stageKey: stage.key,
        stageName: stage.name,
        notes: _notesController.text.trim().isEmpty
            ? null
            : _notesController.text.trim(),
        force: force,
        reason: reason,
        queuedAt: DateTime.now(),
      ),
    );

    // The service writes to disk; the provider is what Home reads. Without this
    // the preparator is told "saved offline", returns to Home and finds no queue
    // at all — the scan looks lost until something else happens to refresh it,
    // and offline is exactly when nothing else does: no connectivity event
    // fires, so only a deliberate pull would reveal the work is still there.
    await ref.read(pendingScansProvider.notifier).refresh();

    if (!mounted) return;
    setState(() {
      _isSubmitting = false;
      _isSubmitted = true;
    });
    AppToast.show(
      context,
      AppLocalizations.of(context)!.savedOffline,
      icon: CupertinoIcons.cloud_upload,
    );

    await Future.delayed(_confirmationHold);
    if (!mounted) return;
    Navigator.of(context).pop(true);
  }

  /// The identity form, over this screen. A saved Sample ID is fetched back in
  /// place, without the skeleton: the stage being picked here stays picked.
  Future<void> _openIdentity() async {
    final saved = await Navigator.of(context).push<bool>(
      CupertinoPageRoute(
        builder: (context) =>
            widget.identityPage?.call(widget.sampleCode) ??
            SampleIdentityScreen(sampleCode: widget.sampleCode),
      ),
    );
    if (saved == true && mounted) await _refreshInPlace();
  }

  void _openSettings() {
    Navigator.of(
      context,
    ).push(CupertinoPageRoute(builder: (context) => const SettingsScreen()));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    final title = l10n.detailTitle;

    // AppPage in every state, never AppModalPage. CupertinoSliverNavigationBar
    // and CupertinoNavigationBar each register their own Hero for the bar's
    // flight between routes, so a route that swaps one for the other mid-life
    // breaks the chain, and popping afterwards trips
    //
    //   heroes.dart: 'manifest.toHero == newManifest.fromHero' is not true
    //
    // which paints an ErrorWidget over the bar in debug. This page is pushed
    // from past work as well as from the scanner, and "open it with no signal,
    // let it fail, go back" is an ordinary thing to do.
    switch (_loadState) {
      case _LoadState.loading:
        return AppPage(
          title: title,
          slivers: [
            SliverToBoxAdapter(
              child: SampleDetailSkeleton(historyHeader: l10n.historyTitle),
            ),
          ],
        );
      case _LoadState.notFound:
        return _statusPage(title, _buildNotFound(l10n));
      case _LoadState.error:
        return _statusPage(title, _buildError(l10n));
      case _LoadState.offlineUnknown:
      case _LoadState.loaded:
        if (_isSubmitted) return _statusPage(title, _buildSuccess(l10n));
        return AppPage.list(
          title: title,
          onRefresh: _sample == null ? null : _refreshInPlace,
          children: _buildForm(l10n),
        );
    }
  }

  /// An outcome, centred in what is left below the bar.
  Widget _statusPage(String title, Widget child) {
    return AppPage(
      title: title,
      slivers: [SliverFillRemaining(hasScrollBody: false, child: child)],
    );
  }

  Widget _buildNotFound(AppLocalizations l10n) {
    return StatusView(
      icon: CupertinoIcons.exclamationmark_circle,
      tone: context.palette.danger,
      title: l10n.sampleNotRegistered,
      message: l10n.sampleNotFoundBody(widget.sampleCode),
      action: AppButton(
        label: l10n.scanAgain,
        icon: CupertinoIcons.qrcode_viewfinder,
        onPressed: () => Navigator.of(context).pop(false),
      ),
    );
  }

  Widget _buildError(AppLocalizations l10n) {
    return StatusView(
      icon: CupertinoIcons.wifi_slash,
      tone: context.palette.danger,
      liveRegion: true,
      title: l10n.loadFailed,
      message: _errorMessage,
      detail: _serverUrl == null
          ? null
          : ServerAddressNotice(
              color: context.palette.danger.foreground,
              address: _serverUrl,
              onOpenSettings: _openSettings,
            ),
      action: AppButton(
        label: l10n.tryAgain,
        icon: CupertinoIcons.refresh,
        onPressed: _fetchSample,
      ),
    );
  }

  Widget _buildSuccess(AppLocalizations l10n) {
    return StatusView(
      icon: CupertinoIcons.checkmark_circle_fill,
      tone: context.palette.success,
      liveRegion: true,
      title: l10n.updateSuccessful,
      message: l10n.stageSaved(_selectedStage?.name ?? ''),
    );
  }

  List<Widget> _buildForm(AppLocalizations l10n) {
    final sample = _sample;
    final stagesAsync = ref.watch(stagesProvider);
    final palette = context.palette;

    return [
      if (sample == null)
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.xl),
          child: _buildUnknownBanner(l10n),
        )
      else ...[
        if (sample.isFromCache)
          ToneBanner(
            dense: true,
            icon: CupertinoIcons.cloud_download,
            tone: palette.warning,
            title: l10n.cachedNotice,
          ),
        // Said plainly, because nothing is preselected for a finished sample
        // and an empty picker on its own would read as a fault.
        if (sample.status == SampleStatus.completed)
          ToneBanner(
            dense: true,
            icon: CupertinoIcons.checkmark_seal,
            tone: palette.success,
            title: l10n.workflowComplete,
          ),
        SampleSummaryCard(sample: sample, showIdent: false),
        SampleIdentityCard(sample: sample, onEdit: _openIdentity),
        SampleHistorySection(sample: sample),
      ],
      ..._buildStagePicker(l10n, stagesAsync),
      if (_isOverriding) _buildOverridePanel(l10n),
      InsetSection(
        header: l10n.fieldNotes,
        // Read-only during an override, with the reason why underneath.
        //
        // The server writes `notes = reason` on a correction, so anything typed
        // here was being discarded on the way into the database and the preparator
        // was never told. It is no longer sent (see scanUpdateBody) — but hiding
        // or clearing the field would replace one silent loss with another, and
        // _isOverriding flips as the stage picker changes, so the field would
        // appear and vanish under their thumb. Left visible, left unsent, and
        // explained.
        footer: _isOverriding ? l10n.overrideNotesReplaced : null,
        children: [
          InsetCustomRow(
            child: CupertinoTextField.borderless(
              controller: _notesController,
              maxLines: 3,
              readOnly: _isOverriding,
              placeholder: l10n.fieldNotesHint,
              placeholderStyle: AppText.body.copyWith(
                color: palette.tertiaryLabel,
              ),
              style: AppText.body.copyWith(
                color: _isOverriding ? palette.secondaryLabel : palette.label,
              ),
              padding: EdgeInsets.zero,
            ),
          ),
        ],
      ),
      // Suppressed in the error state, which shows the same message already.
      if (_errorMessage != null && _loadState != _LoadState.error) ...[
        ToneBanner(
          icon: CupertinoIcons.exclamationmark_circle,
          tone: palette.danger,
          title: _errorMessage!,
        ),
        const SizedBox(height: AppSpacing.xl),
      ],
      if (_needsSampleIdent) ...[
        _buildIdentRequired(l10n),
        const SizedBox(height: AppSpacing.xl),
      ],
      AppButton(
        label: l10n.saveAndUpdate,
        isBusy: _isSubmitting,
        onPressed: _selectedStage == null || _needsSampleIdent
            ? null
            : _handleSubmit,
      ),
    ];
  }

  /// Why the save button is off. Online, with the way to fix it; from a cached
  /// copy with no signal, saying that it cannot be fixed from here just now.
  Widget _buildIdentRequired(AppLocalizations l10n) {
    final palette = context.palette;
    final offline = _sample!.isFromCache;
    return ToneBanner(
      icon: CupertinoIcons.exclamationmark_triangle_fill,
      tone: palette.warning,
      title: offline ? l10n.sampleIdRequiredOffline : l10n.sampleIdRequired,
      detail: offline
          ? null
          : AppButton(
              label: l10n.fillSampleId,
              icon: CupertinoIcons.plus_circle,
              style: AppButtonStyle.tinted,
              onPressed: _openIdentity,
            ),
    );
  }

  /// Offered only when the pick breaks the order: a step back, or a skip.
  ///
  /// The server accepts `force` from a PREPARATOR alone — the role standing at
  /// the rack when a mis-scan happens — and refuses it without a reason, so the
  /// reason is required here too. An ordinary next-stage move shows nothing
  /// extra, because there is nothing to explain.
  Widget _buildOverridePanel(AppLocalizations l10n) {
    final palette = context.palette;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ToneBanner(
            icon: CupertinoIcons.exclamationmark_triangle,
            tone: palette.warning,
            title: l10n.overrideTitle,
            message: l10n.overrideBody,
          ),
          const SizedBox(height: AppSpacing.md),
          InsetSection(
            margin: EdgeInsets.zero,
            header: l10n.overrideReason,
            children: [
              InsetCustomRow(
                child: CupertinoTextField.borderless(
                  controller: _reasonController,
                  maxLines: 2,
                  placeholder: l10n.overrideReasonHint,
                  placeholderStyle: AppText.body.copyWith(
                    color: palette.tertiaryLabel,
                  ),
                  style: AppText.body.copyWith(color: palette.label),
                  padding: EdgeInsets.zero,
                  onChanged: (_) {
                    if (_errorMessage != null) {
                      setState(() => _errorMessage = null);
                    }
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// The sample is not on the phone and the server cannot be asked. Say so
  /// plainly, then get out of the preparator's way.
  Widget _buildUnknownBanner(AppLocalizations l10n) {
    final palette = context.palette;

    return ToneBanner(
      icon: CupertinoIcons.cloud_moon,
      tone: palette.warning,
      title: l10n.offlineUnknownTitle,
      message: l10n.offlineUnknownBody,
      detail: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          SampleCodeText(
            widget.sampleCode,
            style: AppText.headline.copyWith(
              color: palette.warning.onBackground,
            ),
          ),
          if (_serverUrl != null) ...[
            const SizedBox(height: AppSpacing.sm),
            ServerAddressNotice(
              color: palette.warning.onBackground,
              address: _serverUrl,
              onOpenSettings: _openSettings,
            ),
          ],
        ],
      ),
    );
  }

  /// The stage list — identical whether or not the sample's own details could
  /// be loaded.
  List<Widget> _buildStagePicker(
    AppLocalizations l10n,
    AsyncValue<List<StageModel>> stagesAsync,
  ) {
    return [
      InsetSectionHeading(text: l10n.selectNextStage),
      stagesAsync.when(
        // Five rows of the right shape. The stage list is prefetched twice
        // before anyone reaches this screen, so it is the one placeholder
        // most preparators will never see.
        loading: () => const StagePickerSkeleton(),
        error: (error, stackTrace) => Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.xl),
          child: ToneBanner(
            icon: CupertinoIcons.exclamationmark_circle,
            tone: context.palette.danger,
            title: l10n.stageListFailed,
          ),
        ),
        data: (stages) {
          // Nothing can be recorded against a workflow with no stages. Say so
          // rather than throwing out of `build`: `stages.first` on an empty
          // list is a StateError, and an exception thrown while rendering
          // reaches the preparator as a dead screen with no explanation.
          if (stages.isEmpty) return const StagePickerEmpty();

          _selectedStage ??= _defaultStage(stages);

          return StagePicker(
            stages: stages,
            selectedId: _selectedStage?.id,
            onChanged: (id) => setState(() {
              _selectedStage = stages.firstWhere((stage) => stage.id == id);
              _stageChosenByPreparator = true;
            }),
          );
        },
      ),
    ];
  }

  /// The stage the preparator most likely wants: the one after where the sample
  /// has reached. Offline with no cached sample there is no current stage to
  /// step on from, so start at the top of the list.
  ///
  /// Null once the sample is past its last stage. This used to fall back to
  /// `stages.first`, so a finished sample opened with Preparation already
  /// ticked — offering to move it backwards, which the server refuses unless
  /// it is sent as an override with a reason. Preselecting nothing is the
  /// honest answer, and the banner above says why.
  StageModel? _defaultStage(List<StageModel> stages) {
    final current = _sample?.currentStage;
    if (current == null) return stages.first;

    for (final stage in stages) {
      if (stage.sequenceOrder == current.sequenceOrder + 1) return stage;
    }
    return null;
  }
}
