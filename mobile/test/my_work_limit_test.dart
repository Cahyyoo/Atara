import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/models/work_summary.dart';
import 'package:atara/providers/my_work_provider.dart';
import 'package:atara/theme/app_theme.dart';
import 'package:atara/widgets/my_work_section.dart';

import 'support/finders.dart';

/// A tally that is simply handed to the widget, so the test never touches the
/// network or the cache.
class _FixedWork extends MyWorkNotifier {
  /// A null summary is the still-loading state, which is the branch that
  /// renders the skeleton.
  _FixedWork(WorkSummary? summary) {
    state = summary;
  }

  @override
  Future<void> refresh() async {}
}

WorkSummary summaryOf({required int entries, int? total}) {
  return WorkSummary(
    shiftDate: '2026-09-21',
    // Counted by the server across the whole shift, and deliberately allowed to
    // differ from the number of entries it actually sent.
    total: total ?? entries,
    byStage: const [],
    entries: [
      for (var i = 0; i < entries; i++)
        WorkEntry(
          sampleCode: 'SMPL-2026-${i.toString().padLeft(5, '0')}',
          stageName: 'Drying',
          scannedAt: DateTime.utc(2026, 9, 21, 7, i % 60),
          isCorrection: false,
        ),
    ],
  );
}

Future<void> pumpMyWork(WidgetTester tester, WorkSummary? summary) async {
  // Tall on purpose. The list builds rows as they scroll into view, so on a
  // default 600px viewport the tenth row and the link below it are never built
  // and the test cannot see what it came to check. The cap being tested is a
  // property of the list, not of the screen: the eleventh entry is absent at
  // any height.
  tester.view.physicalSize = const Size(400 * 3, 2400 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [myWorkProvider.overrideWith((ref) => _FixedWork(summary))],
      child: MaterialApp(
        locale: const Locale('en'),
        theme: AppTheme.light,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Builder(
          // The skeleton pulses for ever otherwise, and nothing below uses
          // pumpAndSettle -- but the next person to add a test here would.
          builder: (context) => MediaQuery(
            data: MediaQuery.of(context).copyWith(disableAnimations: true),
            child: const CupertinoPageScaffold(
              child: CustomScrollView(slivers: [MyWorkSection()]),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('shows only the first ten, and a way to the rest', (tester) async {
    await pumpMyWork(tester, summaryOf(entries: 30));

    expect(find.text('SMPL-2026-00000'), findsOneWidget);
    expect(find.text('SMPL-2026-00009'), findsOneWidget);
    // The eleventh is not built at all: that is the whole point of the cap.
    expect(find.text('SMPL-2026-00010'), findsNothing);
    expect(find.text('See scan history'), findsOneWidget);
  });

  testWidgets('still offers the history when the shift already fits',
      (tester) async {
    // This assertion used to be its inverse: with five entries there was
    // nothing more to see, so the card offered no way out. That reasoning held
    // only while the destination was the same shift. History is a different
    // question, and the answer to it does not depend on how busy today was.
    await pumpMyWork(tester, summaryOf(entries: 5));

    expect(find.text('SMPL-2026-00004'), findsOneWidget);
    expect(find.text('See scan history'), findsOneWidget);
  });

  testWidgets('offers the history before the shift has begun', (tester) async {
    // The empty branch, and the case the old conditional row hid entirely:
    // nothing recorded yet is exactly when "what did I do yesterday" is the
    // useful question.
    await pumpMyWork(tester, summaryOf(entries: 0));

    expect(find.text('See scan history'), findsOneWidget);
  });

  testWidgets('the footer reports what the shift recorded', (tester) async {
    // The server counts the whole shift in `total` but sends at most a hundred
    // logs, so the two numbers differ. The row no longer carries a count -- it
    // leads somewhere else now -- but the footer still has to say the real one.
    await pumpMyWork(tester, summaryOf(entries: 100, total: 250));

    expect(find.textContaining('250'), findsOneWidget);
    // And nothing claims a count it cannot show.
    expect(find.textContaining('See all'), findsNothing);
  });

  testWidgets('stands in for the card while the tally is still loading',
      (tester) async {
    // The null branch, which nothing exercised until a sibling screen shipped
    // a sliver into a box slot and painted a grey slab over itself. This one
    // is correct -- but only a test says so.
    await pumpMyWork(tester, null);

    expect(tester.takeException(), isNull);
    expect(anyBusyIndicator, findsWidgets);
  });
}
