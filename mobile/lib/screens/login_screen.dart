import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';

import '../providers/session_provider.dart';
import '../services/api_error_text.dart';
import '../models/login_result.dart';
import '../services/api_exception.dart';
import '../services/time_text.dart';
import '../theme/app_motion.dart';
import '../theme/app_theme.dart';
import '../widgets/brand/green_header.dart';
import '../widgets/brand/illustration.dart';
import '../widgets/brand/wordmark.dart';
import '../widgets/ios/ios_button.dart';
import '../widgets/motion/gate_transition.dart';
import '../widgets/motion/reveal.dart';
import '../widgets/pill_field.dart';
import '../widgets/server_address_notice.dart';
import 'second_factor_screen.dart';
import 'settings_screen.dart';
import 'splash_screen.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

/// The shape of an email address, loosely: something, an @, something with a
/// dot in it. Only to say "that does not look right" while typing — the server
/// is what decides whether an account exists.
final _emailShape = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

class _LoginScreenState extends ConsumerState<LoginScreen>
    with SingleTickerProviderStateMixin {
  // Not prefilled: a real account name on the sign-in screen is a free hint.
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _passwordFocus = FocusNode();

  bool _isSubmitting = false;
  String? _errorMessage;
  String? _emailError;
  String? _passwordError;

  /// True when the last attempt never reached the server. That is the one
  /// failure a wrong server address causes, and the only one worth pointing at
  /// the settings for — a rejected password has nothing to do with it.
  bool _serverUnreachable = false;
  bool _obscurePassword = true;

  /// The reference's entrance: the green header grows down from the top, its
  /// words and the illustration follow, then the form line by line.
  ///
  /// Started when the splash above has gone, not on mount — this screen is
  /// built underneath the splash from the first frame.
  late final AnimationController _enter = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1150),
    animationBehavior: AnimationBehavior.preserve,
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_enter.isAnimating &&
        _enter.value == 0 &&
        SplashStatus.isDone(context)) {
      _enter.forward();
    }
  }

  @override
  void dispose() {
    _enter.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  /// Live, as the reference does it: a bad address is flagged while it is
  /// being typed, and the flag lifts the moment it becomes a good one.
  void _onEmailChanged(String value) {
    final l10n = AppLocalizations.of(context)!;
    final email = value.trim();
    final next = email.isEmpty || _emailShape.hasMatch(email)
        ? null
        : l10n.emailInvalid;
    if (next != _emailError) setState(() => _emailError = next);
  }

  void _onPasswordChanged(String value) {
    if (_passwordError != null && value.isNotEmpty) {
      setState(() => _passwordError = null);
    }
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

    // Said under the field it is about, as the reference does, rather than in
    // one line below the form.
    final emailError = email.isEmpty
        ? l10n.emailRequired
        : (_emailShape.hasMatch(email) ? null : l10n.emailInvalid);
    final passwordError = password.isEmpty ? l10n.passwordRequired : null;
    if (emailError != null || passwordError != null) {
      setState(() {
        _emailError = emailError;
        _passwordError = passwordError;
        _errorMessage = null;
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
    } on PreparatorOnlyException {
      if (!mounted) return;
      setState(() {
        _errorMessage = l10n.signInPreparatorsOnly;
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

  void _explainForgotten() {
    final l10n = AppLocalizations.of(context)!;
    showCupertinoDialog<void>(
      context: context,
      barrierDismissible: true,
      builder: (context) => CupertinoAlertDialog(
        title: Text(l10n.forgotPasswordTitle),
        content: Text(l10n.forgotPasswordBody),
        actions: [
          CupertinoDialogAction(
            isDefaultAction: true,
            onPressed: () => Navigator.of(context).pop(),
            child: Text(l10n.understood),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;
    final notice = ref.watch(signedOutNoticeProvider);
    final media = MediaQuery.of(context);
    final top = media.padding.top;
    final headerHeight = loginHeaderHeight(media);

    // Leaving: AuthGate reverses this screen's swap animation when Home comes
    // in, and the exit below is read off it frame by frame.
    final gate = GateTransition.maybeOf(context)?.animation;

    final form = <Widget>[
      if (notice != null) ...[
        // Sealed, so a third reason added server-side becomes a
        // compile error here rather than a silent blank.
        switch (notice) {
          SessionReplaced() => _ReplacedNotice(replaced: notice),
          SessionEnded() => _EndedNotice(ended: notice),
        },
        const SizedBox(height: AppSpacing.lg),
      ],
      Text(
        l10n.loginWelcome,
        style: AppText.title1.copyWith(color: palette.label),
      ),
      const SizedBox(height: AppSpacing.lg),
      PillField(
        controller: _emailController,
        placeholder: l10n.emailHint,
        label: l10n.email,
        icon: CupertinoIcons.mail,
        keyboardType: TextInputType.emailAddress,
        autofocus: true,
        errorText: _emailError,
        onChanged: _onEmailChanged,
        onSubmitted: (_) => _passwordFocus.requestFocus(),
      ),
      const SizedBox(height: AppSpacing.md),
      PillField(
        controller: _passwordController,
        focusNode: _passwordFocus,
        placeholder: l10n.passwordHint,
        label: l10n.password,
        icon: CupertinoIcons.lock,
        obscure: _obscurePassword,
        errorText: _passwordError,
        onChanged: _onPasswordChanged,
        onSubmitted: (_) => _handleLogin(),
        textInputAction: TextInputAction.done,
        trailing: CupertinoButton(
          padding: EdgeInsets.zero,
          minimumSize: const Size(40, 40),
          onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
          child: Icon(
            _obscurePassword ? CupertinoIcons.eye_slash : CupertinoIcons.eye,
            size: 19,
            color: palette.tertiaryLabel,
          ),
        ),
      ),
      Align(
        alignment: Alignment.centerRight,
        child: CupertinoButton(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
          minimumSize: const Size(44, 40),
          onPressed: _explainForgotten,
          child: Text(
            l10n.forgotPassword,
            style: AppText.footnote.copyWith(
              color: palette.accent,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
      if (_errorMessage != null)
        // liveRegion is the Flutter counterpart of role="alert": the
        // failure is announced, not only recoloured.
        Semantics(
          liveRegion: true,
          container: true,
          child: Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.md),
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
                // preparator has to guess at.
                if (_serverUnreachable)
                  ServerAddressNotice(
                    color: palette.danger.foreground,
                    onOpenSettings: _openSettings,
                  ),
              ],
            ),
          ),
        ),
      AppButton(
        label: l10n.signIn,
        isBusy: _isSubmitting,
        onPressed: _handleLogin,
      ),
      const SizedBox(height: AppSpacing.lg),
      _OrDivider(label: l10n.loginOr),
      const SizedBox(height: AppSpacing.lg),
      // The server address lives in Settings, and Settings used to
      // open only from the home screen — which needs a session. A
      // wrong address therefore locked the preparator out with no way
      // back, reinstalling included. It takes the place the reference
      // gives its social sign-in buttons.
      AppButton(
        label: l10n.serverSettings,
        style: AppButtonStyle.tinted,
        icon: CupertinoIcons.gear_alt,
        onPressed: _openSettings,
      ),
      const SizedBox(height: AppSpacing.lg),
      Text.rich(
        TextSpan(
          children: [
            TextSpan(text: '${l10n.noAccount} '),
            TextSpan(
              text: l10n.askAdmin,
              style: TextStyle(
                color: palette.accent,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
        textAlign: TextAlign.center,
        style: AppText.footnote.copyWith(color: palette.secondaryLabel),
      ),
    ];

    return CupertinoPageScaffold(
      backgroundColor: palette.cardBackground,
      child: SingleChildScrollView(
        padding: EdgeInsets.only(bottom: media.padding.bottom + AppSpacing.xl),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _LoginHeader(
              enter: _enter,
              exit: gate,
              height: headerHeight,
              collapsedHeight: GreenHeaderMetrics.homeExpanded(top),
              topInset: top,
              subtitle: l10n.loginHeaderSubtitle,
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.xl,
                AppSpacing.xl,
                AppSpacing.xl,
                0,
              ),
              child: _ExitFade(
                exit: gate,
                interval: const Interval(0.08, 0.28),
                child: StaggeredColumn(
                  animation: CurvedAnimation(
                    parent: _enter,
                    curve: const Interval(0.36, 1),
                  ),
                  children: form,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// How tall the login header is: about a third of the screen, as in the
/// reference, never so short that the illustration has no room.
double loginHeaderHeight(MediaQueryData media) {
  final top = media.padding.top;
  return (media.size.height * 0.34).clamp(top + 210, top + 320);
}

/// The green header: the name and a line on the left, the waving technician
/// on the right.
///
/// [enter] grows it in; [exit], when the screen is leaving for Home, shrinks
/// it to exactly Home's header while its words fade, so the handover cannot
/// be seen.
class _LoginHeader extends StatelessWidget {
  const _LoginHeader({
    required this.enter,
    required this.exit,
    required this.height,
    required this.collapsedHeight,
    required this.topInset,
    required this.subtitle,
  });

  final Animation<double> enter;
  final Animation<double>? exit;
  final double height;
  final double collapsedHeight;
  final double topInset;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final reduced = AppMotion.reduced(context);
    final grow = CurvedAnimation(
      parent: enter,
      curve: const Interval(0, 0.36, curve: AppMotion.enter),
    );
    final words = CurvedAnimation(
      parent: enter,
      curve: const Interval(0.22, 0.5, curve: Curves.easeOut),
    );
    final art = CurvedAnimation(
      parent: enter,
      curve: const Interval(0.32, 0.68, curve: AppMotion.enter),
    );

    final artSize = height - topInset - AppSpacing.sm;

    final inside = Stack(
      children: [
        Positioned(
          right: -AppSpacing.sm,
          bottom: 0,
          child: _ExitFade(
            exit: exit,
            interval: const Interval(0, 0.15),
            child: Reveal(
              animation: art,
              offset: Offset(reduced ? 0 : 80, 0),
              child: Illustration(
                Art.loginWave,
                height: artSize,
                width: artSize,
                alignment: Alignment.bottomRight,
              ),
            ),
          ),
        ),
        Positioned(
          left: AppSpacing.xl,
          top: topInset + AppSpacing.xl,
          right: 150,
          child: FadeTransition(
            opacity: words,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _ExitFade(
                  exit: exit,
                  interval: const Interval(0.3, GateTransition.handover),
                  child: Wordmark(size: 30, color: palette.onHero),
                ),
                const SizedBox(height: AppSpacing.sm),
                _ExitFade(
                  exit: exit,
                  interval: const Interval(0, 0.15),
                  child: Text(
                    subtitle,
                    style: AppText.footnote.copyWith(
                      color: palette.onHero.withValues(alpha: 0.88),
                      height: 1.35,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );

    return AnimatedBuilder(
      animation: Listenable.merge([grow, ?exit]),
      child: inside,
      builder: (context, child) {
        // Growing in: from nothing at the top, as the reference does. With
        // motion reduced it is simply there, and fades with the words.
        var h = reduced ? height : height * grow.value;
        final leaving = _leaving(exit);
        if (leaving > 0) {
          final t = AppMotion.move.transform(
            ((leaving - 0.12) / (GateTransition.handover - 0.12)).clamp(
              0.0,
              1.0,
            ),
          );
          h = height + (collapsedHeight - height) * t;
        }
        return Opacity(
          opacity: (grow.value * (reduced ? 1 : 4)).clamp(0.0, 1.0),
          child: GreenHeader(
            height: h,
            child: OverflowBox(
              alignment: Alignment.topCenter,
              minHeight: height,
              maxHeight: height,
              child: child,
            ),
          ),
        );
      },
    );
  }
}

/// How far the screen is through leaving, 0 → 1, or 0 while it is not.
///
/// AnimatedSwitcher hands the outgoing screen its own animation in reverse,
/// so "leaving" is exactly when that animation is running backwards.
double _leaving(Animation<double>? exit) {
  if (exit == null) return 0;
  final status = exit.status;
  if (status == AnimationStatus.reverse) return 1 - exit.value;
  return 0;
}

/// Fades [child] out over [interval] of the screen's exit, if it is leaving.
class _ExitFade extends StatelessWidget {
  const _ExitFade({
    required this.exit,
    required this.interval,
    required this.child,
  });

  final Animation<double>? exit;
  final Interval interval;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final exit = this.exit;
    if (exit == null) return child;
    return AnimatedBuilder(
      animation: exit,
      child: child,
      builder: (context, child) {
        final leaving = _leaving(exit);
        if (leaving == 0) return child!;
        return Opacity(opacity: 1 - interval.transform(leaving), child: child);
      },
    );
  }
}

/// "—— or ——", between the sign-in button and the settings button.
class _OrDivider extends StatelessWidget {
  const _OrDivider({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final line = Expanded(
      child: SizedBox(height: 1, child: ColoredBox(color: palette.separator)),
    );
    return Row(
      children: [
        line,
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
          child: Text(
            label,
            style: AppText.caption.copyWith(color: palette.tertiaryLabel),
          ),
        ),
        line,
      ],
    );
  }
}

/// Why the preparator is looking at this screen when they never signed out.
///
/// Warning, not danger: nothing is wrong with this phone or its preparator, and
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
/// preparator's next step is too: there is no other phone to go and close.
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
          borderRadius: BorderRadius.circular(AppRadius.lg),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(CupertinoIcons.lock_shield, size: 20, color: color),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(text, style: AppText.footnote.copyWith(color: color)),
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
          borderRadius: BorderRadius.circular(AppRadius.lg),
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
  static const _appName = 'Atara Lab';

  static String _withVersion(String name, String? version) =>
      version == null ? name : '$name $version';
}
