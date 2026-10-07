import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

enum AppButtonStyle {
  /// The one action a screen exists for.
  filled,

  /// A secondary action, on a tinted ground.
  tinted,

  /// Everything else: blue label, no container.
  plain,
}

/// The iOS button: a rounded rectangle that dims when pressed.
///
/// No elevation, no shadow, no ripple, no border — the shape and a fill do all
/// the work. One widget for all three weights so a screen picks importance
/// rather than assembling a style, which is how three different button heights
/// crept in before.
///
/// The filled weight carries the web's `--gradient-primary` rather than a flat
/// accent, so the same button reads the same on both. It is the third and last
/// place in this app allowed a gradient, after the splash and the guide.
class AppButton extends StatefulWidget {
  const AppButton({
    super.key,
    required this.label,
    this.onPressed,
    this.style = AppButtonStyle.filled,
    this.icon,
    this.isBusy = false,
    this.isDestructive = false,
    this.expand = true,
  });

  final String label;
  final VoidCallback? onPressed;
  final AppButtonStyle style;
  final IconData? icon;

  /// Replaces the label with a spinner without resizing the button, so the row
  /// beneath it does not jump.
  final bool isBusy;

  final bool isDestructive;
  final bool expand;

  @override
  State<AppButton> createState() => _AppButtonState();
}

class _AppButtonState extends State<AppButton> {
  bool _isPressed = false;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final enabled = widget.onPressed != null && !widget.isBusy;

    final accent = widget.isDestructive ? palette.danger.foreground : palette.accent;

    // Destructive is never a solid red with white on it. The web puts
    // `text-destructive` on `bg-destructive/10` — a red label on a red tint —
    // and reserves the solid fill for the one affirmative action on a screen.
    // Filled + destructive therefore renders as the tinted weight.
    final isSolid = widget.style == AppButtonStyle.filled && !widget.isDestructive;

    final (Color background, Color foreground) = switch (widget.style) {
      AppButtonStyle.filled when widget.isDestructive =>
        (palette.danger.background, accent),
      // The gradient supplies the fill; this colour is only the fallback the
      // decoration below ignores.
      AppButtonStyle.filled => (accent, palette.onAccent),
      AppButtonStyle.tinted => (accent.withValues(alpha: 0.10), accent),
      AppButtonStyle.plain => (Colors.transparent, accent),
    };

    final Widget child = widget.isBusy
        ? SizedBox(
            height: 22,
            width: 22,
            child: CircularProgressIndicator(strokeWidth: 2.5, color: foreground),
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (widget.icon != null) ...[
                Icon(widget.icon, size: 20, color: foreground),
                const SizedBox(width: AppSpacing.sm),
              ],
              Flexible(
                child: Text(
                  widget.label,
                  textAlign: TextAlign.center,
                  style: AppText.body.copyWith(
                    color: foreground,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          );

    return Opacity(
      // iOS fades a disabled control rather than greying its label, and fades
      // the whole control while the finger is down.
      opacity: enabled ? (_isPressed ? 0.55 : 1) : 0.35,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: enabled ? widget.onPressed : null,
        onTapDown: enabled ? (_) => setState(() => _isPressed = true) : null,
        onTapUp: enabled ? (_) => setState(() => _isPressed = false) : null,
        onTapCancel: enabled ? () => setState(() => _isPressed = false) : null,
        // A minimum, not a fixed height. The label is Flexible so it wraps
        // rather than overflowing sideways -- but the box was pinned at 50,
        // which simply clipped the second line. Flutter raises no assertion for
        // a cross-axis overflow, so that failed silently and only showed up as
        // chopped text on a device with a larger system font.
        child: Container(
          width: widget.expand ? double.infinity : null,
          constraints: const BoxConstraints(minHeight: 50),
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
          decoration: BoxDecoration(
            color: isSolid ? null : background,
            gradient: isSolid ? palette.primaryGradient : null,
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
          // Keyed on what is actually showing, so a label that changes under
          // the finger crosses over instead of snapping -- the guide's last
          // page turns "Lanjut" into "Mulai" -- and so does the swap between
          // the label and the busy spinner. Elsewhere the key never changes
          // and this costs nothing. 180ms is the toast's fade.
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 180),
            child: KeyedSubtree(
              key: ValueKey(widget.isBusy ? null : widget.label),
              child: child,
            ),
          ),
        ),
      ),
    );
  }
}
