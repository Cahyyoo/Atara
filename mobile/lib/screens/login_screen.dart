import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';

import '../providers/session_provider.dart';
import '../services/api_error_text.dart';
import '../models/login_result.dart';
import '../services/api_exception.dart';
import '../services/time_text.dart';
import '../theme/app_theme.dart';
import '../widgets/ios/inset_section.dart';
import '../widgets/ios/ios_button.dart';
import '../widgets/brand_mark.dart';
import '../widgets/server_address_notice.dart';
import 'second_factor_screen.dart';
import 'settings_screen.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  // Not prefilled: a real account name on the sign-in screen is a free hint.
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _passwordFocus = FocusNode();

  bool _isSubmitting = false;
  String? _errorMessage;

  /// True when the last attempt never reached the server. That is the one
  /// failure a wrong server address causes, and the only one worth pointing at
  /// the settings for — a rejected password has nothing to do with it.
  bool _serverUnreachable = false;
  bool _obscurePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    // Two taps inside one frame both got here before the button greyed out:
    // two sign-ins, the second ending the session the first had just opened.
    if (_isSubmitting) return;
    // Resolved before the await: reading localisations off the context after
    // one is only safe while the widget is still mounted.
    final l10n = AppLocalizations.of(context)!;

    final email = _emailController.text.trim();
    final password = _passwordController.text;

    // The form validators went with the Material fields. Checking here keeps
    // the same two rules in one place, next to the call they guard.
    if (email.isEmpty) {
      setState(() {
        _errorMessage = l10n.emailRequired;
        _serverUnreachable = false;
      });
      return;
    }
    if (password.isEmpty) {
      setState(() {
        _errorMessage = l10n.passwordRequired;
        _serverUnreachable = false;
      });
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
      _serverUnreachable = false;
    });
    // Read, and acted on: trying again is the answer to "you were signed out",
    // so it should not still be standing over whatever happens next.
    ref.read(signedOutNoticeProvider.notifier).state = null;

    final session = ref.read(sessionProvider.notifier);
    try {
      final result = await session.login(email, password);
      if (!mounted) return;
      // A correct password no longer always means a session. When the account
      // carries a second factor the server withholds the token and hands back a
      // challenge instead, and this is the only place that can put a screen in
      // front of it.
      //
      // A pushed route, not another state here: the sign-in form is two fields
      // and is asserted to be exactly two, and the challenge is a single-use
      // credential with a two-minute life that should die with its route.
      if (result case final LoginSecondFactor factor) {
        final refusal = await Navigator.of(context).push<String>(
          CupertinoPageRoute(
            builder: (context) => SecondFactorScreen(factor: factor),
          ),
        );
        // Back here means they left without finishing, or the session landed and
        // AuthGate has already swapped the app out from under this route. Either
        // way there is nothing to do but stop showing a spinner — unless the
        // second factor passed for an account this app is not for, in which case
        // that screen hands the sentence back to be said here, where every other
        // sign-in failure is said.
        if (refusal != null && mounted) {
          setState(() {
            _errorMessage = refusal;
            _serverUnreachable = false;
          });
        }
      }
    } on OperatorOnlyException {
      if (!mounted) return;
      setState(() {
        _errorMessage = l10n.signInOperatorsOnly;
        _serverUnreachable = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _errorMessage = apiErrorText(l10n, error);
        _serverUnreachable = error.kind == ApiErrorKind.unreachable;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _errorMessage = l10n.unexpectedError);
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  void _openSettings() {
    Navigator.of(
      context,
    ).push(CupertinoPageRoute(builder: (context) => const SettingsScreen()));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;
    final notice = ref.watch(signedOutNoticeProvider);

    return CupertinoPageScaffold(
      backgroundColor: palette.groupedBackground,
      child: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.lg,
              vertical: AppSpacing.xxl,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Center(child: BrandMark()),
                const SizedBox(height: AppSpacing.xl),
                Text(
                  l10n.appTitle,
                  textAlign: TextAlign.center,
                  style: AppText.title1.copyWith(color: palette.label),
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  l10n.loginSubtitle,
                  textAlign: TextAlign.center,
                  style: AppText.subhead.copyWith(
                    color: palette.secondaryLabel,
                  ),
                ),
                if (notice != null) ...[
                  const SizedBox(height: AppSpacing.xl),
                  // Sealed, so a third reason added server-side becomes a
                  // compile error here rather than a silent blank.
                  switch (notice) {
                    SessionReplaced() => _ReplacedNotice(replaced: notice),
                    SessionEnded() => _EndedNotice(ended: notice),
                  },
                ],
                const SizedBox(height: AppSpacing.xxl),
                // One section holding both fields, divided by a hairline. Two
                // separate bordered boxes is the Material habit; iOS groups
                // fields that are answered together.
                InsetSection(
                  margin: EdgeInsets.zero,
                  children: [
                    _Field(
                      controller: _emailController,
                      placeholder: l10n.emailHint,
                      label: l10n.email,
                      icon: CupertinoIcons.mail,
                      keyboardType: TextInputType.emailAddress,
                      autofocus: true,
                      onSubmitted: (_) => _passwordFocus.requestFocus(),
                    ),
                    _Field(
                      controller: _passwordController,
                      focusNode: _passwordFocus,
                      placeholder: l10n.passwordHint,
                      label: l10n.password,
                      icon: CupertinoIcons.lock,
                      obscure: _obscurePassword,
                      onSubmitted: (_) => _handleLogin(),
                      trailing: CupertinoButton(
                        padding: EdgeInsets.zero,
                        minimumSize: const Size(32, 32),
                        onPressed: () => setState(
                          () => _obscurePassword = !_obscurePassword,
                        ),
                        child: Icon(
                          _obscurePassword
                              ? CupertinoIcons.eye
                              : CupertinoIcons.eye_slash,
                          size: 20,
                          color: palette.secondaryLabel,
                        ),
                      ),
                    ),
                  ],
                ),
                if (_errorMessage != null) ...[
                  const SizedBox(height: AppSpacing.md),
                  // liveRegion is the Flutter counterpart of role="alert": the
                  // failure is announced, not only recoloured.
                  Semantics(
                    liveRegion: true,
                    container: true,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _errorMessage!,
                          style: AppText.footnote.copyWith(
                            color: palette.danger.foreground,
                          ),
                        ),
                        // Offered only when the server was never reached, which
                        // is what a wrong address looks like. The fix is then
                        // one tap from the problem rather than something the
                        // operator has to guess at.
                        if (_serverUnreachable)
                          ServerAddressNotice(
                            color: palette.danger.foreground,
                            onOpenSettings: _openSettings,
                          ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: AppSpacing.xl),
                AppButton(
                  label: l10n.signIn,
                  isBusy: _isSubmitting,
                  onPressed: _handleLogin,
                ),
                const SizedBox(height: AppSpacing.sm),
                // The server address lives in Settings, and Settings used to
                // open only from the home screen — which needs a session. A
                // wrong address therefore locked the operator out with no way
                // back, reinstalling included.
                AppButton(
                  label: l10n.settingsTitle,
                  style: AppButtonStyle.plain,
                  icon: CupertinoIcons.gear_alt,
                  onPressed: _openSettings,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Why the operator is looking at this screen when they never signed out.
///
/// Warning, not danger: nothing is wrong with this phone or its operator, and
/// signing in again here is a legitimate answer. Announced, because it replaces
/// the screen they were working on without a tap of theirs.
///
/// When the server described the other device field by field, the sentence is
/// followed by one row per thing it knew — so "was that me, at my desk?" can be
/// answered at a glance. Otherwise it falls back to the server's one-line label.
/// Somebody on the website ended this session: an administrator, or this
/// account's password being changed somewhere else.
///
/// Shaped like [_ReplacedNotice] on purpose -- same box, same tone. The only
/// difference is the sentence, because the cause is different and the
/// operator's next step is too: there is no other phone to go and close.
class _EndedNotice extends StatelessWidget {
  const _EndedNotice({required this.ended});

  final SessionEnded ended;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;
    final at = ended.at;
    final time = at == null
        ? null
        : momentText(
            at,
            localeName: Localizations.localeOf(context).toString(),
          );

    final String text;
    if (ended.wasPasswordChange) {
      text = time == null
          ? l10n.sessionEndedPasswordChanged
          : l10n.sessionEndedPasswordChangedAt(time);
    } else {
      text = time == null
          ? l10n.sessionEndedByAdmin
          : l10n.sessionEndedByAdminAt(time);
    }

    final color = palette.warning.onBackground;

    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: palette.warning.background,
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(CupertinoIcons.lock_shield, size: 20, color: color),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                text,
                style: AppText.footnote.copyWith(color: color),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReplacedNotice extends StatelessWidget {
  const _ReplacedNotice({required this.replaced});

  final SessionReplaced replaced;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;
    final at = replaced.at;
    final device = replaced.device;
    final info = replaced.deviceInfo;
    final time = at == null
        ? null
        : momentText(
            at,
            localeName: Localizations.localeOf(context).toString(),
          );

    final String text;
    if (info != null) {
      text = time == null
          ? l10n.sessionReplacedElsewhere
          : l10n.sessionReplacedElsewhereAt(time);
    } else if (time == null) {
      text = l10n.sessionReplaced;
    } else {
      text = device == null
          ? l10n.sessionReplacedAt(time)
          : l10n.sessionReplacedOnAt(device, time);
    }

    final rows = info == null ? const <(String, String)>[] : _rows(l10n, info);
    final color = palette.warning.onBackground;

    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: palette.warning.background,
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(CupertinoIcons.device_phone_portrait, size: 20, color: color),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(text, style: AppText.footnote.copyWith(color: color)),
                  if (rows.isNotEmpty) const SizedBox(height: AppSpacing.xs),
                  for (final (label, value) in rows)
                    Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: '$label: ',
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          TextSpan(text: value),
                        ],
                      ),
                      style: AppText.footnote.copyWith(color: color),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Label and value for each thing the server knew, in a fixed order. A field
  /// it did not know is a row left out, never a row reading "unknown".
  static List<(String, String)> _rows(AppLocalizations l10n, DeviceInfo info) {
    final kind = switch (info.kind) {
      DeviceKind.phone => l10n.deviceKindPhone,
      DeviceKind.desktop => l10n.deviceKindComputer,
      DeviceKind.tablet => l10n.deviceKindTablet,
      null => null,
    };
    final os = info.os;
    final browser = info.browser;
    final model = info.model;
    return [
      if (kind != null) (l10n.sessionReplacedDevice, kind),
      if (os != null)
        (l10n.sessionReplacedSystem, _withVersion(os, info.osVersion)),
      // The phone app has no browser, and saying which one it is not would
      // only confuse. Its own name is the useful thing.
      if (info.app)
        (l10n.sessionReplacedApp, _appName)
      else if (browser != null)
        (
          l10n.sessionReplacedBrowser,
          _withVersion(browser, info.browserVersion),
        ),
      if (model != null) (l10n.sessionReplacedModel, model),
    ];
  }

  /// The product's name, the same in every language.
  static const _appName = 'Atara';

  static String _withVersion(String name, String? version) =>
      version == null ? name : '$name $version';
}

/// One labelled field inside the grouped section.
///
/// iOS puts the label on the leading edge of the row rather than floating it
/// above the box, which is what lets two fields share one card.
class _Field extends StatelessWidget {
  const _Field({
    required this.controller,
    required this.placeholder,
    required this.label,
    required this.icon,
    this.focusNode,
    this.keyboardType,
    this.obscure = false,
    this.autofocus = false,
    this.trailing,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String placeholder;
  final String label;
  final IconData icon;
  final FocusNode? focusNode;
  final TextInputType? keyboardType;
  final bool obscure;
  final bool autofocus;
  final Widget? trailing;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return InsetCustomRow(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.xs,
      ),
      child: Row(
        children: [
          Icon(icon, size: 20, color: palette.secondaryLabel),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            // The label is not drawn: the icon and the placeholder already say
            // which field this is, and iOS sign-in forms do the same. It is
            // still announced, so the field is not nameless to a screen reader.
            child: Semantics(
              textField: true,
              label: label,
              child: CupertinoTextField.borderless(
                controller: controller,
                focusNode: focusNode,
                autofocus: autofocus,
                autocorrect: false,
                obscureText: obscure,
                keyboardType: keyboardType,
                onSubmitted: onSubmitted,
                textInputAction: onSubmitted == null
                    ? TextInputAction.done
                    : TextInputAction.next,
                placeholder: placeholder,
                placeholderStyle: AppText.body.copyWith(
                  color: palette.tertiaryLabel,
                ),
                style: AppText.body.copyWith(color: palette.label),
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
              ),
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}
