import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:atara/models/sample_model.dart';
import 'package:atara/models/stage_model.dart';
import 'package:atara/services/sample_cache_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

SampleModel makeSample(String code, {String stage = 'Drying'}) {
  return SampleModel(
    id: 'id-$code',
    sampleCode: code,
    status: SampleStatus.inProgress,
    currentStage: StageModel(id: 'stage-2', name: stage, sequenceOrder: 2),
    createdByName: 'Main Admin',
    updatedAt: DateTime.utc(2026, 9, 10, 3),
  );
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('stores a sample and reads it back intact', () async {
    await SampleCacheService.save(makeSample('NKL-2026-00031'));

    final cached = await SampleCacheService.load('NKL-2026-00031');
    expect(cached, isNotNull);
    expect(cached!.sampleCode, 'NKL-2026-00031');
    expect(cached.status, SampleStatus.inProgress);
    expect(cached.currentStage?.name, 'Drying');
    // The screen has to be able to say where this came from.
    expect(cached.isFromCache, isTrue);
  });

  test('returns null for a sample it has never seen', () async {
    await SampleCacheService.save(makeSample('NKL-2026-00031'));
    expect(await SampleCacheService.load('NKL-2026-00099'), isNull);
  });

  test('replaces rather than duplicates when the same code is saved again', () async {
    await SampleCacheService.save(makeSample('NKL-2026-00031', stage: 'Drying'));
    await SampleCacheService.save(makeSample('NKL-2026-00031', stage: 'Weighing'));

    final cached = await SampleCacheService.load('NKL-2026-00031');
    expect(cached!.currentStage?.name, 'Weighing');

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getStringList('atara_sample_index')!.length, 1);
  });

  test('drops the oldest once it is full', () async {
    // 301 saves, so the very first one should have fallen off the end.
    for (var i = 0; i <= 300; i++) {
      await SampleCacheService.save(makeSample('NKL-2026-${i.toString().padLeft(5, '0')}'));
    }

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getStringList('atara_sample_index')!.length, 300);
    expect(await SampleCacheService.load('NKL-2026-00000'), isNull);
    expect(await SampleCacheService.load('NKL-2026-00300'), isNotNull);
    // Dropped from the index *and* erased, or the store would grow for ever
    // while claiming to be capped.
    expect(prefs.getString('atara_sample_NKL-2026-00000'), isNull);
  });

  test('carries an older single-blob cache across', () async {
    // What the previous version of the app left on disk. Updating mid-shift
    // must not burn the samples an operator saved for going offline.
    SharedPreferences.setMockInitialValues({
      'atara_sample_cache': <String>[
        jsonEncode(makeSample('NKL-2026-00031', stage: 'Weighing').toJson()),
        jsonEncode(makeSample('NKL-2026-00032').toJson()),
      ],
    });

    final cached = await SampleCacheService.load('NKL-2026-00031');
    expect(cached, isNotNull);
    expect(cached!.currentStage?.name, 'Weighing');
    expect(await SampleCacheService.load('NKL-2026-00032'), isNotNull);

    // Migrated once, then the old blob is gone.
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getStringList('atara_sample_cache'), isNull);
    expect(prefs.getStringList('atara_sample_index'), hasLength(2));
  });

  test('keeps the readable samples when one stored entry is corrupt', () async {
    SharedPreferences.setMockInitialValues({
      'atara_sample_cache': <String>['not json at all'],
    });
    await SampleCacheService.save(makeSample('NKL-2026-00031'));

    expect(await SampleCacheService.load('NKL-2026-00031'), isNotNull);
  });
}
