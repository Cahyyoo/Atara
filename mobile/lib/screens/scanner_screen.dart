import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../l10n/app_localizations.dart';
import '../services/barcode_check.dart';
import '../services/scan_gate.dart';
import '../theme/app_theme.dart';
import '../widgets/ios/app_page.dart';
import '../widgets/ios/ios_button.dart';
import '../widgets/check_mode_geometry.dart';
import '../widgets/manual_code_dialog.dart';
import '../widgets/scan_check_pill.dart';
import '../widgets/status_view.dart';
import 'update_status_screen.dart';

/// What a scanned code is for.
enum ScanMode {
  /// Open the sample's page and record its next stage.
  update,

  /// Only say whether the barcode has a Sample ID, over the camera, without
  /// leaving it: a rack is checked by sweeping the phone along it.
  check,
}

class ScannerScreen extends StatefulWidget {
  const ScannerScreen({super.key});

  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> {
  /// The mode last chosen, for as long as the app runs: checking a rack of
  /// labels should not need switching back on every reopen.
  static ScanMode _rememberedMode = ScanMode.update;

  ScanMode _mode = _rememberedMode;

  /// What the pill says, in check mode: the last barcode seen and its answer.
  BarcodeCheck? _check;

  /// Answers already given while the scanner is open, so sweeping back over a
  /// label answers at once instead of asking the server again.
  final Map<String, BarcodeCheck> _checked = {};

  /// Which lookup is the latest: a slow answer for a label already swept past
  /// must not replace the one now in front of the lens.
  int _checkSeq = 0;

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
    if (_mode == ScanMode.check) {
      if (rawValue != null && rawValue.isNotEmpty) await _showCheck(rawValue);
      return;
    }
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

  /// Answers a barcode in the pill, without leaving the camera.
  Future<void> _showCheck(String code) async {
    if (_check?.code == code) return;
    HapticFeedback.selectionClick();

    final known = _checked[code];
    final mine = ++_checkSeq;
    setState(() => _check = known ?? BarcodeCheck.checking(code));
    if (known != null) return;

    final answer = await checkBarcode(code);
    if (!mounted || mine != _checkSeq) return;
    // An offline answer is not kept: the next sweep should ask again.
    if (answer.state != BarcodeCheckState.offline) _checked[code] = answer;
    setState(() => _check = answer);
  }

  /// The pill, tapped: the sample's page, then back to a live camera, with the
  /// answer for that label asked again — the Sample ID may have been filled in.
  Future<void> _openChecked() async {
    final code = _check?.code;
    if (code == null) return;
    await _controller.stop();
    if (!mounted) return;
    await Navigator.of(context).push(
      CupertinoPageRoute(
        builder: (context) => UpdateStatusScreen(sampleCode: code),
      ),
    );
    if (!mounted) return;
    _checked.remove(code);
    setState(() => _check = null);
    unawaited(_showCheck(code));
    await _controller.start();
  }

  void _setMode(ScanMode mode) {
    setState(() {
      _mode = mode;
      _rememberedMode = mode;
      _check = null;
    });
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

    if (code == null || _mode == ScanMode.check) {
      setState(() => _hasHandledCode = false);
      // Cancelled, or only checked: back to a live scanner, the way returning
      // from the update screen does.
      unawaited(_controller.start());
      if (code != null) {
        setState(() => _check = null);
        await _showCheck(code);
      }
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

    final result = await Navigator.of(context).push(
      CupertinoPageRoute(
        builder: (context) => UpdateStatusScreen(sampleCode: sampleCode),
      ),
    );

    if (!mounted) return;

    // Going back without saving is how a label is only looked at, so it never
    // closes the scanner: the next label is the likely next thing. Only a
    // recorded stage counts as done.
    final recorded = result == true;
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
          // Check mode: the answer and the frame as one group, centred.
          // Update mode: the frame alone, in the middle, as always.
          if (_mode == ScanMode.check)
            Positioned.fill(child: _buildCheckLayout(l10n))
          else
            const Center(child: _Viewfinder()),
          Positioned(
            left: AppSpacing.xl,
            right: AppSpacing.xl,
            bottom: AppSpacing.xxl,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _ModeSwitch(mode: _mode, onChanged: _setMode),
                const SizedBox(height: AppSpacing.md),
                // In check mode the hint sits where the answer will appear,
                // above the frame (_buildCheckLayout), not down here.
                if (_mode == ScanMode.check)
                  const SizedBox.shrink()
                // Says why the same label is being ignored, and offers the way
                // past it — otherwise the guard would look like the scanner had
                // frozen.
                else if (_lastHandledCode == null)
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

  /// The answer card just above the frame, the pair centred between the bar
  /// and the controls (see checkModeGeometry). The card's slot is kept whether
  /// or not there is an answer — the hint stands in it until there is — so
  /// the frame stays put while answers come and go.
  Widget _buildCheckLayout(AppLocalizations l10n) {
    final topInset = MediaQuery.paddingOf(context).top;
    final animate = !MediaQuery.disableAnimationsOf(context);

    return LayoutBuilder(
      builder: (context, constraints) {
        final geometry = checkModeGeometry(
          height: constraints.maxHeight,
          topInset: topInset,
        );
        final width = constraints.maxWidth - AppSpacing.xl * 2;
        final check = _check;

        return Stack(
          children: [
            Positioned(
              top: geometry.slotTop,
              left: AppSpacing.xl,
              right: AppSpacing.xl,
              height: geometry.slotHeight,
              // Scaled down, never cut, on a phone too short for the slot.
              child: FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.bottomCenter,
                child: SizedBox(
                  width: width,
                  child: AnimatedSwitcher(
                    duration: animate
                        ? const Duration(milliseconds: 200)
                        : Duration.zero,
                    layoutBuilder: (current, previous) => Stack(
                      alignment: Alignment.bottomCenter,
                      children: [...previous, ?current],
                    ),
                    transitionBuilder: (child, animation) => FadeTransition(
                      opacity: animation,
                      child: SlideTransition(
                        position: Tween(
                          begin: const Offset(0, 0.06),
                          end: Offset.zero,
                        ).animate(animation),
                        child: child,
                      ),
                    ),
                    child: check == null
                        ? _ScannerHint(
                            key: const ValueKey('hint'),
                            text: l10n.scanHint,
                          )
                        : ScanCheckPill(
                            key: ValueKey('${check.code}|${check.state}'),
                            check: check,
                            onOpen: _openChecked,
                            onDismiss: () => setState(() => _check = null),
                          ),
                  ),
                ),
              ),
            ),
            Positioned(
              top: geometry.frameTop,
              left: 0,
              right: 0,
              child: Center(child: _Viewfinder(size: geometry.frameSize)),
            ),
          ],
        );
      },
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
  const _Viewfinder({this.size = 250});

  /// Smaller in check mode, where the answer card takes the top of the screen.
  final double size;

  static const double _arm = 34;
  static const double _thickness = 4;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: const Stack(
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
  const _ScannerHint({super.key, required this.text});

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
