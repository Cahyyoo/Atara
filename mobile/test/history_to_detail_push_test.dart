import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/providers/scan_history_provider.dart';
import 'package:atara/screens/sample_detail_screen.dart';
import 'package:atara/screens/scan_history_screen.dart';
import 'package:atara/theme/app_theme.dart';
import 'package:atara/widgets/my_work_section.dart';

import 'support/scan_history_fixtures.dart';

/// The second gap, and the one that matters for a flash.
///
/// Every other widget test in this suite pumps a screen on its own. Nothing ever
/// pushed one. An error that only exists WHILE a route transition is in flight —
/// two screens mounted at once, two navigation bars, two sets of Heroes — is
/// structurally impossible to catch that way, and a user reported exactly that
/// shape: a red box with text, briefly, at the top, on tapping a history row.
///
/// So this test taps, then inspects EVERY frame of the transition rather than
/// only the last one. An assertion at the end would sail straight past a frame
/// in the middle, which is where the reported symptom lives.
///
/// Animations are deliberately NOT disabled here. The transition is the subject.
Future<void> pumpHistoryWithNavigator(
  WidgetTester tester,
  ScanHistoryNotifier notifier, {
  ThemeData? theme,
}) async {
  SharedPreferences.setMockInitialValues({});

  await tester.pumpWidget(
    ProviderScope(
      overrides: [scanHistoryProvider.overrideWith((ref) => notifier)],
      child: MaterialApp(
        locale: const Locale('id'),
        theme: theme ?? AppTheme.light,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        // A real MaterialApp navigator, so the tap can actually push.
        home: const ScanHistoryScreen(),
      ),
    ),
  );
  await tester.pump();
}

/// Steps through [frames] of animation, failing on the first frame that throws
/// or that shows Flutter's error box.
///
/// `takeException` is called every frame and not once at the end: it clears what
/// it returns, and a throw two frames ago is invisible to a later call. The
/// ErrorWidget check is the other half — a subtree Flutter has already healed
/// leaves a red box behind with nothing left to report.
Future<void> expectCleanFrames(
  WidgetTester tester, {
  int frames = 40,
  Duration step = const Duration(milliseconds: 16),
}) async {
  for (var frame = 0; frame < frames; frame++) {
    await tester.pump(step);
    expect(
      tester.takeException(),
      isNull,
      reason: 'frame $frame of the transition threw',
    );
    expect(
      find.byType(ErrorWidget),
      findsNothing,
      reason: 'frame $frame of the transition is showing Flutter error box',
    );
  }
}

void main() {
  tearDown(SharedPreferences.resetStatic);

  testWidgets('pushing the detail screen from a history row stays clean',
      (tester) async {
    final notifier = ScriptedHistory({
      1: page(1, codes: ['A', 'B'], totalPages: 1),
    });
    await pumpHistoryWithNavigator(tester, notifier);
    await tester.pump();

    expect(find.byType(WorkRow), findsWidgets);
    await tester.tap(find.byType(WorkRow).first);

    // Every frame of the Cupertino slide, which runs about 400ms.
    await expectCleanFrames(tester);

    expect(find.byType(SampleDetailScreen), findsOneWidget);

    // Let the detail screen's own request fail and settle, so nothing is left
    // pending at teardown. flutter_test blocks real HTTP, so this resolves
    // quickly rather than waiting out dio's ten-second timeout.
    await tester.pump(const Duration(seconds: 15));
    tester.takeException();
  });

  testWidgets('pushing and popping repeatedly stays clean', (tester) async {
    // Stacked transitions are where a Hero tag collision or a double navigation
    // bar shows up, because the outgoing route has not finished leaving before
    // the next one arrives.
    final notifier = ScriptedHistory({
      1: page(1, codes: ['A', 'B'], totalPages: 1),
    });
    await pumpHistoryWithNavigator(tester, notifier);
    await tester.pump();

    for (var round = 0; round < 3; round++) {
      await tester.tap(find.byType(WorkRow).first);
      await expectCleanFrames(tester, frames: 30);

      // Popped mid-flight on purpose from the second round on, so an incoming
      // and an outgoing transition overlap.
      tester.state<NavigatorState>(find.byType(Navigator).first).pop();
      await expectCleanFrames(tester, frames: 40);
    }

    await tester.pump(const Duration(seconds: 15));
    tester.takeException();
  });

  testWidgets('the push stays clean in dark mode', (tester) async {
    final notifier = ScriptedHistory({
      1: page(1, codes: ['A'], totalPages: 1),
    });
    await pumpHistoryWithNavigator(tester, notifier, theme: AppTheme.dark);
    await tester.pump();

    await tester.tap(find.byType(WorkRow).first);
    await expectCleanFrames(tester);

    await tester.pump(const Duration(seconds: 15));
    tester.takeException();
  });
}
