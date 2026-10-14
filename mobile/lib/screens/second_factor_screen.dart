import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../models/login_result.dart';
import '../providers/session_provider.dart';
import '../services/api_exception.dart';
import '../services/second_factor_error_text.dart';
import '../theme/app_theme.dart';
import '../widgets/face_camera_view.dart';
import '../widgets/ios/app_page.dart';
import '../widgets/ios/app_toast.dart';
import '../widgets/ios/inset_section.dart';
import '../widgets/ios/ios_button.dart';
import '../widgets/status_view.dart';

/// The step between a correct password and a session.
///
/// A pushed route rather than another state on the sign-in screen, for two
/// reasons that point the same way. The sign-in screen is two fields and is
/// asserted to be exactly that; and the challenge this screen works with is a
/// single-use credential with a two-minute life, which wants to die with the
/// route that carries it.
///
/// One route with phases inside it, not a route per phase. The challenge belongs
/// to the *sitting*, not to a phase — and `/auth/totp/setup` REPLACES it, so a
/// stale phase left on the stack could post a challenge a newer phase had
/// already retired. It also gives backing out one meaning: leaving starts again.
class SecondFactorScreen extends ConsumerStatefulWidget {
  const SecondFactorScreen({
    super.key,
    required this.factor,
    this.now = DateTime.now,
  });

  final LoginSecondFactor factor;

  /// Injected so the expiry branch is reachable from a test.
  ///
  /// `DateTime.now()` does not advance under `flutter_test`'s fake clock while
  /// `Timer`s do, so a countdown that mixed the two would be untestable in
  /// exactly the state that matters.
  final DateTime Function() now;

  @override
  ConsumerState<SecondFactorScreen> createState() => _SecondFactorScreenState();
}

enum _Phase { choose, totp, setupKey, setupCode, face }

class _SecondFactorScreenState extends ConsumerState<SecondFactorScreen>
    with WidgetsBindingObserver {
  /// How long a confirmation stays up before the route pops, matching the hold
  /// the update screen uses after a save.
  static const _confirmationHold = Duration(milliseconds: 450);

  final TextEditingController _codeController = TextEditingController();
  final FocusNode _codeFocus = FocusNode();

  late String _challenge;
  late DateTime _expiresAt;
  late _Phase _phase;

  Timer? _ticker;
  int _secondsLeft = 0;
  bool _isSending = false;
  bool _isExpired = false;
  String? _errorMessage;
  String? _confirmation;

  TotpSetup? _setup;

  /// Guards `/auth/totp/setup` to one call per sitting.
  ///
  /// Every call mints a fresh secret server-side, so a second one silently
  /// invalidates a key the preparator may already have typed into their
  /// authenticator — and they would then be entering correct codes for a secret
  /// the server has thrown away.
  bool _setupStarted = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _challenge = widget.factor.challenge;
    _adoptExpiry(widget.factor.expiresIn);
    _phase = _initialPhase();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Not initState: _startSetup reads AppLocalizations, and touching an
    // inherited widget before initState has returned is an error the framework
    // catches outright. This is the documented home for initialisation that
    // depends on one, and _setupStarted keeps it to a single call however many
    // times dependencies change.
    if (_phase == _Phase.setupKey) _startSetup();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _ticker?.cancel();
    _codeController.dispose();
    _codeFocus.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // A counter that only ticks while the widget is awake would happily show
    // "40 seconds left" for a challenge that expired in somebody's pocket.
    if (state == AppLifecycleState.resumed) _tick();
  }

  List<SecondFactorMethod> get _methods => widget.factor.methods;

  _Phase _initialPhase() {
    // A choice of one is not a choice; the web makes the same call.
    if (_methods.length != 1) return _Phase.choose;
    return _phaseFor(_methods.single);
  }

  _Phase _phaseFor(SecondFactorMethod method) => switch (method) {
    SecondFactorMethod.totp => _Phase.totp,
    SecondFactorMethod.totpSetup => _Phase.setupKey,
    SecondFactorMethod.face => _Phase.face,
  };

  void _adoptExpiry(Duration remaining) {
    _expiresAt = widget.now().add(remaining);
    _ticker?.cancel();
    _isExpired = false;
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
    _tick();
  }

  void _tick() {
    final left = _expiresAt.difference(widget.now()).inSeconds;
    final clamped = left < 0 ? 0 : left;
    if (!mounted) return;
    setState(() {
      _secondsLeft = clamped;
      if (clamped == 0) {
        _isExpired = true;
        _ticker?.cancel();
      }
    });
  }

  Future<void> _startSetup() async {
    if (_setupStarted) return;
    _setupStarted = true;
    setState(() {
      _errorMessage = null;
      _isSending = true;
    });

    final l10n = AppLocalizations.of(context)!;
    try {
      final setup = await ref
          .read(sessionProvider.notifier)
          .startTotpSetup(challenge: _challenge);
      if (!mounted) return;
      setState(() {
        _setup = setup;
        // The reply carries a REPLACEMENT challenge, and adopting it is not
        // optional: reading a key across into an authenticator takes longer than
        // the two minutes the previous one had left.
        _challenge = setup.challenge;
        _isSending = false;
      });
      _adoptExpiry(setup.expiresIn);
    } on ApiException catch (error) {
      if (!mounted) return;
      _applyRefusal(secondFactorRefusal(l10n, error));
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _errorMessage = l10n.unexpectedError;
        _isSending = false;
      });
    }
  }

  Future<void> _submitCode() async {
    final l10n = AppLocalizations.of(context)!;
    final code = _codeController.text.trim();

    // Checked here rather than learned from a 422: the server answers that for a
    // short code, and a round trip is a worse way to be told.
    if (code.length != 6) {
      setState(() => _errorMessage = l10n.mfaCodeIncomplete);
      return;
    }
    if (_isSending || _isExpired) return;

    setState(() {
      _isSending = true;
      _errorMessage = null;
    });

    try {
      await ref
          .read(sessionProvider.notifier)
          .verifyTotp(challenge: _challenge, code: code);
      if (!mounted) return;
      // The notifier has already adopted the session, so AuthGate has swapped
      // the app underneath. This route is NOT removed by that — routes pushed on
      // the root navigator outlive a change of `home:` — so it has to pop itself
      // or it sits on top of Home for ever.
      setState(() {
        _isSending = false;
        _confirmation = _phase == _Phase.setupCode
            ? l10n.mfaEnrolled
            : l10n.mfaVerified;
      });
      _ticker?.cancel();
      await Future<void>.delayed(_confirmationHold);
      if (mounted) Navigator.of(context).pop();
    } on PreparatorOnlyException {
      if (!mounted) return;
      _refuseAccount(l10n);
    } on ApiException catch (error) {
      if (!mounted) return;
      _applyRefusal(secondFactorRefusal(l10n, error));
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _errorMessage = l10n.unexpectedError;
        _isSending = false;
      });
    }
  }

  Future<void> _submitFace(List<String> frames) async {
    final l10n = AppLocalizations.of(context)!;
    if (_isSending || _isExpired) return;

    setState(() {
      _isSending = true;
      _errorMessage = null;
    });

    try {
      final result = await ref
          .read(sessionProvider.notifier)
          .verifyFace(challenge: _challenge, frames: frames);
      if (!mounted) return;

      if (result is LoginSecondFactor) {
        setState(() {
          _isSending = false;
          _challenge = result.challenge;
          _phase = _Phase.setupKey;
        });
        _adoptExpiry(result.expiresIn);
        _startSetup();
        return;
      }

      setState(() {
        _isSending = false;
        _confirmation = l10n.mfaFaceVerified;
      });
      _ticker?.cancel();
      await Future<void>.delayed(_confirmationHold);
      if (mounted) Navigator.of(context).pop();
    } on PreparatorOnlyException {
      if (!mounted) return;
      _refuseAccount(l10n);
    } on ApiException catch (error) {
      if (!mounted) return;
      _applyRefusal(secondFactorRefusal(l10n, error));
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _errorMessage = l10n.unexpectedError;
        _isSending = false;
      });
    }
  }

  /// The factor passed, but for an account this app is not for.
  ///
  /// Nothing here can help — the challenge is spent and the role will not change
  /// on a second try — so the route goes back and hands its sentence to the
  /// sign-in screen, which is where every other sign-in failure is shown.
  void _refuseAccount(AppLocalizations l10n) {
    _ticker?.cancel();
    Navigator.of(context).pop(l10n.signInPreparatorsOnly);
  }

  void _applyRefusal(SecondFactorRefusal refusal) {
    setState(() {
      _isSending = false;
      _errorMessage = refusal.message;
      switch (refusal.disposition) {
        case SecondFactorDisposition.retrySameChallenge:
          // The challenge is untouched and another attempt costs nothing, so
          // stay put. Only the field is cleared, and the keyboard keeps its
          // place — sending the preparator back to the password screen would throw
          // away a credential the server was willing to keep.
          _codeController.clear();
          _codeFocus.requestFocus();
        case SecondFactorDisposition.startAgain:
          // Whatever the real reason, the challenge is finished. The expiry
          // panel explains before going back; a silent pop reads as the app
          // losing the attempt.
          _isExpired = true;
          _ticker?.cancel();
        case SecondFactorDisposition.halt:
          _ticker?.cancel();
      }
    });
  }

  void _choose(SecondFactorMethod method) {
    setState(() {
      _errorMessage = null;
      _phase = _phaseFor(method);
    });
    if (_phase == _Phase.setupKey) _startSetup();
  }

  Future<void> _copyKey(String key) async {
    final l10n = AppLocalizations.of(context)!;
    // A TOTP seed on the clipboard is readable by other apps. It is the
    // least-bad way to move a secret between two apps on one phone, it happens
    // only because the preparator asked, and it is never logged.
    await Clipboard.setData(ClipboardData(text: key));
    if (mounted) AppToast.show(context, l10n.mfaSetupKeyCopied);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return AppModalPage(
      title: l10n.mfaTitle,
      leading: NavBarAction(
        label: l10n.mfaBackToPassword,
        onPressed: () => Navigator.of(context).pop(),
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg,
          AppSpacing.lg,
          AppSpacing.lg,
          AppSpacing.xxl,
        ),
        child: _body(l10n),
      ),
    );
  }

  Widget _body(AppLocalizations l10n) {
    if (_confirmation != null) {
      return StatusView(
        icon: CupertinoIcons.checkmark_circle,
        tone: context.palette.success,
        liveRegion: true,
        title: _confirmation!,
      );
    }

    if (_isExpired) {
      return StatusView(
        icon: CupertinoIcons.clock,
        tone: context.palette.warning,
        liveRegion: true,
        title: l10n.mfaExpiredTitle,
        message: _errorMessage ?? l10n.mfaExpiredBody,
        action: AppButton(
          label: l10n.mfaStartAgain,
          onPressed: () => Navigator.of(context).pop(),
        ),
      );
    }

    if (_methods.isEmpty) {
      // Everything the server offered is something this build cannot do — a
      // method added on the server before this app learned it. Saying so is the
      // honest answer; a blank screen or a pretended failure is not.
      return StatusView(
        icon: CupertinoIcons.exclamationmark_circle,
        tone: context.palette.warning,
        title: l10n.mfaTitle,
        message: l10n.mfaUnsupportedMethod,
        action: AppButton(
          label: l10n.mfaBackToPassword,
          onPressed: () => Navigator.of(context).pop(),
        ),
      );
    }

    return switch (_phase) {
      _Phase.choose => _chooser(l10n),
      _Phase.totp => _codeEntry(
        l10n,
        title: l10n.mfaMethodTotp,
        hint: l10n.mfaTotpSubtitle,
      ),
      _Phase.setupKey => _setupKey(l10n),
      _Phase.setupCode => _codeEntry(
        l10n,
        title: l10n.mfaSetupCodeTitle,
        hint: l10n.mfaSetupCodeHint,
      ),
      _Phase.face => _faceEntry(l10n),
    };
  }

  Widget _greeting(AppLocalizations l10n) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.mfaStepLabel,
            style: AppText.footnote.copyWith(color: palette.secondaryLabel),
          ),
          const SizedBox(height: AppSpacing.xs),
          // The name is the only thing the server tells us about the account
          // here, and it is what makes an unexpected prompt legible rather than
          // alarming.
          Text(
            l10n.mfaGreeting(widget.factor.name),
            style: AppText.title2.copyWith(color: palette.label),
          ),
        ],
      ),
    );
  }

  Widget _chooser(AppLocalizations l10n) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _greeting(l10n),
        InsetSection(
          header: l10n.mfaChooseSubtitle,
          footer: _countdownText(l10n),
          children: [
            for (final method in _methods)
              InsetRow(
                title: _methodTitle(l10n, method),
                subtitle: _methodHint(l10n, method),
                showChevron: true,
                onTap: () => _choose(method),
              ),
          ],
        ),
        ?_errorLine(),
      ],
    );
  }

  String _methodTitle(AppLocalizations l10n, SecondFactorMethod method) =>
      switch (method) {
        SecondFactorMethod.face => l10n.mfaMethodFace,
        SecondFactorMethod.totp => l10n.mfaMethodTotp,
        SecondFactorMethod.totpSetup => l10n.mfaMethodSetup,
      };

  String _methodHint(AppLocalizations l10n, SecondFactorMethod method) =>
      switch (method) {
        SecondFactorMethod.face => l10n.mfaMethodFaceHint,
        SecondFactorMethod.totp => l10n.mfaMethodTotpHint,
        SecondFactorMethod.totpSetup => l10n.mfaMethodSetupHint,
      };

  Widget _codeEntry(
    AppLocalizations l10n, {
    required String title,
    required String hint,
  }) {
    final palette = context.palette;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _greeting(l10n),
        InsetSection(
          header: title,
          footer: _countdownText(l10n),
          children: [
            InsetCustomRow(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.lg,
                vertical: AppSpacing.xs,
              ),
              child: Row(
                children: [
                  Icon(
                    CupertinoIcons.number,
                    size: 20,
                    color: palette.secondaryLabel,
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Semantics(
                      textField: true,
                      label: l10n.mfaCodeLabel,
                      child: CupertinoTextField.borderless(
                        controller: _codeController,
                        focusNode: _codeFocus,
                        autofocus: true,
                        autocorrect: false,
                        keyboardType: TextInputType.number,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                          LengthLimitingTextInputFormatter(6),
                        ],
                        // Submits on the sixth digit AND on the button: an
                        // preparator wearing gloves will reach for the button.
                        onChanged: (value) {
                          if (value.length == 6) _submitCode();
                        },
                        onSubmitted: (_) => _submitCode(),
                        placeholder: l10n.mfaCodeHint,
                        placeholderStyle: AppText.body.copyWith(
                          color: palette.tertiaryLabel,
                        ),
                        style: AppText.body.copyWith(color: palette.label),
                        padding: const EdgeInsets.symmetric(
                          vertical: AppSpacing.md,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        Text(
          hint,
          style: AppText.footnote.copyWith(color: palette.secondaryLabel),
        ),
        ?_errorLine(),
        const SizedBox(height: AppSpacing.lg),
        AppButton(
          label: l10n.mfaVerify,
          icon: CupertinoIcons.checkmark,
          isBusy: _isSending,
          onPressed: _submitCode,
        ),
        if (_methods.length > 1) ...[
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            label: l10n.mfaUseAnotherMethod,
            style: AppButtonStyle.plain,
            onPressed: () => setState(() {
              _errorMessage = null;
              _phase = _Phase.choose;
            }),
          ),
        ],
      ],
    );
  }

  Widget _setupKey(AppLocalizations l10n) {
    final palette = context.palette;
    final setup = _setup;

    if (setup == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _greeting(l10n),
          InsetSection(
            header: l10n.mfaSetupTitle,
            children: [
              InsetCustomRow(
                child: Text(
                  l10n.mfaSetupLoading,
                  style: AppText.subhead.copyWith(
                    color: palette.secondaryLabel,
                  ),
                ),
              ),
            ],
          ),
          ?_errorLine(),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _greeting(l10n),
        Text(
          l10n.mfaSetupIntro,
          style: AppText.subhead.copyWith(color: palette.secondaryLabel),
        ),
        const SizedBox(height: AppSpacing.lg),
        InsetSection(
          header: l10n.mfaSetupKeyLabel,
          // No QR code here, and that is not dependency thrift. On a phone the
          // authenticator is on this same phone, and you cannot photograph your
          // own screen — a QR is unusable precisely where it would be offered.
          // The manual key is the path that works, and the server already sends
          // it grouped in fours.
          footer: l10n.mfaSetupKeyWarning,
          children: [
            InsetCustomRow(
              child: Text(
                setup.manualKey,
                style: AppText.body.copyWith(
                  color: palette.label,
                  fontFamily: AppText.monoFamily,
                  letterSpacing: 1.5,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        Text(
          l10n.mfaSetupManualSteps,
          style: AppText.footnote.copyWith(color: palette.secondaryLabel),
        ),
        ?_errorLine(),
        const SizedBox(height: AppSpacing.lg),
        AppButton(
          label: l10n.mfaSetupCopyKey,
          icon: CupertinoIcons.doc_on_clipboard,
          style: AppButtonStyle.plain,
          onPressed: () => _copyKey(setup.manualKey),
        ),
        const SizedBox(height: AppSpacing.sm),
        AppButton(
          label: l10n.mfaVerify,
          icon: CupertinoIcons.arrow_right_circle,
          onPressed: () => setState(() {
            _errorMessage = null;
            _phase = _Phase.setupCode;
          }),
        ),
      ],
    );
  }

  Widget _faceEntry(AppLocalizations l10n) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _greeting(l10n),
        Text(
          l10n.mfaFaceSubtitle,
          style: AppText.subhead.copyWith(
            color: context.palette.secondaryLabel,
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        FaceCameraView(
          challenge: _challenge,
          isSending: _isSending,
          externalError: _errorMessage,
          onCapture: _submitFace,
          onRetryRequested: () {
            setState(() => _errorMessage = null);
          },
        ),
        ?_errorLine(),
        if (_methods.length > 1) ...[
          const SizedBox(height: AppSpacing.md),
          AppButton(
            label: l10n.mfaUseAnotherMethod,
            style: AppButtonStyle.plain,
            onPressed: () => setState(() {
              _errorMessage = null;
              _phase = _Phase.choose;
            }),
          ),
        ],
      ],
    );
  }

  String? _countdownText(AppLocalizations l10n) =>
      _secondsLeft > 0 ? l10n.mfaExpiresIn(_secondsLeft) : null;

  Widget? _errorLine() {
    final message = _errorMessage;
    if (message == null) return null;
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.md),
      child: Semantics(
        liveRegion: true,
        container: true,
        child: Text(
          message,
          style: AppText.footnote.copyWith(
            color: context.palette.danger.foreground,
          ),
        ),
      ),
    );
  }
}
