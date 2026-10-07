import 'dart:typed_data';

import 'package:atara/services/face_frame_encoder.dart';
import 'package:flutter/services.dart' show DeviceOrientation;
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;

/// The face service finds faces with a frontal detector: a frame that arrives
/// on its side, or flipped against the enrolments, is a face it cannot read.
/// So what is pinned here is which way up the frame comes out.

const int width = 32;
const int height = 16;

/// NV21, left half white and right half black, no colour.
Uint8List halvesNv21() {
  final bytes = Uint8List(width * height * 3 ~/ 2)..fillRange(0, width * height * 3 ~/ 2, 128);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      bytes[y * width + x] = x < width ~/ 2 ? 235 : 16;
    }
  }
  return bytes;
}

/// BGRA, the same halves, with each row padded as iOS may pad it.
Uint8List halvesBgra({required int bytesPerRow}) {
  final bytes = Uint8List(bytesPerRow * height);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      final value = x < width ~/ 2 ? 255 : 0;
      final i = y * bytesPerRow + x * 4;
      bytes[i] = value;
      bytes[i + 1] = value;
      bytes[i + 2] = value;
      bytes[i + 3] = 255;
    }
  }
  return bytes;
}

img.Image decode(Uint8List jpeg) => img.decodeJpg(jpeg)!;

bool bright(img.Image image, int x, int y) => image.getPixel(x, y).luminance > 128;

void main() {
  group('encodeFaceFrame', () {
    test('an NV21 frame with no rotation keeps its shape and its halves', () {
      final out = decode(encodeFaceFrame(FaceFrameInput(
        bytes: halvesNv21(),
        width: width,
        height: height,
        bytesPerRow: width,
        layout: FaceFrameLayout.nv21,
      )));
      expect([out.width, out.height], [width, height]);
      expect(bright(out, 2, height ~/ 2), isTrue);
      expect(bright(out, width - 3, height ~/ 2), isFalse);
    });

    test('rotating 90 degrees clockwise puts the left edge at the top', () {
      final out = decode(encodeFaceFrame(FaceFrameInput(
        bytes: halvesNv21(),
        width: width,
        height: height,
        bytesPerRow: width,
        layout: FaceFrameLayout.nv21,
        rotation: 90,
      )));
      expect([out.width, out.height], [height, width]);
      expect(bright(out, height ~/ 2, 2), isTrue);
      expect(bright(out, height ~/ 2, width - 3), isFalse);
    });

    test('rotating 270 degrees puts the left edge at the bottom', () {
      final out = decode(encodeFaceFrame(FaceFrameInput(
        bytes: halvesNv21(),
        width: width,
        height: height,
        bytesPerRow: width,
        layout: FaceFrameLayout.nv21,
        rotation: 270,
      )));
      expect([out.width, out.height], [height, width]);
      expect(bright(out, height ~/ 2, 2), isFalse);
      expect(bright(out, height ~/ 2, width - 3), isTrue);
    });

    test('NV21 colour survives the conversion', () {
      // Pure red in BT.601: Y 76, U 85, V 255.
      final bytes = Uint8List(width * height * 3 ~/ 2);
      bytes.fillRange(0, width * height, 76);
      for (var i = width * height; i < bytes.length; i += 2) {
        bytes[i] = 255; // V
        bytes[i + 1] = 85; // U
      }
      final pixel = decode(encodeFaceFrame(FaceFrameInput(
        bytes: bytes,
        width: width,
        height: height,
        bytesPerRow: width,
        layout: FaceFrameLayout.nv21,
      ))).getPixel(width ~/ 2, height ~/ 2);
      expect(pixel.r, greaterThan(200));
      expect(pixel.g, lessThan(60));
      expect(pixel.b, lessThan(60));
    });

    test('a padded BGRA row is read to its width, not its stride', () {
      final out = decode(encodeFaceFrame(FaceFrameInput(
        bytes: halvesBgra(bytesPerRow: width * 4 + 64),
        width: width,
        height: height,
        bytesPerRow: width * 4 + 64,
        layout: FaceFrameLayout.bgra8888,
      )));
      expect([out.width, out.height], [width, height]);
      expect(bright(out, 2, height ~/ 2), isTrue);
      expect(bright(out, width - 3, height ~/ 2), isFalse);
    });

    test('a mirrored frame is flipped back', () {
      final out = decode(encodeFaceFrame(FaceFrameInput(
        bytes: halvesBgra(bytesPerRow: width * 4),
        width: width,
        height: height,
        bytesPerRow: width * 4,
        layout: FaceFrameLayout.bgra8888,
        mirrored: true,
      )));
      expect(bright(out, 2, height ~/ 2), isFalse);
      expect(bright(out, width - 3, height ~/ 2), isTrue);
    });

    test('a frame is small enough for the web route', () {
      // 160KB of base64 is the route's limit; a 320x240 frame should be a
      // small fraction of it.
      final bytes = Uint8List(320 * 240 * 3 ~/ 2)..fillRange(0, 320 * 240 * 3 ~/ 2, 128);
      final jpeg = encodeFaceFrame(FaceFrameInput(
        bytes: bytes,
        width: 320,
        height: 240,
        bytesPerRow: 320,
        layout: FaceFrameLayout.nv21,
        rotation: 270,
      ));
      expect(jpeg.length, lessThan(40 * 1024));
    });
  });

  group('faceFrameRotation', () {
    test('an Android front camera held upright turns by its sensor angle', () {
      expect(
        faceFrameRotation(
          isAndroid: true,
          sensorOrientation: 270,
          deviceOrientation: DeviceOrientation.portraitUp,
          frontFacing: true,
        ),
        270,
      );
    });

    test('turning the phone adds to it for a front camera', () {
      expect(
        faceFrameRotation(
          isAndroid: true,
          sensorOrientation: 270,
          deviceOrientation: DeviceOrientation.landscapeLeft,
          frontFacing: true,
        ),
        0,
      );
    });

    test('and subtracts from it for a back camera', () {
      expect(
        faceFrameRotation(
          isAndroid: true,
          sensorOrientation: 90,
          deviceOrientation: DeviceOrientation.landscapeLeft,
          frontFacing: false,
        ),
        0,
      );
    });

    test('iOS frames arrive upright already', () {
      expect(
        faceFrameRotation(
          isAndroid: false,
          sensorOrientation: 90,
          deviceOrientation: DeviceOrientation.landscapeRight,
          frontFacing: true,
        ),
        0,
      );
    });
  });
}
