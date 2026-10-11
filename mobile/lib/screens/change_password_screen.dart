import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../providers/session_provider.dart';
import '../services/api_error_text.dart';
import '../services/api_exception.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/ios/app_page.dart';
import '../widgets/ios/app_toast.dart';
import '../widgets/ios/inset_section.dart';
import '../widgets/ios/ios_button.dart';

/// The shortest a password may be. The server holds the same floor; this copy
/// only saves a round trip and says so before the keyboard is put away.
const _minPasswordLength = 8;

/// Replacing one's own password.
///
/// Two ways in, one screen. [forced] is the one that matters: an account
/// whose password an administrator chose — a new operator, or a reset — is
/// handed the password every Operator shares, and the server refuses it
/// everything until that is replaced. So there is no way past this screen but
/// through it, or out: no back button, only Sign out.
///
/// Opened from Settings instead ([forced] false) it is an ordinary page that
/// can be left alone.
class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key, this.forced = false});

  final bool forced;

  @override
  ConsumerState<ChangePasswordScreen> createState() =>
      _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends ConsumerState<ChangePasswordScreen> {
  final _currentController = TextEditingController();
  final _nextController = TextEditingController();
  final _confirmController = TextEditingController();
  final _nextFocus = FocusNode();
  final _confirmFocus = FocusNode();

  bool _isSubmitting = false;
  String? _errorMessage;

  @override
  void dispose() {
    _currentController.dispose();
    _nextController.dispose();
    _confirmController.dispose();
    _nextFocus.dispose();
    _confirmFocus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    // A second tap in the same frame would send the old password again after
    // the first had already replaced it, and report it as wrong.
    if (_isSubmitting) return;
    final l10n = AppLocalizations.of(context)!;
    final current = _currentController.text;
    final next = _nextController.text;
    final confirm = _confirmController.text;

    // Checked here first so the three obvious mistakes cost no round trip and
    // no rate-limit attempt. The server checks all of them again.
    if (current.isEmpty) {
      setState(() => _errorMessage = l10n.passwordCurrentRequired);
      return;
    }
    if (next.length < _minPasswordLength) {
      setState(() => _errorMessage = l10n.passwordTooShort(_minPasswordLength));
      return;
    }
    if (next != confirm) {
      setState(() => _errorMessage = l10n.passwordMismatch);
      return;
    }
    if (next == current) {
      setState(() => _errorMessage = l10n.passwordSameAsCurrent);
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    try {
      await ApiService.instance.changePassword(
        currentPassword: current,
        newPassword: next,
      );
      // The duty is discharged: clearing it is what lets the gate through to
      // Home, so it happens before anything else.
      await ref.read(sessionProvider.notifier).markPasswordChanged();
      if (!mounted) return;
      AppToast.show(
        context,
        l10n.passwordChanged,
        icon: CupertinoIcons.checkmark_circle,
      );
      // Forced: the gate rebuilds onto Home by itself, and there is nothing
      // under this screen to pop back to.
      if (!widget.forced) Navigator.of(context).pop();
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _errorMessage = _refusalText(l10n, error));
    } catch (_) {
      if (!mounted) return;
      setState(() => _errorMessage = l10n.unexpectedError);
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  /// The server's own refusals, in words an operator can act on.
  ///
  /// Matched on `code`, never on the message: the text is written for the
  /// website and is in one language.
  String _refusalText(AppLocalizations l10n, ApiException error) {
    return switch (error.code) {
      'wrong-password' => l10n.passwordCurrentWrong,
      'role-default-password' => l10n.passwordIsRoleDefault,
      _ => error.statusCode == 429
          ? l10n.passwordTooManyAttempts
          : apiErrorText(l10n, error),
    };
  }

  Future<void> _signOut() async {
    await ref.read(sessionProvider.notifier).logout();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;

    return AppPage.list(
      title: l10n.changePasswordTitle,
      // Forced, there is nowhere to go back to: the account cannot work until
      // this is done, so the only other way out is signing out.
      automaticallyImplyLeading: !widget.forced,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.md),
          child: Text(
            widget.forced
                ? l10n.changePasswordForcedBody
                : l10n.changePasswordBody,
            style: AppText.subhead.copyWith(color: palette.secondaryLabel),
          ),
        ),
        InsetSection(
          margin: EdgeInsets.zero,
          footer: l10n.passwordRuleHint(_minPasswordLength),
          children: [
            _PasswordField(
              controller: _currentController,
              label: l10n.passwordCurrent,
              autofocus: true,
              onSubmitted: (_) => _nextFocus.requestFocus(),
            ),
            _PasswordField(
              controller: _nextController,
              focusNode: _nextFocus,
              label: l10n.passwordNew,
              onSubmitted: (_) => _confirmFocus.requestFocus(),
            ),
            _PasswordField(
              controller: _confirmController,
              focusNode: _confirmFocus,
              label: l10n.passwordConfirm,
              onSubmitted: (_) => _submit(),
            ),
          ],
        ),
        if (_errorMessage != null) ...[
          const SizedBox(height: AppSpacing.md),
          Semantics(
            liveRegion: true,
            container: true,
            child: Text(
              _errorMessage!,
              style: AppText.footnote.copyWith(
                color: palette.danger.foreground,
              ),
            ),
          ),
        ],
        const SizedBox(height: AppSpacing.xl),
        AppButton(
          label: l10n.changePasswordSubmit,
          isBusy: _isSubmitting,
          onPressed: _submit,
        ),
        if (widget.forced) ...[
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            label: l10n.signOut,
            style: AppButtonStyle.plain,
            isDestructive: true,
            onPressed: _isSubmitting ? null : _signOut,
          ),
        ],
      ],
    );
  }
}

/// One obscured field in the grouped box, labelled on its own line above the
/// entry — the shape Settings already uses for its server address.
class _PasswordField extends StatelessWidget {
  const _PasswordField({
    required this.controller,
    required this.label,
    this.focusNode,
    this.autofocus = false,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String label;
  final FocusNode? focusNode;
  final bool autofocus;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return InsetCustomRow(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.sm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: AppText.caption.copyWith(color: palette.secondaryLabel),
          ),
          CupertinoTextField.borderless(
            controller: controller,
            focusNode: focusNode,
            autofocus: autofocus,
            obscureText: true,
            // A password manager offering the account's saved entry is the
            // one thing that makes a three-field form quick on a phone.
            autofillHints: const [AutofillHints.password],
            textInputAction: onSubmitted == null
                ? TextInputAction.done
                : TextInputAction.next,
            onSubmitted: onSubmitted,
            style: AppText.body.copyWith(color: palette.label),
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
          ),
        ],
      ),
    );
  }
}
