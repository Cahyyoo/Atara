import 'dart:async';

import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

/// A brief confirmation that fades in over whatever is on screen.
///
/// This replaces `SnackBar`, and not for looks alone: `ScaffoldMessenger`
/// requires a `Scaffold` ancestor, and once the screens moved to iOS page
/// scaffolds there is no longer one to find. Going through [Overlay] instead
/// means a toast can be raised from anywhere — including a dialog, or a screen
/// that is already popping — which is exactly where the three callers sit.
///
/// It never blocks: iOS has no snackbar idiom and nothing here is undoable, so
/// there is no action to offer and no reason to hold the preparator up.
class AppToast {
  static OverlayEntry? _current;
  static Timer? _timer;

  static void show(BuildContext context, String message, {IconData? icon}) {
    final overlay = Overlay.maybeOf(context, rootOverlay: true);
    if (overlay == null) return;

    // A second message replaces the first rather than stacking behind it.
    _dismiss();

    final palette = context.palette;
    final bottomInset = MediaQuery.of(context).padding.bottom;

    final entry = OverlayEntry(
      builder: (context) => Positioned(
        left: AppSpacing.xl,
        right: AppSpacing.xl,
        bottom: bottomInset + 90,
        child: IgnorePointer(
          child: _ToastBody(message: message, icon: icon, palette: palette),
        ),
      ),
    );

    _current = entry;
    overlay.insert(entry);
    _timer = Timer(const Duration(milliseconds: 2200), _dismiss);
  }

  static void _dismiss() {
    _timer?.cancel();
    _timer = null;
    _current?.remove();
    _current = null;
  }
}

class _ToastBody extends StatefulWidget {
  const _ToastBody({required this.message, required this.palette, this.icon});

  final String message;
  final IconData? icon;
  final AppColors palette;

  @override
  State<_ToastBody> createState() => _ToastBodyState();
}

class _ToastBodyState extends State<_ToastBody> {
  double _opacity = 0;

  @override
  void initState() {
    super.initState();
    // Fades in on the frame after insertion; an immediate opacity of 1 would
    // simply appear, which reads as a glitch rather than as a response.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) setState(() => _opacity = 1);
    });
  }

  @override
  Widget build(BuildContext context) {
    // Always the dark capsule, in both appearances: a toast sits above the page
    // rather than in it, and stays legible by contrast with the content rather
    // than by matching it. A near-black olive, so it belongs to the palette.
    const background = Color(0xF21C2213);

    return AnimatedSlide(
      offset: Offset(0, _opacity == 0 ? 0.4 : 0),
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutCubic,
      child: AnimatedOpacity(
        opacity: _opacity,
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        child: Center(
          child: Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.lg,
              vertical: AppSpacing.md,
            ),
            decoration: BoxDecoration(
              color: background,
              borderRadius: BorderRadius.circular(AppRadius.pill),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (widget.icon != null) ...[
                  Icon(widget.icon, size: 18, color: Colors.white),
                  const SizedBox(width: AppSpacing.sm),
                ],
                Flexible(
                  child: Text(
                    widget.message,
                    textAlign: TextAlign.center,
                    style: AppText.subhead.copyWith(color: Colors.white),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
