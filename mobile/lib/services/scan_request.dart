/// The body of a stage-update request, built in one place.
///
/// Extracted so the one rule below cannot be applied on some paths and forgotten
/// on others — the same reason `scan_gate.dart` exists. Two callers reach the
/// scan endpoint: the update screen when the preparator is online, and the queue
/// drain when a scan recorded offline finally goes out. A fix made only in the
/// screen would leak straight back through every queued correction.
///
/// **The rule: a correction does not carry field notes.** The server writes
/// `notes = reason` whenever it treats a scan as a correction — a preparator
/// sending `force` — so anything typed in Field Notes is discarded on its way
/// into the database, with nothing said about it. It used to be sent anyway, so
/// the preparator watched their words vanish. Now they are not sent, and the screen
/// says which field the server keeps.
///
/// Merging the two was considered and rejected: `reason` is the audit sentence an
/// administrator reads back in the sample's history, and quietly appending
/// unrelated field notes to it degrades the one field that exists to explain why
/// the workflow was broken. The better fix is server-side — stop overloading one
/// column for two meanings — and that is a migration, a web change and a large
/// test suite away. This is complete and correct in the meantime.
Map<String, dynamic> scanUpdateBody({
  required String sampleCode,
  required String stageId,
  String? notes,
  bool force = false,
  String? reason,
}) {
  final trimmedReason = reason?.trim();
  final isCorrection =
      force && trimmedReason != null && trimmedReason.isNotEmpty;
  final trimmedNotes = notes?.trim();

  return {
    'sample_code': sampleCode,
    'stage_id': stageId,
    if (!isCorrection && trimmedNotes != null && trimmedNotes.isNotEmpty)
      'notes': trimmedNotes,
    if (force) 'force': true,
    if (isCorrection) 'reason': trimmedReason,
  };
}
