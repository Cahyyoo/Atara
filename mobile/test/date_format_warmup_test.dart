import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/services/time_text.dart';

/// That warming the date tables changes the moment, never the answer.
///
/// This gets a file of its own because `flutter test` gives each file its own
/// isolate, and the tables are library globals — a cold start is the one thing
/// this needs and the only way to get it is to be first in a fresh isolate.
/// Running these cases inside another suite would silently test a warm process.
///
/// What this CANNOT test is the win itself. There is no frame timing under
/// `flutter test`, so nothing here proves the cost moved out of a content frame;
/// that is a device observation. What it does prove is that the two things which
/// could break while moving it did not: the lazy paths still stand on their own,
/// and the formatted output is unchanged.
Future<AppLocalizations> l10n() => AppLocalizations.delegate.load(
      const Locale('id'),
    );

void main() {
  test('a day heading formats before anything has warmed the tables', () async {
    // Deliberately the FIRST test in the file, and deliberately shiftDayText
    // rather than shiftTimeText: the day path is the one that needs a locale,
    // so it is the one that fails loudly against uninitialised tables --
    // DateFormat's constructor consults dateTimePatterns through
    // verifiedLocale, which either falls back to en_US or throws.
    final text = shiftDayText(
      await l10n(),
      '2026-09-15',
      todayShiftDate: '2026-09-22',
      localeName: 'id',
    );

    expect(text, contains('15'));
    expect(
      text,
      isNot('2026-09-15'),
      reason: 'the raw ISO string is what this returns when parsing fails',
    );
  });

  test('warming is idempotent', () {
    // intl guards the table build itself, so the second call is a pair of type
    // checks. The guard here is about not paying for the formatter twice, and
    // about this being safe to call from anywhere.
    expect(warmDateFormats, returnsNormally);
    expect(warmDateFormats, returnsNormally);
  });

  test('warming does not change what either formatter returns', () async {
    // The tables were already warmed by the first test, so this compares the
    // warm answer against the shape the cold path produced above.
    final messages = await l10n();

    expect(shiftTimeText(DateTime.utc(2026, 9, 22, 8, 30)), matches(r'^\d{2}:\d{2}$'));
    expect(
      shiftDayText(messages, '2026-09-22',
          todayShiftDate: '2026-09-22', localeName: 'id'),
      messages.scanHistoryToday,
    );
    expect(
      shiftDayText(messages, '2026-09-21',
          todayShiftDate: '2026-09-22', localeName: 'id'),
      messages.scanHistoryYesterday,
    );
    expect(
      shiftDayText(messages, '2026-09-15',
          todayShiftDate: '2026-09-22', localeName: 'id'),
      contains('15'),
    );
  });
}
