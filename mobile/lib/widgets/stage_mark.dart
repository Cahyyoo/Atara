import 'package:flutter/cupertino.dart';

import '../theme/app_theme.dart';
import 'brand/illustration.dart';

/// Where a scan stands, as the badge in the corner of a [StageMark].
enum ScanMark {
  done(CupertinoIcons.checkmark_alt),
  correction(CupertinoIcons.arrow_uturn_left),
  waiting(CupertinoIcons.clock_solid),
  failed(CupertinoIcons.exclamationmark);

  const ScanMark(this.icon);

  final IconData icon;

  ToneColors tone(AppColors palette) => switch (this) {
    ScanMark.done => palette.success,
    ScanMark.correction => palette.warning,
    ScanMark.waiting => palette.info,
    ScanMark.failed => palette.danger,
  };
}

/// A list row's leading mark: the stage's picture, as on Home, with a small
/// badge saying what happened to the scan.
///
/// The picture answers "which stage" at a glance and the badge "did it go
/// through", so neither has to be read off the text beside it.
class StageMark extends StatelessWidget {
  const StageMark({super.key, required this.stageKey, required this.mark});

  final String? stageKey;
  final ScanMark mark;

  static const double size = 42;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return ExcludeSemantics(
      child: SizedBox(
        width: size,
        height: size,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Container(
              width: size,
              height: size,
              padding: const EdgeInsets.all(3),
              decoration: BoxDecoration(
                color: palette.blob.withValues(alpha: context.isDark ? 1 : 0.7),
                borderRadius: BorderRadius.circular(AppRadius.md - 2),
              ),
              child: Illustration(Art.forStage(stageKey)),
            ),
            Positioned(
              right: -4,
              bottom: -4,
              child: Container(
                width: 18,
                height: 18,
                decoration: BoxDecoration(
                  color: mark.tone(palette).foreground,
                  shape: BoxShape.circle,
                  // A ring of the card behind it, so the badge reads as
                  // sitting on the picture rather than bleeding into it.
                  border: Border.all(color: palette.cardBackground, width: 2),
                ),
                child: Icon(mark.icon, size: 10, color: const Color(0xFFFFFFFF)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
