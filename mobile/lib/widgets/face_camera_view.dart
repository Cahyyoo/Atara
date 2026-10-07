import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;
import 'dart:math' as math;

import 'package:camera/camera.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/foundation.dart' show kIsWeb;

import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/face_frame_encoder.dart';
import '../theme/app_theme.dart';
import 'face_guide_painter.dart';
import 'ios/ios_button.dart';

/// The camera surface for face verification, strictly mirroring the web client's
/// rules (FaceCamera in web):
/// - Polling /api/face/preview every 300ms (web's PREVIEW_INTERVAL_MS) with
///   jittered exponential backoff
/// - Frames taken from the camera's image stream, not `takePicture()`: a still
///   capture cost 200-500ms a frame on Android, which made a twelve-frame burst
///   last five seconds. A streamed frame is already there; it is only turned
///   into an upright, unmirrored JPEG on another isolate
/// - Requiring 3 consecutive passing frames (ARM_TICKS = 3) before automatic burst capture
/// - Capturing 16 burst frames 120ms apart (~1.9s) during blink. Sixteen is the
///   service's limit, and the most time a blink can be given now that the burst
///   no longer stretches itself out
/// - 2.5s cooldown after capture
/// - Max 3 free retries for retryable refusals before halting
/// - Real, unmirrored camera preview (no horizontal flipping)
/// - Circular face guide overlay
class FaceCameraView extends StatefulWidget {
  const FaceCameraView({
    super.key,
    required this.challenge,
    required this.onCapture,
    this.isSending = false,
    this.externalError,
    this.onRetryRequested,
    // 300ms, as on the web. The server answers a 320px preview in about 13ms,
    // so at 500ms the wait was the countdown itself; at 300ms the three-tick arm
    // takes under a second. Still well inside the server's per-person limit of
    // 20 previews in any 4 seconds.
    this.previewInterval = const Duration(milliseconds: 300),
  });

  final String challenge;
  final Future<void> Function(List<String> frames) onCapture;
  final bool isSending;
  final String? externalError;
  final VoidCallback? onRetryRequested;
  final Duration previewInterval;

  @override
  State<FaceCameraView> createState() => _FaceCameraViewState();
}

class _FaceCameraViewState extends State<FaceCameraView>
    with WidgetsBindingObserver {
  static const int _armTicks = 3;
  static const int _burstFrames = 16;
  static const Duration _burstInterval = Duration(milliseconds: 120);
  // Time for exposure to settle before the first preview. It was a second
  // when every preview was a still capture; streamed frames are live from the
  // moment the camera opens.
  static const Duration _warmUp = Duration(milliseconds: 500);
  static const Duration _cooldownDuration = Duration(milliseconds: 2500);
  static const int _maxFreeRetries = 3;
  static const int _maxPreviewFailures = 5;
  static const List<int> _backoffMs = [500, 1000, 2000, 4000];

  CameraController? _controller;
  // The newest streamed frame. Only held, never processed, until a preview
  // tick or the burst asks for it.
  CameraImage? _latestFrame;
  bool _isInitialized = false;
  bool _isCameraUnavailable = false;
  bool _isCapturing = false;

  bool _hasPreview = false;
  String? _hint;
  int _armed = 0;
  Timer? _previewTimer;
  bool _inFlightPreview = false;
  int _previewFailures = 0;
  DateTime _holdUntil = DateTime.fromMillisecondsSinceEpoch(0);

  DateTime _readyAt = DateTime.fromMillisecondsSinceEpoch(0);
  int _freeRetries = 0;
  bool _halted = false;
  String? _notice;
  String? _previewError;

  bool get _isTestEnvironment {
    if (kIsWeb) return false;
    return Platform.environment.containsKey('FLUTTER_TEST');
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initCamera();
  }

  @override
  void didUpdateWidget(FaceCameraView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.externalError != null && oldWidget.externalError == null) {
      _stopPreview();
      _freeRetries++;
      if (_freeRetries >= _maxFreeRetries) {
        _halted = true;
      }
      _notice = widget.externalError;
      _armed = 0;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (_controller == null || !_controller!.value.isInitialized) return;
    if (state == AppLifecycleState.inactive) {
      _stopPreview();
      _stopStream();
    } else if (state == AppLifecycleState.resumed) {
      _startStream();
      if (!_halted && widget.externalError == null) {
        _startPreview();
      }
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _stopPreview();
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _startStream() async {
    final controller = _controller;
    if (controller == null ||
        !controller.value.isInitialized ||
        controller.value.isStreamingImages) {
      return;
    }
    try {
      await controller.startImageStream((frame) => _latestFrame = frame);
    } catch (e) {
      debugPrint('[FaceCameraView] Image stream error: $e');
    }
  }

  Future<void> _stopStream() async {
    final controller = _controller;
    _latestFrame = null;
    if (controller == null || !controller.value.isStreamingImages) return;
    try {
      await controller.stopImageStream();
    } catch (_) {
      // Already stopped by the platform; nothing to undo.
    }
  }

  Future<void> _initCamera() async {
    setState(() {
      _isCameraUnavailable = false;
      _isInitialized = false;
      _halted = false;
      _notice = null;
      _previewError = null;
      _armed = 0;
      _hasPreview = false;
      _hint = null;
      _previewFailures = 0;
      _holdUntil = DateTime.fromMillisecondsSinceEpoch(0);
    });

    if (_isTestEnvironment) {
      if (mounted) setState(() => _isCameraUnavailable = true);
      return;
    }

    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        if (mounted) setState(() => _isCameraUnavailable = true);
        return;
      }

      final frontCamera = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.front,
        orElse: () => cameras.first,
      );

      final controller = CameraController(
        frontCamera,
        ResolutionPreset.low,
        enableAudio: false,
        // The two layouts FaceFrameInput reads, one plane each.
        imageFormatGroup: Platform.isAndroid
            ? ImageFormatGroup.nv21
            : ImageFormatGroup.bgra8888,
      );

      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }

      setState(() {
        _controller = controller;
        _isInitialized = true;
      });

      await _startStream();
      _readyAt = DateTime.now().add(_warmUp);
      _startPreview();
    } catch (_) {
      if (mounted) setState(() => _isCameraUnavailable = true);
    }
  }

  void _startPreview() {
    _previewTimer?.cancel();
    if (_isTestEnvironment) return;
    _previewTimer = Timer.periodic(
      widget.previewInterval,
      (_) => _previewTick(),
    );
  }

  void _stopPreview() {
    _previewTimer?.cancel();
    _previewTimer = null;
  }

  /// One streamed frame as the base64 JPEG the web routes take, or null when
  /// there is no frame yet or the camera sent a layout that cannot be read.
  Future<String?> _encodeFrame(CameraImage frame) async {
    final controller = _controller;
    if (controller == null) return null;
    final camera = controller.description;
    final front = camera.lensDirection == CameraLensDirection.front;
    final input = FaceFrameInput.fromCameraImage(
      frame,
      rotation: faceFrameRotation(
        isAndroid: Platform.isAndroid,
        sensorOrientation: camera.sensorOrientation,
        deviceOrientation: controller.value.deviceOrientation,
        frontFacing: front,
      ),
      // iOS mirrors the front camera's stream; Android does not.
      mirrored: front && Platform.isIOS,
    );
    if (input == null) return null;
    return base64Encode(await encodeFaceFrameInBackground(input));
  }

  Future<void> _previewTick() async {
    final controller = _controller;
    if (controller == null ||
        !controller.value.isInitialized ||
        _isCapturing ||
        widget.isSending ||
        _halted ||
        widget.externalError != null ||
        _inFlightPreview) {
      return;
    }

    final now = DateTime.now();

    // Cooldown check after capture
    if (now.isBefore(_readyAt)) {
      if (_armed != 0) setState(() => _armed = 0);
      return;
    }

    // Backoff check after failed requests
    if (now.isBefore(_holdUntil)) {
      return;
    }

    final frame = _latestFrame;
    if (frame == null) return;

    _inFlightPreview = true;
    try {
      final base64Frame = await _encodeFrame(frame);
      if (base64Frame == null) return;

      final preview = await ApiService.instance.checkFacePreview(
        frame: base64Frame,
        challenge: widget.challenge,
      );

      if (!mounted) return;

      final l10n = AppLocalizations.of(context)!;
      if (preview != null) {
        if (preview['expired'] == true) {
          _stopPreview();
          setState(() {
            _halted = true;
            _previewError = l10n.localeName.startsWith('id')
                ? 'Percobaan masuk Anda sudah kedaluwarsa. Kembali dan masukkan kata sandi lagi.'
                : 'That sign-in attempt has expired. Please start again.';
          });
          return;
        }

        if (preview['busy'] == true) {
          _stopPreview();
          setState(() {
            _halted = true;
            _previewError = l10n.localeName.startsWith('id')
                ? 'Pengenalan wajah sedang sibuk. Akan dicoba lagi sebentar lagi.'
                : 'Face recognition is busy. Please try again shortly.';
          });
          return;
        }

        if (preview['serviceDown'] == true) {
          _stopPreview();
          setState(() {
            _halted = true;
            _previewError = l10n.faceServiceDown;
          });
          return;
        }

        _previewFailures = 0;
        final ok = preview['ok'] == true;
        final reason = preview['reason'] as String?;

        setState(() {
          _hasPreview = true;
          if (!ok) {
            _hint = reason ?? 'qualityUnsure';
            _armed = 0;
          } else {
            _hint = null;
            _armed++;
            if (_armed >= _armTicks) {
              _armed = 0;
              _triggerCapture();
            }
          }
        });
      } else {
        _previewFailures++;
        if (_previewFailures >= _maxPreviewFailures) {
          _stopPreview();
          setState(() {
            _halted = true;
            _previewError = l10n.faceServiceDown;
          });
        } else {
          final delayMs =
              _backoffMs[math.min(_previewFailures - 1, _backoffMs.length - 1)];
          _holdUntil = DateTime.now().add(Duration(milliseconds: delayMs));
        }
      }
    } catch (_) {
      // Ignore individual frame errors
    } finally {
      _inFlightPreview = false;
    }
  }

  Future<void> _triggerCapture() async {
    final controller = _controller;
    if (controller == null ||
        !controller.value.isInitialized ||
        _isCapturing ||
        widget.isSending) {
      return;
    }

    setState(() {
      _isCapturing = true;
      _armed = 0;
      _notice = null;
    });

    try {
      // Sampled on a fixed schedule from the start, not "wait 120ms after the
      // last one", so encoding never stretches the burst. Encodes run while
      // the next frame is awaited and are collected at the end, in order.
      final clock = Stopwatch()..start();
      final encoding = <Future<String?>>[];
      CameraImage? previous;
      for (int i = 0; i < _burstFrames; i++) {
        if (!mounted) return;
        final wait = _burstInterval * i - clock.elapsed;
        if (wait > Duration.zero) await Future<void>.delayed(wait);
        final frame = _latestFrame;
        // The same frame twice says nothing new about a blink.
        if (frame == null || identical(frame, previous)) continue;
        previous = frame;
        encoding.add(_encodeFrame(frame));
      }
      final frames = (await Future.wait(encoding)).nonNulls.toList();

      if (mounted && frames.isNotEmpty) {
        await widget.onCapture(frames);
      }
    } catch (_) {
      // Errors handled by caller via externalError
    } finally {
      _readyAt = DateTime.now().add(_cooldownDuration);
      if (mounted) {
        setState(() => _isCapturing = false);
      }
    }
  }

  void _resume() {
    setState(() {
      _freeRetries = 0;
      _previewFailures = 0;
      _holdUntil = DateTime.fromMillisecondsSinceEpoch(0);
      _halted = false;
      _notice = null;
      _previewError = null;
      _armed = 0;
      _hint = null;
    });
    widget.onRetryRequested?.call();
    _readyAt = DateTime.now().add(_warmUp);
    _startPreview();
  }

  String _reasonText(AppLocalizations l10n, String? reason) {
    return switch (reason) {
      'qualityTooFar' || 'too-far' => l10n.faceQualityTooFar,
      'qualityTooClose' || 'too-close' => l10n.faceQualityTooClose,
      'qualityOffCentre' || 'off-centre' => l10n.faceQualityOffCentre,
      'qualityTooDark' || 'too-dark' => l10n.faceQualityTooDark,
      _ => l10n.faceQualityUnsure,
    };
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;

    final isBusy = widget.isSending || _isCapturing;
    final isGood =
        _hasPreview &&
        _hint == null &&
        !_halted &&
        widget.externalError == null;
    final notice = widget.externalError ?? _notice ?? _previewError;

    String statusText;
    if (isBusy) {
      statusText = widget.isSending
          ? l10n.mfaFaceChecking
          : l10n.mfaFaceBlinkNow;
    } else if (notice != null) {
      statusText = notice;
    } else if (_armed >= _armTicks - 1) {
      // One tick before the burst, so the time it takes to react lands inside
      // the ~1.9s the burst watches for a blink rather than before it.
      statusText = l10n.mfaFaceBlinkNow;
    } else if (_armed > 0) {
      statusText = l10n.localeName.startsWith('id')
          ? 'Mengambil dalam ${_armTicks - _armed}…'
          : 'Capturing in ${_armTicks - _armed}…';
    } else if (_hint != null) {
      statusText = _reasonText(l10n, _hint);
    } else if (_hasPreview) {
      statusText = l10n.localeName.startsWith('id')
          ? 'Tahan posisi'
          : 'Hold still';
    } else {
      statusText = l10n.mfaFaceSubtitle;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Camera View container centered with fixed 3:4 portrait aspect ratio
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 320, maxHeight: 420),
            child: AspectRatio(
              aspectRatio: 3 / 4,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(AppSpacing.lg),
                child: Container(
                  color: palette.field,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (_isCameraUnavailable)
                        Center(
                          child: Padding(
                            padding: const EdgeInsets.all(AppSpacing.lg),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  CupertinoIcons.camera,
                                  size: 44,
                                  color: palette.secondaryLabel,
                                ),
                                const SizedBox(height: AppSpacing.md),
                                Text(
                                  l10n.faceCameraDenied,
                                  textAlign: TextAlign.center,
                                  style: AppText.footnote.copyWith(
                                    color: palette.secondaryLabel,
                                  ),
                                ),
                                const SizedBox(height: AppSpacing.md),
                                AppButton(
                                  label: l10n.tryAgain,
                                  style: AppButtonStyle.plain,
                                  onPressed: _initCamera,
                                ),
                              ],
                            ),
                          ),
                        )
                      else if (_isInitialized && _controller != null) ...[
                        // Real, unmirrored camera preview
                        ClipRect(
                          child: OverflowBox(
                            alignment: Alignment.center,
                            child: FittedBox(
                              fit: BoxFit.cover,
                              child: SizedBox(
                                width: _controller!.value.previewSize != null
                                    ? _controller!.value.previewSize!.height
                                    : 300,
                                height: _controller!.value.previewSize != null
                                    ? _controller!.value.previewSize!.width
                                    : 400,
                                child: CameraPreview(_controller!),
                              ),
                            ),
                          ),
                        ),
                        // Circular face guide overlay: turns green when framing is good
                        CustomPaint(
                          painter: FaceGuidePainter(
                            isGood: isGood,
                            accentColor: palette.success.foreground,
                          ),
                        ),
                        // Big countdown badge in the center when armed (matching web)
                        if (_armed > 0 &&
                            !isBusy &&
                            !_halted &&
                            widget.externalError == null)
                          Center(
                            child: Container(
                              width: 80,
                              height: 80,
                              decoration: BoxDecoration(
                                color: CupertinoColors.black.withValues(
                                  alpha: 0.5,
                                ),
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: CupertinoColors.white.withValues(
                                    alpha: 0.9,
                                  ),
                                  width: 3,
                                ),
                              ),
                              alignment: Alignment.center,
                              child: Text(
                                '${_armTicks - _armed}',
                                style: const TextStyle(
                                  fontSize: 44,
                                  fontWeight: FontWeight.bold,
                                  color: CupertinoColors.white,
                                  shadows: [
                                    Shadow(
                                      blurRadius: 8,
                                      color: CupertinoColors.black,
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                      ] else
                        const Center(child: CupertinoActivityIndicator()),

                      // Bottom status banner matching web caption bar
                      Positioned(
                        left: 0,
                        right: 0,
                        bottom: 0,
                        child: Container(
                          color: const Color(0xB3000000),
                          padding: const EdgeInsets.symmetric(
                            horizontal: AppSpacing.md,
                            vertical: AppSpacing.sm,
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              if (isBusy) ...[
                                const CupertinoActivityIndicator(
                                  color: CupertinoColors.white,
                                  radius: 8,
                                ),
                                const SizedBox(width: AppSpacing.sm),
                              ],
                              Flexible(
                                child: Text(
                                  statusText,
                                  textAlign: TextAlign.center,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: AppText.footnote.copyWith(
                                    color: CupertinoColors.white,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),

        // Action button only when halted or after an error occurred
        if (_halted || widget.externalError != null) ...[
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            label: l10n.tryAgain,
            icon: CupertinoIcons.refresh,
            isBusy: isBusy,
            onPressed: _resume,
          ),
        ],
      ],
    );
  }
}
