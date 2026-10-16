/// Builds the Sample ID the lab writes on the sheet, e.g.
///
///     MOL LIM TP 3/A4/42/919.3/12
///
/// A line-for-line port of `composeSampleIdent` on the server
/// (web/src/modules/lab/lib/samples/sample-ident.ts), so the identity form can
/// show what will be saved while it is being filled in. The server composes it
/// again on save and its answer is the one stored; the two are kept to the same
/// rule by test/sample_ident_test.dart, which mirrors the server's cases.
///
/// The leading group -- place, ore class, non-production code, sir -- is
/// written with spaces; everything from the pit onwards with "/". Only the
/// place is required; any other part that is not known is left out.
String? composeSampleIdent({
  String? place,
  String? rockType,
  String? nonProd,
  String? sir,
  String? pit,
  String? bargingNo,
  int? sequenceNo,
  int? sampleNo,
  int? sackCount,
}) {
  final placeText = _text(place);
  if (placeText == null) return null;

  final sirText = _text(sir);
  final pitText = _text(pit);
  // Free text on the form, so the one part that could carry a separator of its
  // own. Neither a space nor a slash survives into the id.
  final barging = _text(bargingNo)
      ?.replaceFirst(RegExp(r'^B\.?', caseSensitive: false), '')
      .replaceAll(RegExp(r'[\s/]+'), '');
  final bargingText = (barging == null || barging.isEmpty) ? null : barging;

  // 0 is a real number here; only null drops out.
  final running = sequenceNo != null && sampleNo != null
      ? '$sequenceNo.$sampleNo'
      : (sequenceNo ?? sampleNo)?.toString();

  // The sir, the pit and the barging run are written as their codes alone, as
  // the server writes them now; ids stored before keep their old "S"/"P"/"B".
  final group = [
    placeText,
    _text(rockType),
    _text(nonProd),
    sirText,
  ].whereType<String>().join(' ');

  final tail = [
    pitText,
    bargingText,
    running,
    sackCount?.toString(),
  ].whereType<String>();

  return [group, ...tail].join('/');
}

String? _text(String? value) {
  final trimmed = value?.trim();
  return (trimmed == null || trimmed.isEmpty) ? null : trimmed.toUpperCase();
}
