import 'dart:math' as math;

/// Where the scanner's "Check Barcode" mode puts its answer and its frame.
///
/// The two are one group: the answer card sits just above the frame it is
/// about, and the pair is centred in the space between the navigation bar and
/// the controls at the bottom. A slot of fixed height is kept for the card
/// whether or not there is an answer yet, so the frame never moves when one
/// arrives, changes or is dismissed.
class CheckModeGeometry {
  const CheckModeGeometry({
    required this.slotTop,
    required this.slotHeight,
    required this.frameTop,
    required this.frameSize,
  });

  /// The answer card's slot; the card sits at the slot's foot, against the frame.
  final double slotTop;
  final double slotHeight;

  /// The aiming frame, a square.
  final double frameTop;
  final double frameSize;

  double get frameBottom => frameTop + frameSize;
}

/// The tallest the answer card gets: a Sample ID with its labels, on a phone.
const double kCheckSlotHeight = 174;

/// Between the card and the frame.
const double kCheckGap = 16;

/// What the controls at the bottom take in check mode: the mode switch, the
/// manual-entry button and the margin under them.
const double kCheckControlsReserve = 140;

/// Under the navigation bar, before anything is drawn.
const double kCheckTopMargin = 12;

const double _maxFrame = 200;
const double _minFrame = 150;

/// The group's layout for a screen [height] tall whose bar ends at [topInset].
///
/// On a short phone the frame gives way first, down to [_minFrame]; past that
/// the slot shrinks and the card is scaled to fit it rather than cut.
CheckModeGeometry checkModeGeometry({
  required double height,
  required double topInset,
}) {
  final top = topInset + kCheckTopMargin;
  final space = math.max(0.0, height - kCheckControlsReserve - top);

  var frame = _maxFrame;
  if (space < kCheckSlotHeight + kCheckGap + frame) {
    frame = math.max(_minFrame, space - kCheckSlotHeight - kCheckGap);
  }
  final slot = math.max(
    0.0,
    math.min(kCheckSlotHeight, space - kCheckGap - frame),
  );
  final group = slot + kCheckGap + frame;
  final groupTop = top + math.max(0.0, (space - group) / 2);

  return CheckModeGeometry(
    slotTop: groupTop,
    slotHeight: slot,
    frameTop: groupTop + slot + kCheckGap,
    frameSize: frame,
  );
}
