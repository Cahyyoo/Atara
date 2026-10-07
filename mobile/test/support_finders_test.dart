import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:atara/widgets/skeleton.dart';

import 'support/finders.dart';

/// Guards the guard.
///
/// [anyBusyIndicator] exists so that "the screen settled" assertions keep testing
/// something after the app moves to Cupertino. If it silently stopped matching
/// one of the two spinners, those assertions would pass while covering nothing
/// — the exact failure they were written to prevent.
void main() {
  testWidgets('matches the Material spinner', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: Center(child: CircularProgressIndicator())),
    );
    expect(anyBusyIndicator, findsOneWidget);
  });

  testWidgets('matches the Cupertino spinner', (tester) async {
    await tester.pumpWidget(
      const CupertinoApp(home: Center(child: CupertinoActivityIndicator())),
    );
    expect(anyBusyIndicator, findsOneWidget);
  });

  testWidgets('matches a skeleton placeholder', (tester) async {
    // The case that was missing when the spinners became skeletons, and the
    // reason three hang assertions silently stopped testing anything.
    await tester.pumpWidget(
      const MaterialApp(home: Center(child: SkeletonBar(width: 80))),
    );
    expect(anyBusyIndicator, findsOneWidget);
  });

  testWidgets('finds nothing when nothing is spinning', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: Center(child: Text('done'))),
    );
    expect(anyBusyIndicator, findsNothing);
  });
}
