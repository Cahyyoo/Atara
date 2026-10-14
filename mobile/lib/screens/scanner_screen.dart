import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../l10n/app_localizations.dart';
import '../services/scan_gate.dart';
import '../theme/app_theme.dart';
import '../widgets/ios/app_page.dart';
import '../widgets/ios/ios_button.dart';
import '../widgets/manual_code_dialog.dart';
import '../widgets/status_view.dart';
import 'sample_detail_screen.dart';
import 'update_status_screen.dart';

/// What a scanned code is opened for.
enum ScanMode {
  /// Record the sample's next stage: the scanner's everyday job.
  update,

  /// Only look: what the barcode says, its Sample ID and the parts of it, and
  /// the way to fill the Sample ID in when it has none.
  check,
}

class ScannerScreen extends StatefulWidget {
  const ScannerScreen({super.key, this.mode});

  /// Opens in this mode; null opens in whichever was used last.
  final ScanMode? mode;

  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> {
  /// The mode last chosen, for as long as the app runs: a preparator checking a
  /// rack of labels should not have to switch back on every reopen.
  static ScanMode _rememberedMode = ScanMode.update;

  late ScanMode _mode = widget.mode ?? _rememberedMode;

  final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
  );
  bool _isTorchOn = false;
  bool _hasHandledCode = false;

  /// The code most recently opened, kept so the camera does not reopen it the
  /// instant it restarts. Cleared when the preparator asks for it deliberately.
  String? _lastHandledCode;

  /// Set when the camera cannot start at all — almost always a refused
  /// permission. Without this the screen was simply black, with nothing said
  /// and nothing to do: the preparator could not tell a denied permission from a
  /// broken app.
  bool _cameraUnavailable = false;

  /// Stay on the camera after a stage is saved instead of closing.
  ///
  /// Off by default, because a single scan is still the common case and
  /// closing is the right answer there. On, for working through a rack.
  bool _continuous = false;

  /// How many stages have been recorded without leaving this screen, so the
  /// preparator can see progress without stopping to check Home.
  int _recorded = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _handleDetect(BarcodeCapture capture) async {
    final rawValue = capture.barcodes.firstOrNull?.rawValue;
    if (!shouldOpenScannedCode(
      rawValue: rawValue,
      isHandling: _hasHandledCode,
      lastHandledCode: _lastHandledCode,
    )) {
      return;
    }

    setState(() => _hasHandledCode = true);

    HapticFeedback.mediumImpact();
    SystemSound.play(SystemSoundType.click);

    await _openSample(rawValue!);
  }

  /// For the other half of the problem: the camera works, but the label does
  /// not — scuffed, muddy, torn — while its printed code is still readable.
  Future<void> _openManualEntry() async {
    if (_hasHandledCode) return;
    // Typing a code is explicit, so it is never blocked by the repeat guard.
    setState(() => _hasHandledCode = true);

    // Stopped for the same reason _openSample stops it, and this was the one
    // path that forgot. Leaving the feed running meant ML Kit analysing every
    // frame, the translucent nav bar blurring a texture that kept changing,
    // and the keyboard animation relaying the preview out -- all inside the
    // 300ms the dialog takes to arrive. That window was the whole complaint.
    await _controller.stop();
    if (!mounted) return;

    final code = await showManualCodeDialog(context);
    if (!mounted) return;

    if (code == null) {
      setState(() => _hasHandledCode = false);
      // Cancelled: back to a live scanner, the way returning from the update
      // screen does.
      unawaited(_controller.start());
      return;
    }

    await _openSample(code);
  }

  /// Shared by both routes in: pause the camera, hand the code over, and come
  /// back to a live scanner if the preparator did not complete the update.
  Future<void> _openSample(String sampleCode) async {
    _lastHandledCode = sampleCode;
    await _controller.stop();
    if (!mounted) return;

    final l10n = AppLocalizations.of(context)!;
    final result = await Navigator.of(context).push(
      CupertinoPageRoute(
        builder: (context) => _mode == ScanMode.check
            ? SampleDetailScreen(
                sampleCode: sampleCode,
                title: l10n.barcodeInfoTitle,
              )
            : UpdateStatusScreen(sampleCode: sampleCode),
      ),
    );

    if (!mounted) return;

    // Checking is looking, so it never closes the scanner: the next label is
    // the likely next thing. Only a recorded stage counts as done.
    final recorded = _mode == ScanMode.update && result == true;
    if (recorded && !_continuous) {
      Navigator.of(context).pop();
      return;
    }

    // Restart this controller rather than letting the screen close and a new
    // one be built. Closing meant a cold MobileScannerController — and a cold
    // camera session — for every single sample, which is what made working
    // through a rack feel like waiting.
    //
    // `_lastHandledCode` is deliberately left set: a different label is
    // accepted straight away, and the guard only blocks re-reading the one
    // just dealt with, which is still pointed at the lens.
    setState(() {
      _hasHandledCode = false;
      if (recorded) _recorded++;
    });
    await _controller.start();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    if (_cameraUnavailable) return _buildUnavailable(l10n);

    return CupertinoPageScaffold(
      backgroundColor: CupertinoColors.black,
      // The preview fills the screen and has nothing to move out of the
      // keyboard's way. Left on, every frame of the keyboard animation
      // re-measured the scaffold, which re-ran MobileScanner's LayoutBuilder
      // and refitted the camera texture.
      resizeToAvoidBottomInset: false,
      navigationBar: CupertinoNavigationBar(
        middle: Text(
          l10n.scanScreenTitle,
          style: AppText.headline.copyWith(color: CupertinoColors.white),
        ),
        // Translucent over the feed rather than a solid bar: the camera
        // should reach the top of the screen, which is what makes this read
        // as a capture surface instead of a page with a picture on it.
        //
        // The blur is off, though. CupertinoNavigationBar inserts a real
        // BackdropFilter the moment this colour is translucent, and a
        // backdrop blur forces a read-back of everything painted beneath it
        // -- here, a live camera texture, every frame, for as long as this
        // screen is open. AppPage carries the same warning; this is the one
        // place it had not been applied, and the one place it mattered most.
        // Over a moving camera feed the blur was never legible as blur.
        backgroundColor: CupertinoColors.black.withValues(alpha: 0.35),
        enableBackgroundFilterBlur: false,
        border: null,
        leading: NavBarAction(
          label: l10n.cancel,
          onPressed: () => Navigator.of(context).pop(),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _CameraAction(
              icon: _isTorchOn
                  ? CupertinoIcons.bolt_fill
                  : CupertinoIcons.bolt_slash,
              onPressed: () {
                _controller.toggleTorch();
                setState(() => _isTorchOn = !_isTorchOn);
              },
            ),
            _CameraAction(
              icon: CupertinoIcons.camera_rotate,
              onPressed: () => _controller.switchCamera(),
            ),
          ],
        ),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: _handleDetect,
            errorBuilder: (context, error) {
              // Reported during build, so the flag is set after this frame.
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (mounted && !_cameraUnavailable) {
                  setState(() => _cameraUnavailable = true);
                }
              });
              return const ColoredBox(color: CupertinoColors.black);
            },
          ),
          const Center(child: _Viewfinder()),
          Positioned(
            left: AppSpacing.xl,
            right: AppSpacing.xl,
            bottom: AppSpacing.xxl,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _ModeSwitch(
                  mode: _mode,
                  onChanged: (mode) => setState(() {
                    _mode = mode;
                    _rememberedMode = mode;
                  }),
                ),
                const SizedBox(height: AppSpacing.md),
                // Says why the same label is being ignored, and offers the way
                // past it — otherwise the guard would look like the scanner had
                // frozen.
                if (_lastHandledCode == null)
                  _ScannerHint(text: l10n.scanHint)
                else ...[
                  _ScannerHint(text: l10n.sameLabelIgnored),
                  const SizedBox(height: AppSpacing.md),
                  _OverlayButton(
                    label: l10n.scanThisAgain,
                    icon: CupertinoIcons.qrcode_viewfinder,
                    onPressed: () => setState(() => _lastHandledCode = null),
                  ),
                ],
                const SizedBox(height: AppSpacing.md),
                // A Wrap, not a Row. These two buttons need about 379px of
                // the 312 available on a 360dp phone, and neither could shrink
                // — so this overflowed the moment the second one was added, and
                // shipped as yellow-and-black stripes over the camera feed. The
                // labels are longest in the state the preparator sees first.
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: [
                    _OverlayButton(
                      label: l10n.manualEntry,
                      icon: CupertinoIcons.keyboard,
                      onPressed: _openManualEntry,
                    ),
                    if (_mode == ScanMode.update)
                      _OverlayButton(
                        label: _continuous && _recorded > 0
                            ? l10n.continuousRecorded(_recorded)
                            : l10n.continuousMode,
                        icon: _continuous
                            ? CupertinoIcons.checkmark_circle_fill
                            : CupertinoIcons.square_stack_3d_down_right,
                        isOn: _continuous,
                        onPressed: () => setState(() {
                          _continuous = !_continuous;
                          if (!_continuous) _recorded = 0;
                        }),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// No camera, but the preparator is still standing in front of a sample — so
  /// the way in by hand is offered rather than leaving them stuck.
  Widget _buildUnavailable(AppLocalizations l10n) {
    return AppModalPage(
      title: l10n.scanTitle,
      leading: NavBarAction(
        label: l10n.cancel,
        onPressed: () => Navigator.of(context).pop(),
      ),
      child: StatusView(
        icon: CupertinoIcons.camera,
        tone: context.palette.warning,
        title: l10n.cameraBlockedTitle,
        message: l10n.cameraBlockedBody,
        action: AppButton(
          label: l10n.manualEntry,
          icon: CupertinoIcons.keyboard,
          onPressed: () async {
            final code = await showManualCodeDialog(context);
            if (code == null || !mounted) return;
            await _openSample(code);
          },
        ),
      ),
    );
  }
}

/// Update Stage | Check Barcode, over the camera feed.
class _ModeSwitch extends StatelessWidget {
  const _ModeSwitch({required this.mode, required this.onChanged});

  final ScanMode mode;
  final ValueChanged<ScanMode> onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    Widget segment(String label) => Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.sm,
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: AppText.subhead.copyWith(
          color: CupertinoColors.white,
          fontWeight: FontWeight.w600,
        ),
      ),
    );

    return CupertinoSlidingSegmentedControl<ScanMode>(
      groupValue: mode,
      backgroundColor: CupertinoColors.black.withValues(alpha: 0.55),
      thumbColor: context.palette.accent,
      onValueChanged: (value) {
        if (value != null) onChanged(value);
      },
      children: {
        ScanMode.update: segment(l10n.scanModeUpdate),
        ScanMode.check: segment(l10n.scanModeCheck),
      },
    );
  }
}

/// A bar button drawn white, since it sits over the camera feed rather than a
/// page and the system accent would disappear against it.
class _CameraAction extends StatelessWidget {
  const _CameraAction({required this.icon, required this.onPressed});

  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return CupertinoButton(
      padding: EdgeInsets.zero,
      minimumSize: const Size(40, 40),
      onPressed: onPressed,
      child: Icon(icon, size: 22, color: CupertinoColors.white),
    );
  }
}

/// The target area, drawn as four corner brackets rather than a closed square.
///
/// The square read as a frame the label had to fit inside, which made preparators
/// back away from small labels until the code was too small to decode. Brackets
/// say "aim here" without implying a size.
class _Viewfinder extends StatelessWidget {
  const _Viewfinder();

  static const double _size = 250;
  static const double _arm = 34;
  static const double _thickness = 4;

  @override
  Widget build(BuildContext context) {
    return const SizedBox(
      width: _size,
      height: _size,
      child: Stack(
        children: [
          Align(
            alignment: Alignment.topLeft,
            child: _Corner(top: true, left: true),
          ),
          Align(
            alignment: Alignment.topRight,
            child: _Corner(top: true, left: false),
          ),
          Align(
            alignment: Alignment.bottomLeft,
            child: _Corner(top: false, left: true),
          ),
          Align(
            alignment: Alignment.bottomRight,
            child: _Corner(top: false, left: false),
          ),
        ],
      ),
    );
  }
}

class _Corner extends StatelessWidget {
  const _Corner({required this.top, required this.left});

  final bool top;
  final bool left;

  @override
  Widget build(BuildContext context) {
    const side = BorderSide(
      color: CupertinoColors.white,
      width: _Viewfinder._thickness,
    );
    const radius = Radius.circular(AppRadius.sm);

    return Container(
      width: _Viewfinder._arm,
      height: _Viewfinder._arm,
      decoration: BoxDecoration(
        border: Border(
          top: top ? side : BorderSide.none,
          bottom: top ? BorderSide.none : side,
          left: left ? side : BorderSide.none,
          right: left ? BorderSide.none : side,
        ),
        borderRadius: BorderRadius.only(
          topLeft: top && left ? radius : Radius.zero,
          topRight: top && !left ? radius : Radius.zero,
          bottomLeft: !top && left ? radius : Radius.zero,
          bottomRight: !top && !left ? radius : Radius.zero,
        ),
      ),
    );
  }
}

/// A line of guidance over the camera feed.
///
/// A drop shadow alone was not enough: pointed at a white label under lab
/// lighting the text washed out entirely. The scrim gives it a surface of its
/// own, so it stays readable whatever the camera happens to be looking at.
class _ScannerHint extends StatelessWidget {
  const _ScannerHint({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.md,
      ),
      decoration: BoxDecoration(
        color: CupertinoColors.black.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(AppRadius.xl),
      ),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: AppText.subhead.copyWith(color: CupertinoColors.white),
      ),
    );
  }
}

/// A capsule button on the camera overlay, in the frosted style iOS uses for
/// controls that sit over content.
class _OverlayButton extends StatelessWidget {
  const _OverlayButton({
    required this.label,
    required this.icon,
    required this.onPressed,
    this.isOn = false,
  });

  final String label;
  final IconData icon;
  final VoidCallback onPressed;

  /// Fills the capsule, for a control that is a state rather than an action.
  final bool isOn;

  @override
  Widget build(BuildContext context) {
    return CupertinoButton(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.sm,
      ),
      borderRadius: BorderRadius.circular(AppRadius.xl),
      color: isOn
          ? context.palette.accent
          : CupertinoColors.white.withValues(alpha: 0.18),
      minimumSize: const Size(0, 44),
      onPressed: onPressed,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 18, color: CupertinoColors.white),
          const SizedBox(width: AppSpacing.sm),
          // Bounded so a long label shortens this capsule rather than
          // widening it past the screen.
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppText.subhead.copyWith(
                color: CupertinoColors.white,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
