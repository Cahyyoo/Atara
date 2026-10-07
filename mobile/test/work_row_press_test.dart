import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/models/work_summary.dart';
import 'package:atara/theme/app_theme.dart';
import 'package:atara/widgets/app_primitives.dart';
import 'package:atara/widgets/my_work_section.dart';

/// What a press costs.
///
/// The tint used to come from `setState`, which rebuilt the whole row — five
/// TextStyle merges, two Icons, five RenderParagraph span comparisons — to
/// change one colour. That was tolerable on a tap and wasteful while scrolling:
/// holding a finger still past kPressTimeout before dragging fires onTapDown
/// then onTapCancel, so every slow drag start paid two full row rebuilds, once
/// per flick, down a ninety-day list.
///
/// The property is that the content survives a press by identity. It is
/// directly assertable because ValueListenableBuilder passes its `child`
/// straight through without rebuilding it, so the widget instance is the same
/// object before and after.
///
/// Every gesture here ends in `cancel()` rather than `up()`, and that is not
/// laziness. A completed tap runs WorkRow's onTap, which pushes
/// SampleDetailScreen, whose initState fires a request — leaving a pending
/// timer that fails the test binding at teardown for reasons that have nothing
/// to do with the tint. Cancel is also the case that matters most here: it is
/// what a scroll does after the finger has already gone down. onTapUp assigns
/// `false` to the same notifier on the adjacent line, and is covered on a
/// device rather than pretended at here.
Future<void> pumpRow(
  WidgetTester tester, {
  BorderRadius? tintRadius,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      locale: const Locale('id'),
      theme: AppTheme.light,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: CupertinoPageScaffold(
        child: WorkRow(
          tintRadius: tintRadius,
          entry: WorkEntry(
            sampleCode: 'SMPL-2026-00001',
            stageName: 'PREP BASAH',
            scannedAt: DateTime.utc(2026, 9, 22, 8, 30),
            isCorrection: false,
            shiftDate: '2026-09-22',
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

/// The tint box.
///
/// Scoped twice, and both narrowings were earned by a failure. `find.byType`
/// alone matches several: CupertinoPageScaffold paints its own background with
/// one, and the Cupertino page transition wraps the route in a DecoratedBox
/// carrying a _CupertinoEdgeShadowDecoration — which is not a BoxDecoration and
/// blew up the cast. So: inside WorkRow, and only the box that carries a
/// BoxDecoration.
BoxDecoration tintOf(WidgetTester tester) => tester
    .widgetList<DecoratedBox>(
      find.descendant(
        of: find.byType(WorkRow),
        matching: find.byType(DecoratedBox),
      ),
    )
    .map((box) => box.decoration)
    .whereType<BoxDecoration>()
    .single;

void main() {
  testWidgets('a press does not rebuild the row', (tester) async {
    await pumpRow(tester);
    final before = tester.widget(find.byType(SampleCodeText));

    final gesture = await tester.startGesture(
      tester.getCenter(find.byType(WorkRow)),
    );
    // Past kPressTimeout, which is where a scroll gesture would also have
    // triggered onTapDown before deciding it was a drag.
    await tester.pump(const Duration(milliseconds: 150));

    expect(
      identical(tester.widget(find.byType(SampleCodeText)), before),
      isTrue,
      reason: 'a press must repaint the tint, not rebuild the content',
    );

    await gesture.cancel();
    await tester.pump();
  });

  testWidgets('the tint appears while held and clears when the press ends',
      (tester) async {
    // The scrolling case: the finger goes down, then the gesture is taken over
    // by the scrollable. A tint left behind would stay lit on a row the
    // operator never tapped.
    await pumpRow(tester);
    expect(tintOf(tester).color!.a, 0.0);

    final gesture = await tester.startGesture(
      tester.getCenter(find.byType(WorkRow)),
    );
    await tester.pump(const Duration(milliseconds: 150));
    expect(tintOf(tester).color, AppColors.light.fill);

    await gesture.cancel();
    await tester.pump();
    expect(tintOf(tester).color!.a, 0.0);
  });

  for (final (tag, radius) in <(String, BorderRadius?)>[
    ('Home', null),
    ('history', BorderRadius.all(Radius.circular(AppRadius.lg))),
  ]) {
    testWidgets('[$tag] the tint wears the corner it was given', (tester) async {
      // Both call sites, pinned. Home paints the card once for the section so a
      // square tint never reaches a corner; the history list gives every row its
      // own slice, and the first and last of each day are rounded.
      await pumpRow(tester, tintRadius: radius);
      final gesture = await tester.startGesture(
        tester.getCenter(find.byType(WorkRow)),
      );
      await tester.pump(const Duration(milliseconds: 150));

      expect(tintOf(tester).borderRadius, radius);

      await gesture.cancel();
      await tester.pump();
    });
  }
}
