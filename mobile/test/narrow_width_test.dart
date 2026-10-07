import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/models/sample_log_entry.dart';
import 'package:atara/models/pending_scan.dart';
import 'package:atara/models/sample_model.dart';
import 'package:atara/models/stage_model.dart';
import 'package:atara/models/user_model.dart';
import 'package:atara/services/sample_status_text.dart';
import 'package:atara/theme/app_theme.dart';
import 'package:atara/widgets/app_primitives.dart';
import 'package:atara/widgets/ios/inset_section.dart';
import 'package:atara/widgets/my_work_section.dart';
import 'package:atara/models/work_summary.dart';
import 'package:atara/widgets/ios/ios_button.dart';
import 'package:atara/widgets/sample_history.dart';
import 'package:atara/widgets/pending_scan_section.dart';
import 'package:atara/widgets/sample_summary_card.dart';

/// Renders the app's rows at a width narrower than any of them were designed
/// against, with the longest data each can really carry.
///
/// Nothing in this app had a single `maxLines` or `TextOverflow` on a `Text`
/// showing data, so every string was either wrapping without limit or being
/// handed infinite width inside a `Row` and pushing it past the edge. One of
/// those shipped — the scanner overlay, visible as the yellow-and-black stripes
/// over the camera feed.
///
/// `RenderFlex` throws on a main-axis overflow, so `takeException()` catches
/// exactly the class of bug this guards. It does NOT catch cross-axis clipping,
/// such as a fixed-height button swallowing a wrapped label; that still needs
/// eyes on a device.
const double _narrowWidth = 320;

Future<void> pumpNarrow(
  WidgetTester tester,
  Widget child, {
  Locale locale = const Locale('id'),
}) async {
  tester.view.physicalSize = const Size(_narrowWidth * 3, 640 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      locale: locale,
      theme: AppTheme.light,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: CupertinoPageScaffold(
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: child,
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

SampleModel sampleWith({String? ident, SampleStatus? status}) {
  return SampleModel(
    id: 'id-1',
    // The longest code the generator produces.
    sampleCode: 'SMPL-2026-00001',
    sampleIdent: ident,
    status: status ?? SampleStatus.inProgress,
    currentStage: const StageModel(id: 's2', name: 'Drying', sequenceOrder: 2),
    createdByName: 'Main Admin',
    updatedAt: DateTime.utc(2026, 9, 21, 7),
  );
}

void main() {
  // Both locales, because the failures split across them: the sample code is
  // squeezed by the *English* "In Progress" badge, while the large title and
  // the queue actions are squeezed by the longer *Indonesian* strings. Testing
  // one language would miss half of this.
  for (final locale in [const Locale('id'), const Locale('en')]) {
    final tag = locale.languageCode;

    testWidgets('[$tag] sample summary keeps the code on one line', (tester) async {
      await pumpNarrow(tester, SampleSummaryCard(sample: sampleWith()), locale: locale);

      expect(tester.takeException(), isNull);
      // The code is read character by character against a printed label, so it
      // must never be split or truncated — only scaled down.
      final code = tester.renderObject<RenderBox>(
        find.descendant(
          of: find.byType(SampleCodeText),
          matching: find.byType(RichText),
        ).first,
      );
      expect(code.size.height, lessThan(40),
          reason: 'the sample code wrapped onto a second line');
    });

    testWidgets('[$tag] sample summary survives the longest Sample ID', (tester) async {
      await pumpNarrow(
        tester,
        SampleSummaryCard(
          sample: sampleWith(ident: 'MOL/LIM/S3/PA4/B42/919.3/25'),
        ),
        locale: locale,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('[$tag] a profile row holds a long name beside a role badge',
        (tester) async {
      final palette = AppColors.light;

      await pumpNarrow(
        tester,
        Builder(
          builder: (context) => InsetSection(
            children: [
              InsetRow(
                title: 'Muhammad Fajar Nurrahman Pratama',
                subtitle: 'muhammad.fajar.nurrahman@atara.local',
                padding: const EdgeInsets.all(AppSpacing.lg),
                leading: Container(width: 44, height: 44, color: palette.fill),
                trailing: AppBadge(
                  label: userRoleText(
                    AppLocalizations.of(context)!,
                    UserRole.admin,
                  ),
                  tone: palette.success,
                ),
              ),
            ],
          ),
        ),
        locale: locale,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('[$tag] a work row holds a long code, stage and note',
      (tester) async {
    // WorkRow is what both Home and the history screen render, and the note
    // the server now sends with it is truncated at 120 characters -- the
    // widest thing that can land in a 64pt row.
    await pumpNarrow(
      tester,
      WorkRow(
        entry: WorkEntry(
          sampleCode: 'SMPL-2026-00001',
          stageName: 'XRF/ICP Analysis and Verification',
          scannedAt: DateTime.utc(2026, 9, 22, 8, 30),
          isCorrection: true,
          shiftDate: '2026-09-22',
          notes: 'a' * 120,
        ),
      ),
      locale: locale,
    );

    expect(tester.takeException(), isNull);
  });

  testWidgets('[$tag] a history row holds a long stage name', (tester) async {
      await pumpNarrow(
        tester,
        InsetSection(
          children: [
            HistoryRow(
              entry: SampleLogEntry(
                stageName: 'XRF/ICP Analysis and Verification',
                operatorName: 'Muhammad Fajar Nurrahman Pratama',
                scannedAt: DateTime.utc(2026, 9, 21, 7),
                notes: 'Sampel basah, dikeringkan ulang sebelum ditimbang.',
              ),
            ),
          ],
        ),
        locale: locale,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('[$tag] a queued scan row holds its actions and reason',
        (tester) async {
      await pumpNarrow(
        tester,
        InsetSection(
          children: [
            ScanRow(
              scan: PendingScan(
                id: 'q1',
                sampleCode: 'SMPL-2026-00001',
                stageId: 's3',
                stageName: 'XRF/ICP Analysis and Verification',
                queuedAt: DateTime.utc(2026, 9, 21, 7),
                // Server-worded, and some of them run to a full sentence.
                failureReason: 'This sample was moved by another scan a moment '
                    'ago. Scan it again to see where it is now.',
              ),
              actions: Row(
                mainAxisSize: MainAxisSize.min,
                children: const [
                  SizedBox(width: 80, height: 36),
                  SizedBox(width: 80, height: 36),
                ],
              ),
            ),
          ],
        ),
        locale: locale,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('[$tag] a filled button holds its longest label', (tester) async {
      await pumpNarrow(
        tester,
        Builder(
          builder: (context) => AppButton(
            label: AppLocalizations.of(context)!.saveAndUpdate,
            icon: CupertinoIcons.checkmark,
            onPressed: () {},
          ),
        ),
        locale: locale,
      );
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('a sample code with no style still reads the palette',
      (tester) async {
    // SampleCodeText resolves its own style only when the caller passes none.
    // That branch used to run unconditionally, so making it lazy is the kind of
    // change that could silently strip a widget's theme dependency -- and the
    // symptom would be light-mode text on a dark card, in the one place an
    // operator reads a code character by character.
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: const CupertinoPageScaffold(
          child: Center(child: SampleCodeText('SMPL-2026-00001')),
        ),
      ),
    );
    await tester.pump();

    final text = tester.widget<Text>(
      find.descendant(
        of: find.byType(SampleCodeText),
        matching: find.byType(Text),
      ),
    );
    expect(text.style!.color, AppColors.dark.label);
  });
}
