import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show ThemeMode;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../providers/session_provider.dart';
import '../providers/settings_provider.dart';
import '../providers/theme_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/ios/app_page.dart';
import '../widgets/ios/inset_section.dart';
import '../widgets/version_footer.dart';
import 'change_password_screen.dart';
import 'onboarding_screen.dart';

/// Appearance, language, the guide, and the way out of the account.
///
/// No server address: the lab admin sets that on the website and every app
/// follows it (see ServerConfigSync), so there is nothing here to get wrong.
///
/// [isTab] tells the screen whether it is the tab or a pushed page — outside
/// the tab there is no account to leave, and no tab bar to sit above.
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key, this.isTab = false});

  final bool isTab;

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  void _openGuide() {
    Navigator.of(context).push(
      CupertinoPageRoute(builder: (context) => const OnboardingScreen()),
    );
  }

  Future<void> _confirmSignOut() async {
    final l10n = AppLocalizations.of(context)!;

    // An action sheet rather than a dialog: iOS uses these for a choice that
    // leaves somewhere, and it names the destructive option in red instead of
    // relying on the preparator reading the question.
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

  void _openChangePassword() {
    Navigator.of(context).push(
      CupertinoPageRoute<void>(
        builder: (_) => const ChangePasswordScreen(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final locale = ref.watch(localeProvider);
    final effective = locale ?? Localizations.localeOf(context).languageCode;
    final themeMode = ref.watch(themeModeProvider);

    return AppPage.list(
      title: l10n.settingsTitle,
      automaticallyImplyLeading: !widget.isTab,
      children: [
        ..._sections(l10n, effective, themeMode),
        const VersionFooter(),
      ],
    );
  }

  List<Widget> _sections(
    AppLocalizations l10n,
    String? effective,
    ThemeMode themeMode,
  ) {
    return [
        InsetSection(
          header: l10n.appearance,
          children: [
            // System first: it is the default, and it is what most preparators
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
            // preference. Those differ until the preparator chooses one — the
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
              title: l10n.changePasswordTitle,
              showChevron: true,
              onTap: _openChangePassword,
            ),
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
