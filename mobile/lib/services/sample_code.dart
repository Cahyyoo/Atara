/// Tidies a sample code a preparator typed by hand.
///
/// Codes have the fixed shape `SMPL-<year>-<5 digits>`, and typing one on a
/// phone — in gloves, in a dusty room, off a label that may be scuffed — goes
/// wrong in predictable ways. Each of those is corrected here so the preparator
/// is not bounced to a "not registered" screen over a missing hyphen.
///
/// `NKL` is accepted just as readily. It is the prefix this app used to issue,
/// and those labels are stuck to containers already out in the field; refusing
/// to tidy them would leave the preparator unable to type in a code they can
/// plainly read off the bucket in front of them.
///
/// Every correction is deterministic. Nothing is guessed: a year is never
/// invented, so a bare sequence number is left exactly as typed and the server
/// gets to answer.
String normaliseSampleCode(String input) {
  // Whitespace anywhere, and lower case: " smpl - 2026 - 31 " is one gloved
  // thumb away from the real thing.
  final compact = input.replaceAll(RegExp(r'\s+'), '').toUpperCase();
  if (compact.isEmpty) return '';

  // Hyphens are buried behind a keyboard switch on most phones, so accept a
  // code typed straight through: SMPL202600031.
  final unhyphenated = RegExp(r'^(SMPL|NKL)(\d{4})(\d{5})$').firstMatch(compact);
  if (unhyphenated != null) {
    return '${unhyphenated.group(1)}-${unhyphenated.group(2)}-${unhyphenated.group(3)}';
  }

  // Preparators read the tail of the code off the label and skip the leading
  // zeroes: SMPL-2026-31 means SMPL-2026-00031.
  final short = RegExp(r'^(SMPL|NKL)-(\d{4})-(\d{1,5})$').firstMatch(compact);
  if (short != null) {
    return '${short.group(1)}-${short.group(2)}-${short.group(3)!.padLeft(5, '0')}';
  }

  // Anything else is passed through untouched. Guessing at a shape we do not
  // recognise would turn a typo into a different sample's code.
  return compact;
}
