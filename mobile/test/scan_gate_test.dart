import 'package:flutter_test/flutter_test.dart';
import 'package:atara/services/scan_gate.dart';

const code = 'NKL-2026-00031';
const other = 'NKL-2026-00032';

void main() {
  group('shouldOpenScannedCode', () {
    test('opens a fresh code', () {
      expect(
        shouldOpenScannedCode(rawValue: code, isHandling: false, lastHandledCode: null),
        isTrue,
      );
    });

    test('ignores an empty frame', () {
      expect(
        shouldOpenScannedCode(rawValue: null, isHandling: false, lastHandledCode: null),
        isFalse,
      );
      expect(
        shouldOpenScannedCode(rawValue: '', isHandling: false, lastHandledCode: null),
        isFalse,
      );
    });

    test('ignores anything while a trip is already under way', () {
      expect(
        shouldOpenScannedCode(rawValue: code, isHandling: true, lastHandledCode: null),
        isFalse,
      );
    });

    test('does not reopen the label it just came back from', () {
      // The loop this whole thing exists for: back out of a sample that could
      // not be shown, and the same label is still in front of the lens.
      expect(
        shouldOpenScannedCode(rawValue: code, isHandling: false, lastHandledCode: code),
        isFalse,
      );
    });

    test('a different label works straight away', () {
      expect(
        shouldOpenScannedCode(rawValue: other, isHandling: false, lastHandledCode: code),
        isTrue,
      );
    });

    test('clearing the guard lets the same label through again', () {
      // What the "scan it again" button does.
      expect(
        shouldOpenScannedCode(rawValue: code, isHandling: false, lastHandledCode: null),
        isTrue,
      );
    });

    test('the loop cannot restart itself', () {
      // Walk the exact sequence: read, open, come back, camera restarts, the
      // same code arrives again. It must be refused every time, however often
      // the frame repeats.
      String? lastHandled;
      var opens = 0;

      for (var frame = 0; frame < 50; frame++) {
        if (shouldOpenScannedCode(
          rawValue: code,
          isHandling: false,
          lastHandledCode: lastHandled,
        )) {
          opens++;
          lastHandled = code; // what _openSample records before navigating
        }
      }

      expect(opens, 1);
    });
  });
}
