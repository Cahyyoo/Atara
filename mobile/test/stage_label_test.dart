import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/models/stage_model.dart';
import 'package:atara/services/stage_label.dart';

Future<AppLocalizations> localisations(String locale) =>
    AppLocalizations.delegate.load(Locale(locale));

void main() {
  group('stageLabel', () {
    test('says what the language says', () async {
      final id = await localisations('id');
      final en = await localisations('en');

      expect(stageLabel(id, 'RECEIVED', 'x'), 'DITERIMA');
      expect(stageLabel(en, 'RECEIVED', 'x'), 'RECEIVED');
      expect(stageLabel(id, 'DRY_PREP', 'x'), 'PREP KERING');
      expect(stageLabel(en, 'DRY_PREP', 'x'), 'DRY PREP');
    });

    test('covers every stage in both languages', () async {
      for (final locale in ['id', 'en']) {
        final l10n = await localisations(locale);
        for (final key in ['RECEIVED', 'WET_PREP', 'DRY_PREP', 'ANALYSIS', 'REPORT']) {
          expect(stageLabel(l10n, key, 'FALLBACK'), isNot('FALLBACK'),
              reason: '$key has no $locale wording');
        }
      }
    });

    /// A stage this build has never heard of still has to be nameable, and a
    /// missing key must not take the screen down with it.
    test('falls back to the stored name rather than throwing', () async {
      final l10n = await localisations('id');

      expect(stageLabel(l10n, 'PACKING', 'Packing'), 'Packing');
      expect(stageLabel(l10n, null, 'Some Stage'), 'Some Stage');
    });
  });

  group('StageModel', () {
    test('reads the key the server sends', () {
      final stage = StageModel.fromJson({
        'id': 's1',
        'key': 'WET_PREP',
        'name': 'PREP BASAH',
        'sequenceOrder': 2,
      });

      expect(stage.key, 'WET_PREP');
      expect(stage.name, 'PREP BASAH');
    });

    /// An app updated mid-shift has a cache full of entries written before the
    /// key existed. Throwing here would empty it at the worst moment.
    test('still reads a cached stage written before keys existed', () {
      final stage = StageModel.fromJson({
        'id': 's1',
        'name': 'Drying',
        'sequenceOrder': 2,
      });

      expect(stage.key, isNull);
      expect(stage.name, 'Drying');
    });

    test('round-trips its key through the cache', () {
      const stage = StageModel(id: 's1', key: 'REPORT', name: 'REPORT', sequenceOrder: 5);
      expect(StageModel.fromJson(stage.toJson()).key, 'REPORT');
    });
  });
}
