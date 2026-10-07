import 'dart:isolate';
import 'dart:typed_data';

import 'package:camera/camera.dart';
import 'package:flutter/services.dart' show DeviceOrientation;
import 'package:image/image.dart' as img;

/// The two layouts the face camera asks the platforms for.
enum FaceFrameLayout {
  /// Android (CameraX): one plane, Y then interleaved VU.
  nv21,

  /// iOS: one plane, four bytes a pixel, rows possibly padded.
  bgra8888,
}

/// One streamed camera frame, reduced to what can cross an isolate.
///
/// [CameraImage] itself cannot be sent, and it carries more than is needed; the
/// plane's bytes are the only heavy part and are passed as they are.
class FaceFrameInput {
  const FaceFrameInput({
    required this.bytes,
    required this.width,
    required this.height,
    required this.bytesPerRow,
    required this.layout,
    this.rotation = 0,
    this.mirrored = false,
  });

  final Uint8List bytes;
  final int width;
  final int height;
  final int bytesPerRow;
  final FaceFrameLayout layout;

  /// Degrees clockwise that make the frame upright: 0, 90, 180 or 270.
  final int rotation;

  /// Whether the platform already flipped the frame, as iOS does for the
  /// front camera. Undone here, because the enrolments were taken from the
  /// web client's unmirrored video.
  final bool mirrored;

  /// Null when the camera sent a layout this does not read.
  static FaceFrameInput? fromCameraImage(
    CameraImage image, {
    required int rotation,
    required bool mirrored,
  }) {
    final layout = switch (image.format.group) {
      ImageFormatGroup.nv21 => FaceFrameLayout.nv21,
      ImageFormatGroup.bgra8888 => FaceFrameLayout.bgra8888,
      _ => null,
    };
    if (layout == null || image.planes.isEmpty) return null;
    final plane = image.planes.first;
    return FaceFrameInput(
      bytes: plane.bytes,
      width: image.width,
      height: image.height,
      bytesPerRow: plane.bytesPerRow,
      layout: layout,
      rotation: rotation,
      mirrored: mirrored,
    );
  }
}

/// Degrees clockwise that turn a streamed frame upright.
///
/// Android hands frames over exactly as the sensor reads them, so the sensor's
/// mounting and the way the phone is being held both have to be undone; for a
/// front camera the two add, because its image is the other way round. iOS
/// rotates the stream to the device orientation itself, so there is nothing
/// left to do there.
int faceFrameRotation({
  required bool isAndroid,
  required int sensorOrientation,
  required DeviceOrientation deviceOrientation,
  required bool frontFacing,
}) {
  if (!isAndroid) return 0;
  final device = switch (deviceOrientation) {
    DeviceOrientation.portraitUp => 0,
    DeviceOrientation.landscapeLeft => 90,
    DeviceOrientation.portraitDown => 180,
    DeviceOrientation.landscapeRight => 270,
  };
  return frontFacing
      ? (sensorOrientation + device) % 360
      : (sensorOrientation - device + 360) % 360;
}

/// JPEG quality for frames sent to the face service. At the low preset a frame
/// is ~10-20KB, a tenth of what the web route accepts.
const int faceFrameJpegQuality = 85;

/// [encodeFaceFrame] on another isolate, so a burst never stalls the preview.
Future<Uint8List> encodeFaceFrameInBackground(FaceFrameInput input) =>
    Isolate.run(() => encodeFaceFrame(input));

/// An upright, unmirrored JPEG of one streamed frame.
Uint8List encodeFaceFrame(FaceFrameInput input) {
  var image = switch (input.layout) {
    FaceFrameLayout.nv21 => _fromNv21(input),
    FaceFrameLayout.bgra8888 => img.Image.fromBytes(
      width: input.width,
      height: input.height,
      bytes: input.bytes.buffer,
      bytesOffset: input.bytes.offsetInBytes,
      rowStride: input.bytesPerRow,
      numChannels: 4,
      order: img.ChannelOrder.bgra,
    ),
  };
  if (input.mirrored) image = img.flipHorizontal(image);
  if (input.rotation % 360 != 0) {
    image = img.copyRotate(image, angle: input.rotation);
  }
  return img.encodeJpg(image, quality: faceFrameJpegQuality);
}

img.Image _fromNv21(FaceFrameInput input) {
  final width = input.width;
  final height = input.height;
  final stride = input.bytesPerRow;
  final src = input.bytes;
  final uvStart = stride * height;
  final rgb = Uint8List(width * height * 3);

  var out = 0;
  for (var y = 0; y < height; y++) {
    final yRow = y * stride;
    final uvRow = uvStart + (y >> 1) * stride;
    for (var x = 0; x < width; x++) {
      final luma = src[yRow + x];
      final uv = uvRow + (x & ~1);
      final v = src[uv] - 128;
      final u = src[uv + 1] - 128;
      // BT.601 in fixed point (x1024), so the inner loop stays in integers.
      rgb[out++] = _clamp(luma + ((1436 * v) >> 10));
      rgb[out++] = _clamp(luma - ((352 * u + 731 * v) >> 10));
      rgb[out++] = _clamp(luma + ((1815 * u) >> 10));
    }
  }
  return img.Image.fromBytes(
    width: width,
    height: height,
    bytes: rgb.buffer,
    numChannels: 3,
  );
}

int _clamp(int value) => value < 0 ? 0 : (value > 255 ? 255 : value);
