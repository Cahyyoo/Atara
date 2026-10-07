import 'dart:async';

import 'package:flutter/widgets.dart';

/// Shows [placeholder] while [isLoading], then cross-fades to [child] — but
/// only if the wait was long enough to be worth admitting to.
///
/// A placeholder that appears for 40ms and flashes away reads as a glitch and
/// makes the screen feel *slower* than showing nothing would. Most of this
/// app's waits are a single shared-preferences round trip and land inside a
/// frame or two, so without [_graceBefore] almost every placeholder here would
/// be that flash. Once one is on screen it stays for [_holdFor], because a
/// placeholder that vanishes the instant it arrives is the same glitch from
/// the other side.
///
/// Pass `isSlow: true` for a path that is known to be network-bound — there is
/// no point waiting 150ms to admit to a ten-second timeout.
class LoadingSwap extends StatefulWidget {
  const LoadingSwap({
    super.key,
    required this.isLoading,
    required this.placeholder,
    this.isSlow = false,
    required this.child,
  });

  /// How long a wait has to last before it is worth showing anything.
  static const Duration graceBefore = Duration(milliseconds: 150);

  /// How long a placeholder stays once it has appeared.
  static const Duration holdFor = Duration(milliseconds: 300);

  /// The tempo the toast fades at; the app has one crossfade speed.
  static const Duration crossFade = Duration(milliseconds: 180);

  final bool isLoading;
  final Widget placeholder;
  final bool isSlow;
  final Widget child;

  @override
  State<LoadingSwap> createState() => _LoadingSwapState();
}

class _LoadingSwapState extends State<LoadingSwap> {
  /// Whether the placeholder is allowed on screen right now. Distinct from
  /// `widget.isLoading`: it lags behind at both ends.
  bool _showPlaceholder = false;

  /// True once the placeholder has been up long enough to leave whenever the
  /// content is ready.
  bool _heldLongEnough = false;

  /// Counts down [LoadingSwap.graceBefore] on the way in and
  /// [LoadingSwap.holdFor] on the way out.
  ///
  /// Timers rather than clock arithmetic: `DateTime.now()` does not follow the
  /// fake clock a widget test pumps, so measuring elapsed time that way is
  /// both wrong under test and untestable.
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    if (widget.isLoading) _enterLoading();
  }

  @override
  void didUpdateWidget(LoadingSwap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isLoading == oldWidget.isLoading) return;
    if (widget.isLoading) {
      _enterLoading();
    } else {
      _leaveLoading();
    }
  }

  @override
  void dispose() {
    // A pending timer outliving the tree fails the test binding outright, and
    // on device it would call setState after unmount.
    _timer?.cancel();
    super.dispose();
  }

  void _enterLoading() {
    _timer?.cancel();
    if (_showPlaceholder) return;

    if (widget.isSlow) {
      _reveal();
      return;
    }
    // Armed only on the way into a wait, never unconditionally -- otherwise
    // every screen would leave a timer pending for the tests to trip over.
    _timer = Timer(LoadingSwap.graceBefore, () {
      if (!mounted || !widget.isLoading) return;
      setState(_reveal);
    });
  }

  void _leaveLoading() {
    // Never showed: all that is pending is the grace countdown, and there is
    // nothing left for it to reveal.
    if (!_showPlaceholder) {
      _timer?.cancel();
      _timer = null;
      return;
    }
    // Showed, and has been up long enough: go now.
    if (_heldLongEnough) {
      _timer?.cancel();
      _timer = null;
      _showPlaceholder = false;
      _heldLongEnough = false;
      return;
    }
    // Showed, but only just. The hold timer is still running and will hide it
    // when it fires -- cancelling it here is what left the placeholder up for
    // ever the first time this was written.
  }

  void _reveal() {
    _showPlaceholder = true;
    _heldLongEnough = false;
    _timer = Timer(LoadingSwap.holdFor, () {
      if (!mounted) return;
      _heldLongEnough = true;
      // Already finished while the placeholder was serving its minimum.
      if (!widget.isLoading) setState(_leaveLoading);
    });
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: LoadingSwap.crossFade,
      child: _showPlaceholder
          ? KeyedSubtree(
              key: const ValueKey('placeholder'),
              child: widget.placeholder,
            )
          : KeyedSubtree(key: const ValueKey('content'), child: widget.child),
    );
  }
}
