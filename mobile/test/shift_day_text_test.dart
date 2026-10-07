import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/services/time_text.dart';

/// The day header on the history screen.
///
/// The thing worth pinning: "today" means the shift day the SERVER is filing
/// scans under, never the handset's calendar date. A shift begins at 07:00
/// WITA, so at 01:00 the two disagree — and the phone deliberately has no idea
/// where that boundary is.

Future<AppLocalizations> load(String locale) =>
    AppLocalizations.delegate.load(Locale(locale));

void main() {
  late AppLocalizations id;
  late AppLocalizations en;

  setUp(() async {
    id = await load('id');
    en = await load('en');
  });

  String textFor(
    AppLocalizations l10n,
    String day, {
    required String today,
    String locale = 'id',
  }) =>
      shiftDayText(l10n, day, todayShiftDate: today, localeName: locale);

  test('names the current shift day', () {
    expect(
      textFor(id, '2026-09-22', today: '2026-09-22'),
      'Hari ini',
    );
    expect(
      textFor(en, '2026-09-22', today: '2026-09-22', locale: 'en'),
      'Today',
    );
  });

  test('names the one before it', () {
    expect(textFor(id, '2026-09-21', today: '2026-09-22'), 'Kemarin');
    expect(
      textFor(en, '2026-09-21', today: '2026-09-22', locale: 'en'),
      'Yesterday',
    );
  });

  test('dates anything older', () {
    final text = textFor(id, '2026-09-15', today: '2026-09-22');

    expect(text, isNot('Hari ini'));
    expect(text, isNot('Kemarin'));
    expect(text, contains('15'));
  });

  test('follows the server, not this device', () {
    // The whole reason the boundary is not computed here. A handset opening
    // the screen today still sees a week-old group dated, never called today.
    final text = textFor(id, '2026-09-15', today: '2026-09-15');
    expect(text, 'Hari ini', reason: 'the server says this IS the shift day');

    final stale = textFor(id, '2026-09-22', today: '2026-09-15');
    expect(
      stale,
      isNot('Hari ini'),
      reason: 'a later date is not today just because the handset thinks so',
    );
  });

  test('crosses a month boundary', () {
    expect(textFor(id, '2026-08-31', today: '2026-09-01'), 'Kemarin');
  });

  test('crosses a leap day', () {
    expect(textFor(id, '2028-02-29', today: '2028-03-01'), 'Kemarin');
  });

  test('treats an entry with no shift day as belonging to today', () {
    // An older server, or a blob cached before the field existed.
    expect(textFor(id, '', today: '2026-09-22'), 'Hari ini');
  });

  test('falls back to the raw value rather than throwing', () {
    expect(textFor(id, 'not-a-date', today: '2026-09-22'), 'not-a-date');
  });
}
