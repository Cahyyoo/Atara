import 'package:flutter/cupertino.dart';

import '../l10n/app_localizations.dart';
import '../services/sample_code.dart';
import '../theme/app_theme.dart';

/// Asks for a sample code by hand, for when the camera cannot be used.
///
/// Returns the tidied code, or null if the operator backed out. The caller does
/// the same thing with it as the scanner does with a decoded QR: hand it to
/// [UpdateStatusScreen] and let that screen say whether it exists.
Future<String?> showManualCodeDialog(BuildContext context) {
  return showCupertinoDialog<String>(
    context: context,
    barrierDismissible: true,
    builder: (context) => const _ManualCodeDialog(),
  );
}

class _ManualCodeDialog extends StatefulWidget {
  const _ManualCodeDialog();

  /// What iOS makes an alert, and what CupertinoAlertDialog used internally.
  static const double _width = 270;

  @override
  State<_ManualCodeDialog> createState() => _ManualCodeDialogState();
}

class _ManualCodeDialogState extends State<_ManualCodeDialog> {
  final _controller = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final code = normaliseSampleCode(_controller.text);
    if (code.isEmpty) {
      setState(() => _error = AppLocalizations.of(context)!.manualEntryRequired);
      return;
    }
    Navigator.of(context).pop(code);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;

    final surface = CupertinoPopupSurface(
      // Zero, where CupertinoAlertDialog hard-codes 30.
      //
      // That widget wraps itself in a BackdropFilter at sigma 30 with a
      // saturation matrix under it, inside a superellipse clip — and because
      // the dialog arrives on a scale transition, the sampled region changes
      // every frame, so nothing caches. Over the scanner that meant blurring a
      // live camera texture fifteen times on the way in. What is behind this
      // dialog is a stopped camera or a dimmed page; there is nothing the
      // blur was showing that is worth that.
      blurSigma: 0,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.lg,
              AppSpacing.lg,
              AppSpacing.md,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  l10n.manualEntryTitle,
                  textAlign: TextAlign.center,
                  style: AppText.headline.copyWith(color: palette.label),
                ),
                const SizedBox(height: AppSpacing.md),
                CupertinoTextField(
                  controller: _controller,
                  autofocus: true,
                  // A sample code is not a word: autocorrect and suggestions
                  // only get in the way, and the code is upper case throughout.
                  autocorrect: false,
                  enableSuggestions: false,
                  textCapitalization: TextCapitalization.characters,
                  // Lets the operator finish from the keyboard without
                  // reaching for a button.
                  textInputAction: TextInputAction.go,
                  onSubmitted: (_) => _submit(),
                  onChanged: (_) {
                    if (_error != null) setState(() => _error = null);
                  },
                  placeholder: 'SMPL-2026-00001',
                  placeholderStyle: AppText.body.copyWith(
                    color: palette.tertiaryLabel,
                    fontFamily: AppText.monoFamily,
                  ),
                  style: AppText.body.copyWith(
                    color: palette.label,
                    fontFamily: AppText.monoFamily,
                  ),
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.md,
                    vertical: AppSpacing.sm,
                  ),
                  decoration: BoxDecoration(
                    color: palette.groupedBackground,
                    borderRadius: BorderRadius.circular(AppRadius.sm),
                    border: Border.all(
                      color: _error == null
                          ? palette.separator
                          : palette.danger.foreground,
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                // CupertinoTextField has no errorText of its own, so the
                // message is a sibling. It also keeps the help line and the
                // failure in the same slot, which stops the dialog resizing as
                // the operator types.
                Text(
                  _error ?? l10n.manualEntryHelp,
                  textAlign: TextAlign.start,
                  style: AppText.footnote.copyWith(
                    color: _error == null
                        ? palette.secondaryLabel
                        : palette.danger.foreground,
                  ),
                ),
              ],
            ),
          ),
          Container(height: 0.5, color: palette.separator),
          IntrinsicHeight(
            child: Row(
              children: [
                Expanded(
                  child: _DialogAction(
                    label: l10n.cancel,
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ),
                Container(width: 0.5, color: palette.separator),
                Expanded(
                  child: _DialogAction(
                    label: l10n.manualEntryContinue,
                    isDefault: true,
                    onPressed: _submit,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );

    return Center(
      // CupertinoAlertDialog supplied this; hand-rolling the surface means
      // hand-rolling the keyboard inset too, or the field this dialog exists
      // for ends up underneath the keyboard.
      child: AnimatedPadding(
        padding: MediaQuery.viewInsetsOf(context) +
            const EdgeInsets.symmetric(
              horizontal: AppSpacing.xl,
              vertical: AppSpacing.xl,
            ),
        duration: const Duration(milliseconds: 100),
        curve: Curves.decelerate,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: _ManualCodeDialog._width),
          child: SingleChildScrollView(child: surface),
        ),
      ),
    );
  }
}

/// One of the two buttons along the bottom.
///
/// Dims to the system fill while the finger is down, which is what iOS does
/// and what every other row in this app already does — see [InsetRow].
class _DialogAction extends StatefulWidget {
  const _DialogAction({
    required this.label,
    required this.onPressed,
    this.isDefault = false,
  });

  final String label;
  final VoidCallback onPressed;
  final bool isDefault;

  @override
  State<_DialogAction> createState() => _DialogActionState();
}

class _DialogActionState extends State<_DialogAction> {
  bool _isPressed = false;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: widget.onPressed,
      onTapDown: (_) => setState(() => _isPressed = true),
      onTapUp: (_) => setState(() => _isPressed = false),
      onTapCancel: () => setState(() => _isPressed = false),
      child: ColoredBox(
        color: _isPressed ? palette.fill : const Color(0x00000000),
        child: Container(
          // 44 is the iOS minimum tap target, and what the alert dialog used.
          constraints: const BoxConstraints(minHeight: 44),
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
          child: Text(
            widget.label,
            textAlign: TextAlign.center,
            style: AppText.body.copyWith(
              color: palette.accent,
              fontWeight: widget.isDefault ? FontWeight.w600 : FontWeight.w400,
            ),
          ),
        ),
      ),
    );
  }
}
