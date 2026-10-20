import 'package:flutter_test/flutter_test.dart';

import 'package:atara/screens/splash_screen.dart';

/// Pumps until the splash's clock has started.
///
/// The splash no longer starts in initState: it waits for the first frame,
/// for its trolley picture (never more than 600ms, and in a test the picture
/// is never parsed, so the full wait), and for one more frame. A single long
/// pump straight after pumpWidget would advance the clock before any of that
/// had happened and leave the splash at its very first instant.
Future<void> startSplash(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 700));
  await tester.pump();
}

/// Pumps until the splash has played out and handed over.
Future<void> pumpPastSplash(WidgetTester tester) async {
  await startSplash(tester);
  await tester.pump(SplashScreen.hold + const Duration(milliseconds: 50));
}
