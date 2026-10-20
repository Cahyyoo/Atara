import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';

import '../theme/app_motion.dart';
import '../theme/app_theme.dart';

/// The reference's text field: a soft pill with an icon on its leading edge.
///
/// Focus draws a thin green ring; an [errorText] turns the ring red and slides
/// the sentence in underneath, as the reference does while you type a bad
/// address. The label is not drawn — the icon and placeholder say which field
/// this is — but it is announced, so the field is not nameless to a screen
/// reader.
class PillField extends StatefulWidget {
  const PillField({
    super.key,
    required this.controller,
    required this.placeholder,
    required this.label,
    this.icon,
    this.focusNode,
    this.keyboardType,
    this.textInputAction,
    this.obscure = false,
    this.autofocus = false,
    this.autocorrect = false,
    this.enabled = true,
    this.trailing,
    this.onChanged,
    this.onSubmitted,
    this.errorText,
    this.style,
    this.textAlign = TextAlign.start,
    this.inputFormatters,
    this.maxLength,
    this.textCapitalization = TextCapitalization.none,
    this.minLines,
    this.maxLines = 1,
    this.fillColor,
    this.autofillHints,
  });

  final TextEditingController controller;
  final String placeholder;
  final String label;
  final IconData? icon;
  final FocusNode? focusNode;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final bool obscure;
  final bool autofocus;
  final bool autocorrect;
  final bool enabled;
  final Widget? trailing;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;

  /// Shown under the pill, which turns red while it is set.
  final String? errorText;

  final TextStyle? style;
  final TextAlign textAlign;
  final List<TextInputFormatter>? inputFormatters;
  final int? maxLength;
  final TextCapitalization textCapitalization;
  final int? minLines;
  final int? maxLines;

  /// Defaults to [AppColors.field]. A field sitting on the field colour
  /// itself (inside a grey card) can ask for the card colour instead.
  final Color? fillColor;

  final Iterable<String>? autofillHints;

  @override
  State<PillField> createState() => _PillFieldState();
}

class _PillFieldState extends State<PillField> {
  FocusNode? _ownFocus;
  FocusNode get _focus => widget.focusNode ?? (_ownFocus ??= FocusNode());
  bool _focused = false;

  @override
  void initState() {
    super.initState();
    _focus.addListener(_onFocus);
  }

  @override
  void didUpdateWidget(PillField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.focusNode != widget.focusNode) {
      (oldWidget.focusNode ?? _ownFocus)?.removeListener(_onFocus);
      _focus.addListener(_onFocus);
    }
  }

  void _onFocus() {
    if (_focused != _focus.hasFocus) setState(() => _focused = _focus.hasFocus);
  }

  @override
  void dispose() {
    _focus.removeListener(_onFocus);
    _ownFocus?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final error = widget.errorText;
    final hasError = error != null;
    final ring = hasError
        ? palette.danger.foreground
        : (_focused ? palette.accent : const Color(0x00000000));
    final multiline = (widget.maxLines ?? 2) > 1;
    final radius = multiline ? AppRadius.lg : AppRadius.field;

    final field = AnimatedContainer(
      duration: AppMotion.fast,
      curve: Curves.easeOut,
      constraints: const BoxConstraints(minHeight: 52),
      padding: const EdgeInsets.only(left: AppSpacing.lg, right: AppSpacing.sm),
      decoration: BoxDecoration(
        color: widget.fillColor ?? palette.field,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: ring, width: 1.5),
      ),
      child: Row(
        crossAxisAlignment:
            multiline ? CrossAxisAlignment.start : CrossAxisAlignment.center,
        children: [
          if (widget.icon != null) ...[
            Padding(
              padding: EdgeInsets.only(top: multiline ? 15 : 0),
              child: Icon(
                widget.icon,
                size: 19,
                color: hasError
                    ? palette.danger.foreground
                    : (_focused ? palette.accent : palette.secondaryLabel),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
          ],
          Expanded(
            child: Semantics(
              textField: true,
              label: widget.label,
              child: CupertinoTextField.borderless(
                controller: widget.controller,
                focusNode: _focus,
                autofocus: widget.autofocus,
                autocorrect: widget.autocorrect,
                autofillHints: widget.autofillHints,
                enabled: widget.enabled,
                obscureText: widget.obscure,
                keyboardType: widget.keyboardType,
                textInputAction: widget.textInputAction ??
                    (widget.onSubmitted == null
                        ? TextInputAction.done
                        : TextInputAction.next),
                textCapitalization: widget.textCapitalization,
                inputFormatters: widget.inputFormatters,
                maxLength: widget.maxLength,
                minLines: widget.minLines,
                maxLines: widget.maxLines,
                textAlign: widget.textAlign,
                onChanged: widget.onChanged,
                onSubmitted: widget.onSubmitted,
                placeholder: widget.placeholder,
                placeholderStyle: (widget.style ?? AppText.body).copyWith(
                  color: palette.tertiaryLabel,
                ),
                style: (widget.style ?? AppText.body).copyWith(
                  color: palette.label,
                ),
                cursorColor: palette.accent,
                padding: const EdgeInsets.symmetric(vertical: 15),
              ),
            ),
          ),
          if (widget.trailing != null) widget.trailing!,
        ],
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        field,
        // The sentence slides in and out instead of popping, so the rows
        // beneath it move rather than jump.
        AnimatedSize(
          duration: AppMotion.fast,
          curve: Curves.easeOut,
          alignment: Alignment.topCenter,
          child: hasError
              ? Semantics(
                  liveRegion: true,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.lg,
                      AppSpacing.xs + 2,
                      AppSpacing.lg,
                      0,
                    ),
                    child: Text(
                      error,
                      style: AppText.caption.copyWith(
                        color: palette.danger.foreground,
                      ),
                    ),
                  ),
                )
              : const SizedBox(width: double.infinity),
        ),
      ],
    );
  }
}
