/// Whether a code the camera just read should be opened.
///
/// Pulled out of the scanner widget so the rule can be proved without a camera.
/// It exists because of a loop that was easy to fall into and impossible to
/// escape: opening a sample that could not be shown — not registered, no
/// network, or simply the back button — returns to a scanner still pointed at
/// that very label, which reopened it at once, over and over.
///
/// `DetectionSpeed.noDuplicates` does not cover that case: the scanner is
/// stopped and restarted around the trip, which clears the controller's own
/// memory of what it has seen, so the same code arrives as if it were new.
bool shouldOpenScannedCode({
  required String? rawValue,
  required bool isHandling,
  required String? lastHandledCode,
}) {
  // A trip is already under way.
  if (isHandling) return false;

  // Nothing readable in the frame.
  if (rawValue == null || rawValue.isEmpty) return false;

  // The label we just came back from. Pointing at a different one works
  // immediately; reopening this one takes a deliberate tap that clears
  // `lastHandledCode`.
  if (rawValue == lastHandledCode) return false;

  return true;
}
