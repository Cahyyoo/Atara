import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/announcement.dart';
import '../services/api_service.dart';
import '../services/settings_service.dart';

/// The notices to show above Home, with the ones this reader closed removed.
///
/// Never an error state and never a spinner: a banner is something extra on
/// top of the screen a preparator scans from, so a server that will not answer
/// costs an empty list and nothing else.
class AnnouncementsNotifier extends StateNotifier<List<Announcement>> {
  AnnouncementsNotifier() : super(const []) {
    refresh();
  }

  Set<String> _dismissed = const {};
  List<Announcement> _fromServer = const [];

  Future<void> refresh() async {
    _dismissed = await SettingsService.getDismissedAnnouncements();
    _fromServer = await ApiService.instance.fetchAnnouncements();
    await _prune();
    if (mounted) state = _visible();
  }

  /// Closes an INFO notice for good on this phone.
  Future<void> dismiss(String id) async {
    _dismissed = {..._dismissed, id};
    await SettingsService.setDismissedAnnouncements(_dismissed);
    if (mounted) state = _visible();
  }

  /// Forgets ids the server has stopped sending, so the stored list cannot
  /// grow for ever on a phone that is never reinstalled.
  Future<void> _prune() async {
    if (_dismissed.isEmpty || _fromServer.isEmpty) return;
    final live = _fromServer.map((entry) => entry.id).toSet();
    final kept = _dismissed.intersection(live);
    if (kept.length != _dismissed.length) {
      _dismissed = kept;
      await SettingsService.setDismissedAnnouncements(kept);
    }
  }

  /// A warning always shows; the website holds the same line.
  List<Announcement> _visible() => _fromServer
      .where((entry) => !entry.canDismiss || !_dismissed.contains(entry.id))
      .toList(growable: false);
}

final announcementsProvider =
    StateNotifierProvider<AnnouncementsNotifier, List<Announcement>>(
      (ref) => AnnouncementsNotifier(),
    );
