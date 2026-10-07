import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/settings_service.dart';

/// Whether the guide has already run on this device.
///
/// An [AsyncValue] rather than a plain bool, because the two states a bool
/// cannot tell apart are the two that matter here: starting at false would
/// flash the guide at a returning operator for a frame, and starting at true
/// would skip it for a new one. [LocaleNotifier] gets away with a plain value
/// because null there is a real answer — "follow the device" — rather than
/// "not asked yet".
///
/// A read that throws resolves to `true`, never to an error or a lingering
/// `loading`. SessionNotifier documents the same hazard from the other side:
/// a gate that holds a spinner for `loading` never gets past its opening
/// frame. Here the safe fallback is also the kind one — a prefs store that
/// will not answer must not trap someone in the guide on every launch.
class OnboardingNotifier extends StateNotifier<AsyncValue<bool>> {
  OnboardingNotifier() : super(const AsyncValue.loading()) {
    _load();
  }

  Future<void> _load() async {
    bool seen;
    try {
      seen = await SettingsService.getOnboardingSeen();
    } catch (_) {
      seen = true;
    }
    // The read outlives the constructor, and a StateNotifier throws if its
    // state is set after it has been disposed.
    if (!mounted) return;
    state = AsyncValue.data(seen);
  }

  /// Flips the state before the disk write, so the guide leaves on the tap
  /// rather than after a round trip to storage. A write that fails costs one
  /// extra showing, which is cheaper than a button that does nothing.
  Future<void> markSeen() async {
    state = const AsyncValue.data(true);
    try {
      await SettingsService.setOnboardingSeen(true);
    } catch (_) {}
  }
}

final onboardingSeenProvider =
    StateNotifierProvider<OnboardingNotifier, AsyncValue<bool>>(
  (ref) => OnboardingNotifier(),
);
