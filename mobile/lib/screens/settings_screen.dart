import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show ThemeMode;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../providers/session_provider.dart';
import '../providers/settings_provider.dart';
import '../providers/theme_provider.dart';
import '../services/settings_service.dart';
import '../theme/app_theme.dart';
import '../widgets/ios/app_page.dart';
import '../widgets/ios/app_toast.dart';
import '../widgets/ios/inset_section.dart';
import '../widgets/loading_swap.dart';
import '../widgets/skeletons.dart';
import 'onboarding_screen.dart';

/// Server address, language, and the way out of the account.
///
/// [isTab] tells the screen whether it is the third tab or a page pushed from
/// the sign-in screen — signed out there is no account to leave, and no tab bar
/// to sit above.
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key, this.isTab = false});

  final bool isTab;

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  final _serverController = TextEditingController();
  bool _isLoading = true;
  String? _serverError;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    // The spinner must come down whatever happens. This is the one screen that
    // fixes a wrong server address, so freezing it strands the operator on the
    // very problem it exists to solve — and an empty field still means "use the
    // default", which is a usable starting point.
    String? url;
    try {
      url = await SettingsService.getServerUrl();
    } catch (_) {
      url = null;
    }

    if (!mounted) return;
    setState(() {
      if (url != null) _serverController.text = url;
      _isLoading = false;
    });
  }

  @override
  void dispose() {
    _serverController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context)!;

    // Checked before it is stored: a typo saved here fails later as a generic
    // "could not reach the server", which points at the network rather than at
    // the setting that actually broke it.
    if (!SettingsService.isValidServerUrl(_serverController.text)) {
      setState(() => _serverError = l10n.serverAddressInvalid);
      return;
    }

    setState(() => _serverError = null);
    await SettingsService.setServerUrl(_serverController.text);
    if (!mounted) return;
    AppToast.show(context, l10n.settingsSaved, icon: CupertinoIcons.checkmark_circle);
  }

  Future<void> _resetServer() async {
    await SettingsService.setServerUrl('');
    if (!mounted) return;
    setState(() => _serverError = null);
    await _load();
  }

  void _openGuide() {
    Navigator.of(context).push(
      CupertinoPageRoute(builder: (context) => const OnboardingScreen()),
    );
  }

  Future<void> _confirmSignOut() async {
    final l10n = AppLocalizations.of(context)!;

    // An action sheet rather than a dialog: iOS uses these for a choice that
    // leaves somewhere, and it names the destructive option in red instead of
    // relying on the operator reading the question.
    final confirmed = await showCupertinoModalPopup<bool>(
      context: context,
      builder: (context) => CupertinoActionSheet(
        title: Text(l10n.signOutConfirm),
        actions: [
          CupertinoActionSheetAction(
            isDestructiveAction: true,
            onPressed: () => Navigator.pop(context, true),
            child: Text(l10n.signOut),
          ),
        ],
        cancelButton: CupertinoActionSheetAction(
          onPressed: () => Navigator.pop(context, false),
          child: Text(l10n.cancel),
        ),
      ),
    );

    if (confirmed != true) return;
    await ref.read(sessionProvider.notifier).logout();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;
    final locale = ref.watch(localeProvider);
    final effective = locale ?? Localizations.localeOf(context).languageCode;
    final themeMode = ref.watch(themeModeProvider);

    // The title and the bar stay put now. The old branch replaced the whole
    // scaffold, so the large title disappeared and then popped back in for a
    // wait that is one preferences read long.
    //
    // LoadingSwap holds the placeholder back for 150ms, which this read
    // almost always beats -- so in practice nothing appears at all, which is
    // the correct amount of ceremony for a wait nobody can perceive.
    return AppPage.list(
      title: l10n.settingsTitle,
      automaticallyImplyLeading: !widget.isTab,
      children: [
        LoadingSwap(
          isLoading: _isLoading,
          placeholder: SettingsSkeleton(showAccount: widget.isTab),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: _sections(l10n, palette, effective, themeMode),
          ),
        ),
      ],
    );
  }

  List<Widget> _sections(
    AppLocalizations l10n,
    AppColors palette,
    String? effective,
    ThemeMode themeMode,
  ) {
    return [
        InsetSection(
          header: l10n.serverAddress,
          footer: _serverError ?? l10n.serverAddressHelp,
          children: [
            InsetCustomRow(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.lg,
                vertical: AppSpacing.xs,
              ),
              child: CupertinoTextField.borderless(
                controller: _serverController,
                keyboardType: TextInputType.url,
                autocorrect: false,
                placeholder: l10n.serverAddressHint,
                placeholderStyle:
                    AppText.body.copyWith(color: palette.tertiaryLabel),
                style: AppText.body.copyWith(
                  color: _serverError == null
                      ? palette.label
                      : palette.danger.foreground,
                  fontFamily: AppText.monoFamily,
                ),
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
                onChanged: (_) {
                  if (_serverError != null) setState(() => _serverError = null);
                },
              ),
            ),
            InsetRow(
              title: l10n.save,
              titleStyle: AppText.body.copyWith(color: palette.accent),
              onTap: _save,
            ),
            InsetRow(
              title: l10n.resetDefault,
              titleStyle: AppText.body.copyWith(color: palette.accent),
              onTap: _resetServer,
            ),
          ],
        ),
        InsetSection(
          header: l10n.appearance,
          children: [
            // System first: it is the default, and it is what most operators
            // should stay on.
            _AppearanceRow(
              label: l10n.appearanceSystem,
              value: ThemeMode.system,
              selected: themeMode,
            ),
            _AppearanceRow(
              label: l10n.appearanceLight,
              value: ThemeMode.light,
              selected: themeMode,
            ),
            _AppearanceRow(
              label: l10n.appearanceDark,
              value: ThemeMode.dark,
              selected: themeMode,
            ),
          ],
        ),
        InsetSection(
          header: l10n.language,
          children: [
            // Endonyms: a language is always named in itself, never
            // translated.
            //
            // The tick follows the language actually in use, not the stored
            // preference. Those differ until the operator chooses one — the
            // setting starts empty and the device decides — and a list with
            // nothing ticked leaves them unable to tell which is in force.
            _LanguageRow(label: 'Bahasa Indonesia', value: 'id', selected: effective),
            _LanguageRow(label: 'English', value: 'en', selected: effective),
          ],
        ),
        InsetSection(
          header: l10n.helpSection,
          footer: l10n.onboardingReopenHelp,
          children: [
            // A chevron because the row opens a page. The rows above it are
            // actions and correctly have none.
            InsetRow(
              title: l10n.onboardingReopen,
              showChevron: true,
              onTap: _openGuide,
            ),
          ],
        ),
      if (widget.isTab)
        InsetSection(
          header: l10n.signOutSection,
          children: [
            InsetRow(
              title: l10n.signOut,
              isDestructive: true,
              onTap: _confirmSignOut,
            ),
          ],
        ),
    ];
  }
}

/// Shaped exactly like [_LanguageRow]: a tick on the row in force, no radios.
class _AppearanceRow extends ConsumerWidget {
  const _AppearanceRow({
    required this.label,
    required this.value,
    required this.selected,
  });

  final String label;
  final ThemeMode value;
  final ThemeMode selected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = context.palette;

    return InsetRow(
      title: label,
      onTap: () => ref.read(themeModeProvider.notifier).setMode(value),
      trailing: selected == value
          ? Icon(CupertinoIcons.check_mark, size: 20, color: palette.accent)
          : null,
    );
  }
}

class _LanguageRow extends ConsumerWidget {
  const _LanguageRow({
    required this.label,
    required this.value,
    required this.selected,
  });

  final String label;
  final String value;
  final String? selected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = context.palette;
    final isSelected = selected == value;

    return InsetRow(
      title: label,
      onTap: () => ref.read(localeProvider.notifier).setLocale(value),
      trailing: isSelected
          ? Icon(CupertinoIcons.check_mark, size: 20, color: palette.accent)
          : null,
    );
  }
}
