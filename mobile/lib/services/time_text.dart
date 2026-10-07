import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';

import '../l10n/app_localizations.dart';

DateFormat? _hourMinute;

bool _warmed = false;

/// Loads the CLDR tables before anything has to draw a date.
///
/// This corrects a claim that used to stand on [shiftTimeText]: that paying for
/// the tables "on first use, after a network round trip" put the cost somewhere
/// "nobody is waiting". That has the causality backwards. The round trip has
/// already FINISHED by first use — first use is inside the build phase of the
/// frame that paints its result, which is the one frame the operator is actually
/// watching. `initializeDateFormatting` ignores its locale argument and builds
/// symbols and patterns for every locale intl knows, around a hundred and
/// twenty: tens of milliseconds on a mid-range handset, so one to a few dropped
/// frames exactly as a screen opens.
///
/// What it is NOT is once per screen. intl guards the work itself —
/// `initializeDateSymbols`/`initializeDatePatterns` only invoke their builders
/// while the globals are still `UninitializedLocaleData`, and the builders are
/// passed by reference rather than called — so the tables are built once per
/// process however many times this runs. What intl does not choose is WHEN.
/// Choosing the moment is all this function does.
///
/// Why from `main` rather than from the screen that needs it: whichever screen
/// formats the first date pays for it, and on the ordinary path that is Home's
/// first [WorkRow]. But when the shift has recorded nothing, MyWorkSection takes
/// its empty branch and renders no row, so Home formats no date at all — and
/// "nothing recorded yet" is precisely when an operator goes looking for
/// yesterday. Warming once, from main, covers Home and the history screen both.
///
/// It formats a date rather than only constructing the formatter, because
/// [DateFormat] tokenises its pattern lazily on the first `format()` and not in
/// its constructor. Constructing alone would leave half the cost behind.
///
/// It has to stay on this isolate. The tables it fills are intl library globals
/// and a [DateFormat] is not sendable, so building them in a background isolate
/// would leave this isolate's copy untouched. Only the moment can move: the
/// total CPU is unchanged, and on a handset slow enough that this overruns a
/// vsync what stutters is the skeleton shimmer rather than the content. That is
/// the trade, taken deliberately.
void warmDateFormats() {
  if (_warmed) return;
  _warmed = true;

  initializeDateFormatting();
  final formatter = DateFormat.Hm();
  formatter.format(DateTime.fromMillisecondsSinceEpoch(0));
  _hourMinute ??= formatter;
}

/// The shift clock on a work row.
///
/// The formatter is built once and kept. MyWorkSection renders up to a hundred
/// rows and used to construct a fresh [DateFormat] — re-tokenising its pattern
/// — for every one of them, on every rebuild, and it rebuilds after every save.
///
/// The lazy path below is not redundant with [warmDateFormats] and must not be
/// "cleaned up" once the warm-up exists: `scheduleTask` does not run under
/// `flutter_test` unless the scheduler is drained, so every test still arrives
/// here cold.
///
/// The locale is left to intl's default, which is what the call site did
/// before: the format follows the device, not the language chosen in Settings.
/// That is a pre-existing inconsistency and is left alone rather than changed
/// silently under the guise of a performance pass.
String shiftTimeText(DateTime at) {
  if (_hourMinute == null) warmDateFormats();
  return _hourMinute!.format(at.toLocal());
}

final _dayFormats = <String, DateFormat>{};

/// The header above one day of scans: "Hari ini", "Kemarin", or "Sen, 15 Sep".
///
/// [todayShiftDate] comes from the server's own response, never from
/// `DateTime.now()`. "Today" here means the shift day the server is currently
/// filing scans under, and at 01:00 WITA that is yesterday's calendar date —
/// which is the whole reason the shift boundary is not computed on this device.
///
/// Unlike [shiftTimeText] the locale is passed in rather than left to the
/// device. A month name is far more conspicuous than HH:mm, so the
/// inconsistency that function documents is not worth propagating here.
String shiftDayText(
  AppLocalizations l10n,
  String shiftDate, {
  required String todayShiftDate,
  required String localeName,
}) {
  if (shiftDate.isEmpty || shiftDate == todayShiftDate) {
    return l10n.scanHistoryToday;
  }

  // Parsed as UTC. `DateTime.parse("2026-09-22")` yields LOCAL midnight, so
  // subtracting a day from it lands an hour out either side of a DST change,
  // and comparing two of them across zones is worse.
  final day = DateTime.tryParse('${shiftDate}T00:00:00Z');
  final today = DateTime.tryParse('${todayShiftDate}T00:00:00Z');
  if (day == null) return shiftDate;

  if (today != null && day == today.subtract(const Duration(days: 1))) {
    return l10n.scanHistoryYesterday;
  }

  // warmDateFormats first, and the order is load-bearing: DateFormat's
  // constructor runs verifiedLocale, which consults dateTimePatterns, which has
  // to already be a Map. Against uninitialised tables this either falls back to
  // en_US or throws. Cheap when already warm — see warmDateFormats on why this
  // is not redundant.
  final format = _dayFormats[localeName] ??= () {
    warmDateFormats();
    return DateFormat('EEE, d MMM', localeName);
  }();
  return format.format(day);
}

final _dateFormats = <String, DateFormat>{};

/// A moment the operator is told about: "14:05" today, "29 Sep 14:05" before.
///
/// Built for the one-phone-per-account messages, where the time is the whole
/// point — "since 14:05" says whether the other phone is this morning's shift
/// or the one before it, and a bare clock from yesterday would say the wrong
/// thing. The day is local to this phone, not the server's shift day: this is
/// a wall-clock moment, not a filing date.
String momentText(DateTime at, {required String localeName, DateTime? now}) {
  final local = at.toLocal();
  final today = (now ?? DateTime.now()).toLocal();
  final clock = shiftTimeText(local);
  if (local.year == today.year &&
      local.month == today.month &&
      local.day == today.day) {
    return clock;
  }
  // Same order as shiftDayText, and for the same reason: the tables first.
  final format = _dateFormats[localeName] ??= () {
    warmDateFormats();
    return DateFormat('d MMM', localeName);
  }();
  return '${format.format(local)} $clock';
}
