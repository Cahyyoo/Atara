import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../models/master_option.dart';
import '../providers/master_options_provider.dart';
import '../services/api_error_text.dart';
import '../services/api_exception.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import 'ios/app_page.dart';
import 'ios/inset_section.dart';

/// What the picker hands back: the option chosen, or null for "cleared".
/// The route itself returns null when the preparator backs out unchanged.
class MasterPick {
  const MasterPick(this.optionId);

  final String? optionId;
}

/// Opens the picker for one master list, the phone's version of the
/// searchable dropdown on the website's identity form.
Future<MasterPick?> showMasterOptionPicker(
  BuildContext context, {
  required MasterKind kind,
  required String title,
  required String? selectedId,
}) {
  return Navigator.of(context).push<MasterPick>(
    CupertinoPageRoute(
      builder: (context) =>
          _MasterOptionPicker(kind: kind, title: title, selectedId: selectedId),
    ),
  );
}

class _MasterOptionPicker extends ConsumerStatefulWidget {
  const _MasterOptionPicker({
    required this.kind,
    required this.title,
    required this.selectedId,
  });

  final MasterKind kind;
  final String title;
  final String? selectedId;

  @override
  ConsumerState<_MasterOptionPicker> createState() =>
      _MasterOptionPickerState();
}

class _MasterOptionPickerState extends ConsumerState<_MasterOptionPicker> {
  final _search = TextEditingController();
  bool _isCreating = false;
  String? _createError;

  @override
  void initState() {
    super.initState();
    _search.addListener(() => setState(() => _createError = null));
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  /// Adds the typed code to this list and picks it, as "Buat" does on the
  /// website. When somebody added the same code first, theirs is picked.
  Future<void> _create(String code) async {
    setState(() {
      _isCreating = true;
      _createError = null;
    });
    final l10n = AppLocalizations.of(context)!;
    try {
      final option = await ApiService.instance.createMasterOption(
        kind: widget.kind,
        code: code,
      );
      ref.invalidate(masterOptionsProvider);
      if (mounted) Navigator.of(context).pop(MasterPick(option.id));
    } on ApiException catch (error) {
      if (error.statusCode == 409) {
        ref.invalidate(masterOptionsProvider);
        final all = await ref.read(masterOptionsProvider.future);
        final existing = all.where(
          (option) => option.kind == widget.kind && option.code == code,
        );
        if (existing.isNotEmpty && mounted) {
          Navigator.of(context).pop(MasterPick(existing.first.id));
          return;
        }
      }
      if (mounted) {
        setState(
          () =>
              _createError = l10n.pickerCreateFailed(apiErrorText(l10n, error)),
        );
      }
    } finally {
      if (mounted) setState(() => _isCreating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;
    final async = ref.watch(masterOptionsProvider);
    final query = _search.text.trim().toUpperCase();

    Widget body;
    if (async.isLoading && !async.hasValue) {
      body = const Center(child: CupertinoActivityIndicator());
    } else if (async.hasError && !async.hasValue) {
      body = Padding(
        padding: AppSpacing.page,
        child: Text(
          l10n.identityCodesUnavailable,
          style: AppText.subhead.copyWith(color: palette.secondaryLabel),
        ),
      );
    } else {
      final all = optionsOfKind(async.value!, widget.kind);
      // Retired codes are not offered, except the one already chosen: it is
      // still this sample's, and hiding it would read as the part being empty.
      final offered = all
          .where((option) => option.isActive || option.id == widget.selectedId)
          .where(
            (option) =>
                query.isEmpty ||
                option.code.contains(query) ||
                (option.label?.toUpperCase().contains(query) ?? false),
          )
          .toList();
      final exists = all.any((option) => option.code == query);
      final canCreate =
          query.isNotEmpty && !exists && masterCodePattern.hasMatch(query);

      body = ListView(
        padding: AppSpacing.page,
        children: [
          InsetSection(
            footer: query.isNotEmpty && !exists && !canCreate
                ? l10n.pickerCodeRule
                : _createError,
            children: [
              if (canCreate)
                InsetRow(
                  title: l10n.pickerCreate(query),
                  titleStyle: AppText.body.copyWith(color: palette.accent),
                  leading: _isCreating
                      ? const CupertinoActivityIndicator()
                      : Icon(
                          CupertinoIcons.plus_circle,
                          size: 20,
                          color: palette.accent,
                        ),
                  onTap: _isCreating ? null : () => _create(query),
                ),
              if (widget.selectedId != null && query.isEmpty)
                InsetRow(
                  title: l10n.pickerClear,
                  isDestructive: true,
                  onTap: () =>
                      Navigator.of(context).pop(const MasterPick(null)),
                ),
              for (final option in offered)
                InsetRow(
                  title: option.code,
                  titleStyle: AppText.body.copyWith(
                    color: palette.label,
                    fontFamily: AppText.monoFamily,
                  ),
                  subtitle: [
                    if (option.label != null && option.label!.isNotEmpty)
                      option.label!,
                    if (!option.isActive) l10n.pickerRetired,
                  ].join(' · ').ifEmptyNull,
                  trailing: option.id == widget.selectedId
                      ? Icon(
                          CupertinoIcons.checkmark,
                          size: 20,
                          color: palette.accent,
                        )
                      : null,
                  onTap: () => Navigator.of(context).pop(MasterPick(option.id)),
                ),
              if (offered.isEmpty && !canCreate)
                InsetCustomRow(
                  child: Text(
                    l10n.pickerNoMatch,
                    style: AppText.subhead.copyWith(
                      color: palette.secondaryLabel,
                    ),
                  ),
                ),
            ],
          ),
        ],
      );
    }

    return AppModalPage(
      title: widget.title,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.md,
              AppSpacing.lg,
              0,
            ),
            child: CupertinoSearchTextField(
              controller: _search,
              placeholder: l10n.pickerSearch,
              autocorrect: false,
            ),
          ),
          Expanded(child: body),
        ],
      ),
    );
  }
}

extension on String {
  String? get ifEmptyNull => isEmpty ? null : this;
}
