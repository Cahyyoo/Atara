import 'package:flutter_test/flutter_test.dart';

import 'package:atara/services/sample_ident.dart';

/// The same cases as the server's own test of this rule
/// (web/src/modules/lab/lib/samples/__tests__/sample-ident.test.ts). The form
/// previews with this copy and the server saves with its own, so a case that
/// passes there and fails here is a preview that lies.
void main() {
  String? complete({
    String? place = 'MOL',
    String? rockType = 'LIM',
    String? nonProd,
    String? sir = '3',
    String? pit = 'A4',
    String? bargingNo = '42',
    int? sequenceNo = 919,
    int? sampleNo = 3,
    int? sackCount = 12,
  }) {
    return composeSampleIdent(
      place: place,
      rockType: rockType,
      nonProd: nonProd,
      sir: sir,
      pit: pit,
      bargingNo: bargingNo,
      sequenceNo: sequenceNo,
      sampleNo: sampleNo,
      sackCount: sackCount,
    );
  }

  test('builds the shape the lab writes on the sheet', () {
    expect(complete(nonProd: 'TP'), 'MOL LIM TP S3/PA4/B42/919.3/12');
  });

  test('drops the non-production segment on an ordinary sample', () {
    expect(complete(), 'MOL LIM S3/PA4/B42/919.3/12');
    expect(complete(nonProd: '   '), 'MOL LIM S3/PA4/B42/919.3/12');
  });

  test('accepts the barging run with or without its B prefix', () {
    for (final written in ['B.42', 'B42', '42', 'b.42']) {
      expect(
        complete(bargingNo: written),
        'MOL LIM S3/PA4/B42/919.3/12',
        reason: written,
      );
    }
  });

  test('keeps a separator typed inside the barging run out of the id', () {
    for (final written in ['B 42', 'B/42', '4 2', '4/2']) {
      expect(
        complete(bargingNo: written),
        'MOL LIM S3/PA4/B42/919.3/12',
        reason: written,
      );
    }
  });

  test('upper-cases and trims what was typed', () {
    expect(
      complete(place: ' mol ', rockType: 'lim', pit: 'a4'),
      'MOL LIM S3/PA4/B42/919.3/12',
    );
  });

  test('keeps a zero, which is a real number here', () {
    expect(complete(sackCount: 0), 'MOL LIM S3/PA4/B42/919.3/0');
    expect(composeSampleIdent(place: 'MOL', sackCount: 0), 'MOL/0');
  });

  test('leaves out whichever part is missing and closes up around it', () {
    expect(complete(rockType: null), 'MOL S3/PA4/B42/919.3/12');
    expect(complete(sir: null), 'MOL LIM/PA4/B42/919.3/12');
    expect(complete(pit: null), 'MOL LIM S3/B42/919.3/12');
    expect(complete(bargingNo: null), 'MOL LIM S3/PA4/919.3/12');
    expect(complete(sackCount: null), 'MOL LIM S3/PA4/B42/919.3');
    expect(complete(pit: '  '), 'MOL LIM S3/B42/919.3/12');
  });

  test('composes nothing without a place, however much else is known', () {
    expect(complete(place: null), isNull);
    expect(complete(place: '  '), isNull);
    expect(composeSampleIdent(), isNull);
  });

  test('gives a sample known only by its place an id all the same', () {
    expect(composeSampleIdent(place: 'MOL'), 'MOL');
  });

  test(
    'writes whichever running number is known, and joins them when both are',
    () {
      expect(composeSampleIdent(place: 'MOL', sequenceNo: 919), 'MOL/919');
      expect(composeSampleIdent(place: 'MOL', sampleNo: 3), 'MOL/3');
      expect(
        composeSampleIdent(place: 'MOL', sequenceNo: 919, sampleNo: 3),
        'MOL/919.3',
      );
    },
  );
}
