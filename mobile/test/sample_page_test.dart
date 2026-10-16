import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/models/sample_model.dart';
import 'package:atara/models/stage_model.dart';
import 'package:atara/providers/stages_provider.dart';
import 'package:atara/screens/update_status_screen.dart';
import 'package:atara/services/api_exception.dart';
import 'package:atara/services/sample_cache_service.dart';
import 'package:atara/theme/app_theme.dart';
import 'package:atara/widgets/ios/inset_section.dart';
import 'package:atara/widgets/ios/ios_button.dart';
import 'package:atara/widgets/status_view.dart';

import 'support/sample_fixtures.dart';

/// The one sample page — "Detail Sampel" — built in every state it can be in.
///
/// It replaced a read-only detail page whose tests these were. That page had
/// once gone without a widget test at all: the screen a preparator reaches by
/// tapping any recorded row, and nothing ever built it. That is the same gap documented at the top of
/// scan_history_screen_test.dart, which is how an ErrorWidget once shipped on
/// the history screen — and a user then reported a brief red box with text at
/// the top of THIS screen, which is Flutter's RenderErrorBox in a debug build.
///
/// Every test here asserts two things rather than one. `takeException()` catches
/// the throw itself, and `find.byType(ErrorWidget) findsNothing` catches the case
/// where the throw happened on an earlier frame and Flutter has already healed
/// the tree with a red box — which takeException alone sails past.
///
/// The seam is the cache, not the network. `initState` calls
/// `_showCachedWhileFetching`, which reads `SampleCacheService.load`, which is
/// only SharedPreferences. Seeding it renders the entire loaded page — summary
/// card, history section, action button — with no server and no injection point
/// added to production code.
Future<void> pumpDetail(
  WidgetTester tester, {
  SampleModel? cached,
  SampleModel? served,
  Object? failWith,
  bool hold = false,
  ThemeData? theme,
  Locale locale = const Locale('id'),
  String sampleCode = 'SMPL-2026-00001',
}) async {
  SharedPreferences.setMockInitialValues({});
  if (cached != null) await SampleCacheService.save(cached);

  await tester.pumpWidget(
    ProviderScope(
      // A fixed workflow: the stage list is a second request, and this page
      // asks for it too.
      overrides: [
        stagesProvider.overrideWith(
          (ref) async => const [
            StageModel(id: 'stage-1', name: 'Received', sequenceOrder: 1),
            StageModel(id: 'stage-2', name: 'Drying', sequenceOrder: 2),
            StageModel(id: 'stage-3', name: 'Analysis', sequenceOrder: 3),
          ],
        ),
      ],
      child: MaterialApp(
        locale: locale,
        theme: theme ?? AppTheme.light,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Builder(
          // The skeleton's pulse repeats for ever, so pumpAndSettle would hang
          // here — the same reason the history screen's harness does this.
          builder: (context) => MediaQuery(
            data: MediaQuery.of(context).copyWith(disableAnimations: true),
            child: UpdateStatusScreen(
              sampleCode: sampleCode,
              // `hold` parks the screen in its loading branch for good. A real
              // request cannot be used here at all: dio leaves a pending timer
              // that fails the binding at teardown, and waiting its timeout out
              // would land the screen in the error branch, which replaces
              // whatever the cache had already put on screen.
              fetchSample: (code) {
                if (hold) return Completer<SampleModel>().future;
                if (failWith != null) return Future.error(failWith);
                return Future.value(served ?? cached ?? sampleFixture());
              },
              // A stand-in for the identity form, which would make a request
              // of its own the moment it opened.
              identityPage: (code) =>
                  const Scaffold(body: Center(child: Text('identity form'))),
            ),
          ),
        ),
      ),
    ),
  );
  // Two pumps: the first paints the loading branch, the second lets the cache
  // read and the fetch land so the loaded branch builds.
  await tester.pump();
  await tester.pump();
}

/// What every test here asserts, and why it is two assertions.
void expectNoRenderError(WidgetTester tester, {required String reason}) {
  expect(tester.takeException(), isNull, reason: reason);
  expect(
    find.byType(ErrorWidget),
    findsNothing,
    reason:
        'a throw on an earlier frame leaves a healed red box behind, which '
        'takeException does not see',
  );
}

void main() {
  tearDown(SharedPreferences.resetStatic);

  testWidgets('builds its loading state without throwing', (tester) async {
    // No cache and a request that never answers: the loading branch, parked.
    await pumpDetail(tester, hold: true);

    expectNoRenderError(tester, reason: 'the first frame must build clean');
  });

  testWidgets('builds a full page from the cache without throwing', (
    tester,
  ) async {
    await pumpDetail(tester, cached: sampleFixture());

    expectNoRenderError(tester, reason: 'the loaded branch must build clean');
    expect(find.text('SMPL-2026-00001'), findsWidgets);
  });

  testWidgets('shows the stored-on-the-phone notice for a cached sample', (
    tester,
  ) async {
    // SampleCacheService.load returns asCached(), so isFromCache is set and the
    // dense ToneBanner renders at the top of the body.
    //
    // The fetch is parked, and it has to be: the server's answer is
    // authoritative and is NOT from the cache, so letting it land correctly
    // clears the banner. That is the screen behaving properly, not a bug —
    // which the first version of this test mistook it for.
    await pumpDetail(tester, cached: sampleFixture(), hold: true);

    expectNoRenderError(tester, reason: 'the cached banner must build clean');
    expect(find.byType(ToneBanner), findsOneWidget);
  });

  testWidgets('builds a sample with no history without throwing', (
    tester,
  ) async {
    // The other sliver in that slot: a SliverToBoxAdapter rather than an
    // InsetSectionSliver. A box in a sliver slot is exactly the mistake that
    // produced the last red slab, so both branches get pumped.
    await pumpDetail(tester, cached: sampleFixture(logs: 0));

    expectNoRenderError(tester, reason: 'the empty-history branch');
    expect(find.byType(InsetSectionSliver), findsNothing);
  });

  testWidgets('builds a long history without throwing', (tester) async {
    // Thirty rows of history, of which the page shows the latest three and a
    // way to the rest: the stage to record must not drop below the fold.
    tester.view.physicalSize = const Size(400 * 3, 2400 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    await pumpDetail(tester, cached: sampleFixture(logs: 30));

    expectNoRenderError(tester, reason: 'thirty history rows');
    expect(find.text('Lihat semua (30)'), findsOneWidget);
  });

  testWidgets('builds a sample with no current stage and no ident', (
    tester,
  ) async {
    // Both nullable fields at once: a barcode printed before anyone knew what
    // it was for.
    await pumpDetail(
      tester,
      cached: sampleFixture(
        sampleIdent: null,
        withStage: false,
        status: SampleStatus.pending,
      ),
    );

    expectNoRenderError(tester, reason: 'nulls must not reach a ! or a cast');
  });

  testWidgets('builds in dark mode without throwing', (tester) async {
    // The dark palette carries different values, and a null tone reaching a
    // decoration would only show up in one of the two.
    await pumpDetail(tester, cached: sampleFixture(), theme: AppTheme.dark);

    expectNoRenderError(tester, reason: 'dark palette');
  });

  testWidgets('reads in English too', (tester) async {
    await pumpDetail(
      tester,
      cached: sampleFixture(),
      locale: const Locale('en'),
    );

    expectNoRenderError(tester, reason: 'the English ARB');
  });

  testWidgets('builds its error state without throwing', (tester) async {
    // A refusal from the server, not a missing one: with no signal the page
    // carries on so a stage can still be queued, and only a real answer from
    // the server is an error.
    await pumpDetail(
      tester,
      failWith: const ApiException(
        'boom',
        statusCode: 500,
        kind: ApiErrorKind.server,
      ),
    );

    expectNoRenderError(
      tester,
      reason:
          'the error branch keeps the same '
          'AppPage bar as every other state',
    );
    expect(find.text('Coba Lagi'), findsOneWidget);
  });

  testWidgets('builds its not-found state without throwing', (tester) async {
    await pumpDetail(
      tester,
      failWith: const ApiException(
        'missing',
        statusCode: 404,
        kind: ApiErrorKind.server,
      ),
    );

    expectNoRenderError(tester, reason: 'the notFound branch');
  });

  testWidgets('an unexpected error is still a page, not a crash', (
    tester,
  ) async {
    // The bare `catch` at the end of _fetch. A TypeError out of model parsing
    // lands here, and it must read as a page rather than a red slab.
    await pumpDetail(tester, failWith: StateError('parsing went wrong'));

    expectNoRenderError(tester, reason: 'the catch-all branch');
  });

  testWidgets('no signal keeps a good cached page on screen', (tester) async {
    // The cache puts a full page up, then the request fails because the server
    // cannot be reached. Nothing was decided, so the cached page stays — with
    // its notice — and a stage can still be recorded and queued.
    await pumpDetail(
      tester,
      cached: sampleFixture(),
      failWith: const ApiException('offline', kind: ApiErrorKind.unreachable),
    );

    expectNoRenderError(tester, reason: 'still no render error either way');
    expect(find.text('Coba Lagi'), findsNothing);
    expect(find.text('SMPL-2026-00001'), findsWidgets);
  });

  group('a sample with no Sample ID', () {
    // Tall enough that the banner and the save button, at the foot of a lazily
    // built list, are on screen and so built at all.
    Future<void> tall(WidgetTester tester) async {
      tester.view.physicalSize = const Size(400 * 3, 2400 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
    }

    testWidgets('opens the identity form as soon as the server says so', (
      tester,
    ) async {
      await tall(tester);
      await pumpDetail(tester, served: sampleFixture(sampleIdent: null));
      await tester.pumpAndSettle();

      expectNoRenderError(tester, reason: 'the form is pushed over the page');
      expect(find.text('identity form'), findsOneWidget);
    });

    testWidgets('keeps the stage locked after the form is backed out of', (
      tester,
    ) async {
      await tall(tester);
      await pumpDetail(tester, served: sampleFixture(sampleIdent: null));
      await tester.pumpAndSettle();
      tester.state<NavigatorState>(find.byType(Navigator).first).pop();
      await tester.pumpAndSettle();

      expect(find.text('identity form'), findsNothing, reason: 'once only');
      expect(
        find.text('Isi Sample ID dulu sebelum memperbarui tahap.'),
        findsOneWidget,
      );
      final save = tester.widget<AppButton>(
        find.widgetWithText(AppButton, 'Simpan & Perbarui Tahap'),
      );
      expect(save.onPressed, isNull);
    });

    testWidgets('says it needs a connection when only the cache knows it', (
      tester,
    ) async {
      await tall(tester);
      await pumpDetail(
        tester,
        cached: sampleFixture(sampleIdent: null),
        failWith: const ApiException('offline', kind: ApiErrorKind.unreachable),
      );
      await tester.pumpAndSettle();

      expect(find.text('identity form'), findsNothing);
      expect(
        find.text(
          'Sampel ini belum punya Sample ID, dan mengisinya perlu koneksi.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('leaves a hidden one alone: having it is what counts', (
      tester,
    ) async {
      await tall(tester);
      await pumpDetail(
        tester,
        served: SampleModel(
          id: 'sample-1',
          sampleCode: 'SMPL-2026-00001',
          hasSampleIdent: true,
          identHidden: true,
          status: SampleStatus.inProgress,
          currentStage: null,
          createdByName: 'Admin',
          updatedAt: DateTime.utc(2026, 10, 16),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('identity form'), findsNothing);
      expect(
        find.text('Isi Sample ID dulu sebelum memperbarui tahap.'),
        findsNothing,
      );
    });

    testWidgets('leaves a sample that has one alone', (tester) async {
      await tall(tester);
      await pumpDetail(tester, served: sampleFixture());
      await tester.pumpAndSettle();

      expect(find.text('identity form'), findsNothing);
      expect(
        find.text('Isi Sample ID dulu sebelum memperbarui tahap.'),
        findsNothing,
      );
    });
  });
}
