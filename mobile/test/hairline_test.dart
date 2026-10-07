import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/theme/app_theme.dart';
import 'package:atara/widgets/ios/inset_section.dart';

import 'scan_history_screen_test.dart' show pumpHistory, daysOf;
import 'support/scan_history_fixtures.dart';

/// The half-pixel line between rows, and the one way it can silently vanish.
///
/// It used to be Material's [Divider]: eight render objects, four
/// Theme.of/DividerTheme.of lookups and two _DividerDefaultsM3 allocations per
/// row, for a colour and a thickness every call site already passed explicitly.
/// [InsetHairline] is two render objects and a drawRect.
///
/// The risk in that swap is not the colour, it is the WIDTH. A childless
/// [ColoredBox] sizes to `constraints.smallest`, and what gave the Divider its
/// full width was the Center buried inside it. [InsetSection] stretches its
/// children so it would have survived; the scan history row hands its children
/// loose width, so there it would have collapsed to nothing — compiling,
/// analysing clean, and deleting every separator on the screen. Hence the width
/// assertions below, which are the entire reason this file exists.
Future<void> pumpSection(WidgetTester tester, Widget child) async {
  await tester.pumpWidget(
    MaterialApp(
      locale: const Locale('id'),
      theme: AppTheme.light,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: CupertinoPageScaffold(child: child),
    ),
  );
  await tester.pump();
}

Finder get hairlines => find.byType(InsetHairline);

/// Every hairline is a real line: half a pixel tall, and actually wide.
///
/// It measures the [ColoredBox], not the [InsetHairline]. Measuring the outer
/// widget is what this test did first, and it was useless: the outer widget is
/// the Padding, so it reports AppSpacing.lg of width even when the line inside
/// it has collapsed to zero. Removing the width from InsetHairline left that
/// version of this test passing, which is the whole failure mode it exists to
/// catch.
void expectDrawn(WidgetTester tester) {
  final found = hairlines.evaluate();
  expect(found, isNotEmpty, reason: 'the rows must still be separated');

  for (var i = 0; i < found.length; i++) {
    final line = find.descendant(
      of: hairlines.at(i),
      matching: find.byType(ColoredBox),
    );
    final size = tester.getSize(line);

    expect(size.height, 0.5, reason: 'the same half pixel the Divider drew');
    expect(
      size.width,
      greaterThan(0),
      reason: 'a childless ColoredBox takes constraints.smallest, so a '
          'hairline under loose width collapses to nothing',
    );
  }
}

void main() {
  testWidgets('the history list draws real hairlines, not Dividers',
      (tester) async {
    // The loose-width case, and the one that would actually have broken.
    tester.view.physicalSize = const Size(400 * 3, 2400 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    await pumpHistory(tester, ScriptedHistory({1: daysOf(3)}));
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.byType(Divider), findsNothing);
    expectDrawn(tester);
  });

  testWidgets('an inset section draws real hairlines, not Dividers',
      (tester) async {
    await pumpSection(
      tester,
      const InsetSection(
        children: [
          InsetRow(title: 'Satu'),
          InsetRow(title: 'Dua'),
          InsetRow(title: 'Tiga'),
        ],
      ),
    );

    expect(find.byType(Divider), findsNothing);
    // Three rows, two gaps.
    expect(hairlines, findsNWidgets(2));
    expectDrawn(tester);
  });

  testWidgets('a sliver section draws real hairlines, not Dividers',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('id'),
        theme: AppTheme.light,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: CupertinoPageScaffold(
          child: CustomScrollView(
            slivers: [
              InsetSectionSliver(
                itemCount: 3,
                itemBuilder: (context, index) => InsetRow(title: 'Baris $index'),
              ),
            ],
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.byType(Divider), findsNothing);
    expect(hairlines, findsNWidgets(2));
    expectDrawn(tester);
  });

  testWidgets('the hairline follows the palette into dark mode',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('id'),
        theme: AppTheme.dark,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: const CupertinoPageScaffold(
          child: InsetSection(
            children: [InsetRow(title: 'Satu'), InsetRow(title: 'Dua')],
          ),
        ),
      ),
    );
    await tester.pump();

    final box = tester.widget<ColoredBox>(
      find.descendant(of: hairlines, matching: find.byType(ColoredBox)),
    );
    expect(box.color, AppColors.dark.separator);
  });
}
