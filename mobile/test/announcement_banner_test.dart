import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/models/announcement.dart';
import 'package:atara/providers/announcements_provider.dart';
import 'package:atara/services/settings_service.dart';
import 'package:atara/widgets/announcement_banner.dart';

/// What an administrator posts above every screen now reaches the phone too.
/// A warning stays until it ends; a notice can be closed and stays closed —
/// the rule the website already holds.

Announcement _info(String id, String message) =>
    Announcement(id: id, message: message, tone: AnnouncementTone.info);

Announcement _warning(String id, String message) =>
    Announcement(id: id, message: message, tone: AnnouncementTone.warning);

Future<void> show(WidgetTester tester, List<Announcement> announcements) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        announcementsProvider.overrideWith((ref) => _Fixed(announcements)),
      ],
      child: CupertinoApp(
        locale: const Locale('id'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: const CupertinoPageScaffold(child: AnnouncementBanner()),
      ),
    ),
  );
  await tester.pump();
}

/// The notifier without its network call, so the widget is what is tested.
class _Fixed extends AnnouncementsNotifier {
  _Fixed(this.fixture) {
    state = fixture;
  }

  final List<Announcement> fixture;

  @override
  Future<void> refresh() async {}

  @override
  Future<void> dismiss(String id) async {
    state = state.where((entry) => entry.id != id).toList();
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('shows nothing at all when there is no news', (tester) async {
    await show(tester, const []);
    expect(find.byType(Text), findsNothing);
  });

  testWidgets('prints what the administrator wrote', (tester) async {
    await show(tester, [_warning('a', 'XRF mati besok 08:00')]);
    expect(find.text('XRF mati besok 08:00'), findsOneWidget);
  });

  testWidgets('a warning cannot be dismissed; a notice can', (tester) async {
    await show(tester, [
      _warning('w', 'Tidak bisa ditutup'),
      _info('i', 'Bisa ditutup'),
    ]);

    // One close button, and it belongs to the notice.
    final close = find.byIcon(CupertinoIcons.xmark);
    expect(close, findsOneWidget);

    await tester.tap(close);
    await tester.pump();

    expect(find.text('Bisa ditutup'), findsNothing);
    expect(find.text('Tidak bisa ditutup'), findsOneWidget);
  });

  group('the rules behind it', () {
    test('a warning is never the reader to dismiss', () {
      expect(_warning('w', 'x').canDismiss, isFalse);
      expect(_info('i', 'x').canDismiss, isTrue);
    });

    test('an unreadable row costs the row, not the banner', () {
      expect(Announcement.tryFromJson({'id': 'a', 'message': 'ok'}), isNotNull);
      expect(Announcement.tryFromJson({'id': 'a'}), isNull);
      expect(Announcement.tryFromJson({'id': 'a', 'message': ''}), isNull);
      expect(Announcement.tryFromJson('nonsense'), isNull);
    });

    test('an unknown tone reads as a notice rather than throwing', () {
      final odd = Announcement.tryFromJson({
        'id': 'a',
        'message': 'x',
        'tone': 'SHOUTING',
      });
      expect(odd!.tone, AnnouncementTone.info);
    });

    test('what the reader closed is remembered', () async {
      await SettingsService.setDismissedAnnouncements({'a', 'b'});
      expect(await SettingsService.getDismissedAnnouncements(), {'a', 'b'});
    });
  });
}
