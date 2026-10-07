import 'package:flutter_test/flutter_test.dart';
import 'package:atara/services/sample_code.dart';

void main() {
  group('normaliseSampleCode', () {
    test('leaves a correctly typed code alone', () {
      expect(normaliseSampleCode('SMPL-2026-00031'), 'SMPL-2026-00031');
    });

    test('accepts lower case', () {
      expect(normaliseSampleCode('smpl-2026-00031'), 'SMPL-2026-00031');
    });

    test('strips whitespace from anywhere', () {
      expect(normaliseSampleCode('  SMPL-2026-00031  '), 'SMPL-2026-00031');
      expect(normaliseSampleCode('SMPL - 2026 - 00031'), 'SMPL-2026-00031');
      expect(normaliseSampleCode('smpl 2026 00031'), 'SMPL-2026-00031');
    });

    test('pads a sequence the operator read off the label without its zeroes', () {
      expect(normaliseSampleCode('SMPL-2026-31'), 'SMPL-2026-00031');
      expect(normaliseSampleCode('SMPL-2026-1'), 'SMPL-2026-00001');
      expect(normaliseSampleCode('smpl-2026-431'), 'SMPL-2026-00431');
    });

    test('inserts the hyphens when the code is typed straight through', () {
      // The hyphen sits behind a keyboard switch on most phones.
      expect(normaliseSampleCode('SMPL202600031'), 'SMPL-2026-00031');
      expect(normaliseSampleCode('smpl202600031'), 'SMPL-2026-00031');
    });

    test('handles an empty or blank entry', () {
      expect(normaliseSampleCode(''), '');
      expect(normaliseSampleCode('   '), '');
    });

    test('never invents a year', () {
      // A bare sequence could belong to any year, so it is left for the server
      // to reject rather than silently pointed at a different sample.
      expect(normaliseSampleCode('31'), '31');
      expect(normaliseSampleCode('00031'), '00031');
    });

    test('tidies the old NKL prefix exactly as readily', () {
      // Those labels are stuck to containers already out in the field. An
      // operator reading one off a bucket has to be able to type it in.
      expect(normaliseSampleCode('NKL-2026-00031'), 'NKL-2026-00031');
      expect(normaliseSampleCode('nkl-2026-31'), 'NKL-2026-00031');
      expect(normaliseSampleCode('nkl 2026 00031'), 'NKL-2026-00031');
      expect(normaliseSampleCode('NKL202600031'), 'NKL-2026-00031');
    });

    test('does not swap one prefix for the other', () {
      // Tidying is allowed to fix punctuation; it is never allowed to change
      // which sample the code names.
      expect(normaliseSampleCode('nkl-2026-31'), isNot('SMPL-2026-00031'));
      expect(normaliseSampleCode('smpl-2026-31'), isNot('NKL-2026-00031'));
    });

    test('passes through anything it does not recognise', () {
      expect(normaliseSampleCode('LAM_QLAB_20260909_L00042'), 'LAM_QLAB_20260909_L00042');
      expect(normaliseSampleCode('what is this'), 'WHATISTHIS');
    });
  });
}
