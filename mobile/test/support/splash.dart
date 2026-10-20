import 'package:flutter_test/flutter_test.dart';

import 'package:atara/screens/splash_screen.dart';

/// Pumps until the splash's clock has started.
///
/// The splash does not start in initState: it waits for the first frame and
/// one more, then starts its clock on the frame after. A single long pump
/// straight after pumpWidget would pass before the clock had started and
/// leave the splash at its very first instant.
Future<void> startSplash(WidgetTester tester) async {
  await tester.pump();
  await tester.pump();
}

/// Pumps until the splash has played out and handed over.
Future<void> pumpPastSplash(WidgetTester tester) async {
  await startSplash(tester);
  await tester.pump(SplashScreen.hold + const Duration(milliseconds: 50));
}
