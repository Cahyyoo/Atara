/// How loudly an announcement speaks.
///
/// The same two the website uses: INFO is a notice each reader may close,
/// WARNING stays up until it ends. An unknown word reads as INFO rather than
/// throwing — a banner is not worth a crash.
enum AnnouncementTone {
  info,
  warning;

  static AnnouncementTone fromWire(Object? value) =>
      value == 'WARNING' ? AnnouncementTone.warning : AnnouncementTone.info;
}

/// A line an administrator put above every screen for a while.
///
/// The server has already decided whether this one is live and whether it is
/// aimed at this account's role (`loadActiveAnnouncements`), so there is
/// nothing to filter here beyond what the reader has closed.
class Announcement {
  const Announcement({
    required this.id,
    required this.message,
    required this.tone,
  });

  final String id;
  final String message;
  final AnnouncementTone tone;

  /// Refuses rather than throws: one malformed row must not cost the banner.
  static Announcement? tryFromJson(Object? json) {
    if (json is! Map) return null;
    final id = json['id'];
    final message = json['message'];
    if (id is! String || message is! String || message.isEmpty) return null;
    return Announcement(
      id: id,
      message: message,
      tone: AnnouncementTone.fromWire(json['tone']),
    );
  }

  /// A warning is not the reader's to dismiss; the website holds the same line.
  bool get canDismiss => tone == AnnouncementTone.info;
}
