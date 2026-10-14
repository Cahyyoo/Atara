import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../models/master_option.dart';
import '../models/sample_identity.dart';
import '../models/sample_model.dart';
import '../providers/master_options_provider.dart';
import '../services/api_error_text.dart';
import '../services/api_exception.dart';
import '../services/api_service.dart';
import '../services/sample_ident.dart';
import '../theme/app_theme.dart';
import '../widgets/app_primitives.dart';
import '../widgets/ios/app_page.dart';
import '../widgets/ios/app_toast.dart';
import '../widgets/ios/inset_section.dart';
import '../widgets/ios/ios_button.dart';
import '../widgets/master_option_picker.dart';
import '../widgets/status_view.dart';

/// Fills in or corrects a barcode's Sample ID: the phone's version of the
/// identity form the Database role uses on the website.
///
/// The same nine parts, in the same order and under the same names, composed
/// into the same id — previewed as it is typed, checked against every other
/// sample before it can be saved, and saved by barcode. Pops `true` once a
/// change is saved.
///
/// The sample is always read fresh from the server on the way in. An identity
/// edited from a cached copy could quietly put back parts somebody else had
/// already corrected, and saving needs the server anyway.
class SampleIdentityScreen extends ConsumerStatefulWidget {
  const SampleIdentityScreen({
    super.key,
    required this.sampleCode,
    @visibleForTesting this.fetchSample,
    @visibleForTesting this.submitIdentity,
  });

  final String sampleCode;

  /// The two network calls, isolated so a test can answer them; null in every
  /// production call site. The same seam SampleDetailScreen has, for the same
  /// reason: ApiService is a singleton with no other way in.
  final Future<SampleModel> Function(String sampleCode)? fetchSample;
  final Future<IdentityCheck> Function(
    SampleIdentity identity, {
    required bool dryRun,
  })?
  submitIdentity;

  @override
  ConsumerState<SampleIdentityScreen> createState() =>
      _SampleIdentityScreenState();
}

enum _LoadState { loading, error, loaded }

/// The four typed parts, with the bound each is checked against.
enum _NumberField {
  sequenceNo(999999),
  sampleNo(999999),
  sackCount(99999);

  const _NumberField(this.max);

  final int max;
}

class _SampleIdentityScreenState extends ConsumerState<SampleIdentityScreen> {
  _LoadState _loadState = _LoadState.loading;
  String? _loadError;

  /// The identity as the server last had it: what "changed" is measured from.
  SampleIdentity? _initial;
  String? _initialIdent;

  final Map<MasterKind, String?> _picked = {};
  final _barging = TextEditingController();
  final Map<_NumberField, TextEditingController> _numbers = {
    for (final field in _NumberField.values) field: TextEditingController(),
  };

  /// The server's answer for the identity as it stood when last checked.
  IdentityCheck? _check;
  bool _isChecking = false;
  Timer? _debounce;

  /// Which check is the latest: typing fires one per pause, and a slow early
  /// answer must not land last and clear a clash a later one found.
  int _checkSeq = 0;

  bool _isSaving = false;
  String? _saveError;

  @override
  void initState() {
    super.initState();
    _barging.addListener(_changed);
    for (final controller in _numbers.values) {
      controller.addListener(_changed);
    }
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _barging.dispose();
    for (final controller in _numbers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    // Called from initState too, where there is nothing to reset yet and
    // neither setState nor an inherited lookup is allowed.
    if (_loadState != _LoadState.loading) {
      setState(() {
        _loadState = _LoadState.loading;
        _loadError = null;
      });
    }
    try {
      final fetch = widget.fetchSample ?? ApiService.instance.getSampleByCode;
      final sample = await fetch(widget.sampleCode);
      if (!mounted) return;
      final l10n = AppLocalizations.of(context)!;
      final identity = sample.identity;
      // A copy off the device is not good enough to edit from; see the class.
      if (sample.isFromCache || identity == null) {
        setState(() {
          _loadState = _LoadState.error;
          _loadError = sample.isFromCache
              ? l10n.sampleIdOnlineOnly
              : l10n.sampleNotRegistered;
        });
        return;
      }
      _initial = identity;
      _initialIdent = sample.sampleIdent;
      _picked
        ..[MasterKind.place] = identity.placeId
        ..[MasterKind.rockType] = identity.rockTypeId
        ..[MasterKind.nonProd] = identity.nonProdId
        ..[MasterKind.sir] = identity.sirId
        ..[MasterKind.pit] = identity.pitId;
      _barging.text = identity.bargingNo ?? '';
      _numbers[_NumberField.sequenceNo]!.text =
          identity.sequenceNo?.toString() ?? '';
      _numbers[_NumberField.sampleNo]!.text =
          identity.sampleNo?.toString() ?? '';
      _numbers[_NumberField.sackCount]!.text =
          identity.sackCount?.toString() ?? '';
      setState(() => _loadState = _LoadState.loaded);
    } on ApiException catch (error) {
      if (!mounted) return;
      final l10n = AppLocalizations.of(context)!;
      setState(() {
        _loadState = _LoadState.error;
        _loadError = error.isNotFound
            ? l10n.sampleNotRegistered
            : apiErrorText(l10n, error);
      });
    } catch (_) {
      if (!mounted) return;
      final l10n = AppLocalizations.of(context)!;
      setState(() {
        _loadState = _LoadState.error;
        _loadError = l10n.unexpectedError;
      });
    }
  }

  /// The number typed into [field], null when empty, or [_invalid] when it is
  /// not a whole number within the field's bound.
  static const int _invalid = -1;

  int? _numberOf(_NumberField field) {
    final text = _numbers[field]!.text.trim();
    if (text.isEmpty) return null;
    final value = int.tryParse(text);
    if (value == null || value < 0 || value > field.max) return _invalid;
    return value;
  }

  bool get _bargingTooLong => _barging.text.trim().length > 32;

  bool get _isValid =>
      !_bargingTooLong &&
      _NumberField.values.every((field) => _numberOf(field) != _invalid);

  /// The identity as the form holds it now, or null while a part is invalid.
  SampleIdentity? get _current {
    if (!_isValid || _initial == null) return null;
    final barging = _barging.text.trim();
    return SampleIdentity(
      labRecordId: _initial!.labRecordId,
      labCode: _initial!.labCode,
      placeId: _picked[MasterKind.place],
      rockTypeId: _picked[MasterKind.rockType],
      nonProdId: _picked[MasterKind.nonProd],
      sirId: _picked[MasterKind.sir],
      pitId: _picked[MasterKind.pit],
      bargingNo: barging.isEmpty ? null : barging,
      sequenceNo: _numberOf(_NumberField.sequenceNo),
      sampleNo: _numberOf(_NumberField.sampleNo),
      sackCount: _numberOf(_NumberField.sackCount),
    );
  }

  bool get _isDirty {
    final current = _current;
    if (current == null || _initial == null) return _initial != null;
    final a = current.toPayload();
    final b = _initial!.toPayload();
    return a.keys.any((key) => a[key] != b[key]);
  }

  /// Every edit: redraw the preview now, ask the server once typing pauses.
  void _changed() {
    if (_loadState != _LoadState.loaded) return;
    setState(() {
      _saveError = null;
      _check = null;
    });
    _debounce?.cancel();
    final current = _current;
    if (current == null || !_isDirty) {
      setState(() => _isChecking = false);
      return;
    }
    setState(() => _isChecking = true);
    _debounce = Timer(
      const Duration(milliseconds: 400),
      () => _runCheck(current),
    );
  }

  Future<void> _runCheck(SampleIdentity identity) async {
    final mine = ++_checkSeq;
    try {
      final check = await _submit(identity, dryRun: true);
      if (!mounted || mine != _checkSeq) return;
      setState(() {
        _check = check;
        _isChecking = false;
      });
    } catch (_) {
      // The check is a courtesy; the save asks the same question and refuses
      // a clash with a 409, which is shown when it happens.
      if (mounted && mine == _checkSeq) setState(() => _isChecking = false);
    }
  }

  Future<IdentityCheck> _submit(
    SampleIdentity identity, {
    required bool dryRun,
  }) {
    final submit = widget.submitIdentity;
    if (submit != null) return submit(identity, dryRun: dryRun);
    return ApiService.instance.updateSampleIdentity(
      sampleCode: widget.sampleCode,
      identity: identity,
      dryRun: dryRun,
    );
  }

  Future<void> _pick(MasterKind kind, String title) async {
    final pick = await showMasterOptionPicker(
      context,
      kind: kind,
      title: title,
      selectedId: _picked[kind],
    );
    if (pick == null || !mounted) return;
    _picked[kind] = pick.optionId;
    _changed();
  }

  Future<void> _save() async {
    final identity = _current;
    if (identity == null) return;
    final l10n = AppLocalizations.of(context)!;
    _debounce?.cancel();
    setState(() {
      _isSaving = true;
      _saveError = null;
    });
    try {
      await _submit(identity, dryRun: false);
      // Puts the new identity in the device cache, so the screen underneath
      // shows it even if it is next opened without a signal.
      try {
        final fetch = widget.fetchSample ?? ApiService.instance.getSampleByCode;
        await fetch(widget.sampleCode);
      } catch (_) {
        // Saved is saved; the cache catches up on the next open.
      }
      if (!mounted) return;
      AppToast.show(
        context,
        l10n.sampleIdSaved,
        icon: CupertinoIcons.checkmark_circle,
      );
      Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _saveError = apiErrorText(l10n, error));
    } catch (_) {
      if (!mounted) return;
      setState(() => _saveError = l10n.unexpectedError);
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final title = _initialIdent == null ? l10n.fillSampleId : l10n.editSampleId;

    // AppModalPage in every state, so the bar never changes kind mid-life;
    // see SampleDetailScreen for what swapping bar types costs.
    switch (_loadState) {
      case _LoadState.loading:
        return AppModalPage(
          title: title,
          child: const Center(child: CupertinoActivityIndicator()),
        );
      case _LoadState.error:
        return AppModalPage(
          title: title,
          child: StatusView(
            icon: CupertinoIcons.wifi_slash,
            tone: context.palette.danger,
            liveRegion: true,
            title: l10n.loadFailed,
            message: _loadError,
            action: AppButton(
              label: l10n.tryAgain,
              icon: CupertinoIcons.refresh,
              onPressed: _load,
            ),
          ),
        );
      case _LoadState.loaded:
        return AppModalPage(title: title, child: _buildForm(l10n));
    }
  }

  Widget _buildForm(AppLocalizations l10n) {
    final palette = context.palette;
    final options = ref.watch(masterOptionsProvider);
    final all = options.valueOrNull ?? const <MasterOption>[];
    String? code(MasterKind kind) => codeOf(all, _picked[kind]);

    final pickers = <(MasterKind, String, String)>[
      (MasterKind.place, l10n.identityPlace, l10n.pickerChoose),
      (MasterKind.rockType, l10n.identityRockType, l10n.pickerChoose),
      (MasterKind.nonProd, l10n.identityNonProd, l10n.pickerNone),
      (MasterKind.sir, l10n.identitySir, l10n.pickerChoose),
      (MasterKind.pit, l10n.identityPit, l10n.pickerChoose),
    ];

    final preview = _isValid
        ? composeSampleIdent(
            place: code(MasterKind.place),
            rockType: code(MasterKind.rockType),
            nonProd: code(MasterKind.nonProd),
            sir: code(MasterKind.sir),
            pit: code(MasterKind.pit),
            bargingNo: _barging.text,
            sequenceNo: _numberOf(_NumberField.sequenceNo),
            sampleNo: _numberOf(_NumberField.sampleNo),
            sackCount: _numberOf(_NumberField.sackCount),
          )
        : null;

    final clash = _check?.clashSampleCode;
    final canSave =
        _isDirty && _isValid && !_isChecking && clash == null && !_isSaving;

    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.lg,
        AppSpacing.lg,
        AppSpacing.xxl,
      ),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      children: [
        InsetSection(
          children: [
            InsetCustomRow(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: SampleCodeText(widget.sampleCode, large: true),
            ),
            InsetRow(
              title: l10n.labCodeLabel,
              trailing: Text(_initial!.labCode),
            ),
          ],
        ),
        InsetSection(
          footer: options.hasError ? l10n.identityCodesUnavailable : null,
          children: [
            for (final (kind, label, empty) in pickers)
              InsetRow(
                title: label,
                showChevron: true,
                trailing: Text(
                  code(kind) ?? (_picked[kind] == null ? empty : '…'),
                  style: AppText.body.copyWith(
                    color: _picked[kind] == null
                        ? palette.tertiaryLabel
                        : palette.label,
                    fontFamily: _picked[kind] == null
                        ? null
                        : AppText.monoFamily,
                  ),
                ),
                onTap: () => _pick(kind, label),
              ),
          ],
        ),
        InsetSection(
          footer: _numberFooter(l10n),
          children: [
            _FieldRow(
              label: l10n.identityBargingNo,
              controller: _barging,
              hasError: _bargingTooLong,
              keyboardType: TextInputType.text,
            ),
            _FieldRow(
              label: l10n.identitySequenceNo,
              controller: _numbers[_NumberField.sequenceNo]!,
              hasError: _numberOf(_NumberField.sequenceNo) == _invalid,
            ),
            _FieldRow(
              label: l10n.identitySampleNo,
              controller: _numbers[_NumberField.sampleNo]!,
              hasError: _numberOf(_NumberField.sampleNo) == _invalid,
            ),
            _FieldRow(
              label: l10n.identitySackCount,
              controller: _numbers[_NumberField.sackCount]!,
              hasError: _numberOf(_NumberField.sackCount) == _invalid,
            ),
          ],
        ),
        InsetSection(
          header: l10n.sampleIdPreviewTitle,
          footer: _initialIdent != null && preview != _initialIdent
              ? l10n.sampleIdWas(_initialIdent!)
              : null,
          children: [
            InsetCustomRow(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: preview == null
                  ? Text(
                      l10n.sampleIdNeedsPlace,
                      style: AppText.subhead.copyWith(
                        color: palette.secondaryLabel,
                      ),
                    )
                  : FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: AlignmentDirectional.centerStart,
                      child: Text(
                        preview,
                        maxLines: 1,
                        softWrap: false,
                        style: AppText.headline.copyWith(
                          color: clash == null
                              ? palette.label
                              : palette.danger.foreground,
                          fontFamily: AppText.monoFamily,
                        ),
                      ),
                    ),
            ),
          ],
        ),
        if (_isChecking)
          ToneBanner(
            dense: true,
            icon: CupertinoIcons.hourglass,
            tone: palette.neutral,
            title: l10n.sampleIdChecking,
          )
        else if (!_isDirty)
          ToneBanner(
            dense: true,
            icon: CupertinoIcons.info_circle,
            tone: palette.neutral,
            title: l10n.sampleIdUnchanged,
          ),
        if (clash != null) ...[
          ToneBanner(
            icon: CupertinoIcons.exclamationmark_triangle_fill,
            tone: palette.danger,
            title: l10n.sampleIdClash(clash),
          ),
          const SizedBox(height: AppSpacing.lg),
        ],
        if (_saveError != null) ...[
          ToneBanner(
            icon: CupertinoIcons.exclamationmark_circle,
            tone: palette.danger,
            title: _saveError!,
          ),
          const SizedBox(height: AppSpacing.lg),
        ],
        AppButton(
          label: l10n.sampleIdSave,
          icon: CupertinoIcons.checkmark_alt,
          isBusy: _isSaving,
          onPressed: canSave ? _save : null,
        ),
      ],
    );
  }

  String? _numberFooter(AppLocalizations l10n) {
    if (_bargingTooLong) return l10n.bargingTooLong;
    for (final field in _NumberField.values) {
      if (_numberOf(field) == _invalid) return l10n.numberOutOfRange(field.max);
    }
    return null;
  }
}

/// A label on the left and the box it names on the right, inside the card.
class _FieldRow extends StatelessWidget {
  const _FieldRow({
    required this.label,
    required this.controller,
    required this.hasError,
    this.keyboardType = TextInputType.number,
  });

  final String label;
  final TextEditingController controller;
  final bool hasError;
  final TextInputType keyboardType;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final isNumber = keyboardType == TextInputType.number;
    return InsetCustomRow(
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: AppText.body.copyWith(
                color: hasError ? palette.danger.foreground : palette.label,
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          SizedBox(
            width: 140,
            child: CupertinoTextField.borderless(
              controller: controller,
              keyboardType: keyboardType,
              textAlign: TextAlign.end,
              textCapitalization: TextCapitalization.characters,
              autocorrect: false,
              maxLength: isNumber ? 6 : 32,
              maxLengthEnforcement: MaxLengthEnforcement.enforced,
              inputFormatters: isNumber
                  ? [FilteringTextInputFormatter.digitsOnly]
                  : null,
              placeholder: '—',
              placeholderStyle: AppText.body.copyWith(
                color: palette.tertiaryLabel,
              ),
              style: AppText.body.copyWith(
                color: hasError ? palette.danger.foreground : palette.label,
                fontFamily: AppText.monoFamily,
              ),
              padding: EdgeInsets.zero,
            ),
          ),
        ],
      ),
    );
  }
}
