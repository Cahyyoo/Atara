import 'package:flutter_test/flutter_test.dart';
import 'package:atara/models/work_summary.dart';
import 'package:atara/services/work_summary_cache_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

WorkSummary makeSummary({int total = 3}) {
  return WorkSummary(
    shiftDate: '2026-09-10',
    total: total,
    byStage: const [StageTally(stageName: 'Drying', count: 2)],
    entries: [
      WorkEntry(
        sampleCode: 'NKL-2026-00031',
        stageName: 'Drying',
        scannedAt: DateTime.utc(2026, 9, 10, 2, 30),
        isCorrection: false,
      ),
    ],
  );
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('round-trips the summary, flagged as coming off the device', () async {
    await WorkSummaryCacheService.save(makeSummary());

    final cached = await WorkSummaryCacheService.load();
    expect(cached, isNotNull);
    expect(cached!.shiftDate, '2026-09-10');
    expect(cached.total, 3);
    expect(cached.byStage.single.stageName, 'Drying');
    expect(cached.entries.single.sampleCode, 'NKL-2026-00031');
    // The card has to be able to say this is from the last time it was online.
    expect(cached.isFromCache, isTrue);
  });

  test('returns null when nothing has been stored', () async {
    expect(await WorkSummaryCacheService.load(), isNull);
  });

  test('clearing removes it, so one preparator does not see another tally', () async {
    await WorkSummaryCacheService.save(makeSummary(total: 42));
    expect(await WorkSummaryCacheService.load(), isNotNull);

    await WorkSummaryCacheService.clear();
    expect(await WorkSummaryCacheService.load(), isNull);
  });

  test('treats a corrupt entry as no cache rather than throwing', () async {
    SharedPreferences.setMockInitialValues({'atara_work_summary': 'not json'});
    expect(await WorkSummaryCacheService.load(), isNull);
  });

  test('keeps the totals even when the entry list is capped away', () async {
    // total and byStage are counted server-side across the whole shift, so they
    // must not be derived from the (capped) list.
    final summary = WorkSummary(
      shiftDate: '2026-09-10',
      total: 250,
      byStage: const [StageTally(stageName: 'Drying', count: 250)],
      entries: const [],
    );
    await WorkSummaryCacheService.save(summary);

    final cached = await WorkSummaryCacheService.load();
    expect(cached!.total, 250);
    expect(cached.entries, isEmpty);
  });
}
