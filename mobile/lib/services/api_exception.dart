/// What went wrong, independent of how it should read on screen.
///
/// The message alone was always English, so a bilingual app showed English
/// errors to an Indonesian preparator for the two cases that happen most in a lab
/// — a slow link and no link at all. The kind lets the UI pick the right string;
/// the message stays as a fallback for anywhere a translation is not available,
/// such as a failure reason stored with a queued scan.
enum ApiErrorKind {
  /// The request was sent but nothing came back in time.
  timeout,

  /// The server was never reached: no network, wrong address, host down.
  unreachable,

  /// The server answered and refused. [ApiException.message] is its own wording.
  server,

  /// The server answered, and the body meant nothing this app could use.
  ///
  /// Distinct from [server] because nothing was refused — the request may well
  /// have succeeded. It exists because the sign-in parser used to hard-cast its
  /// way through the body and threw a `TypeError` on a shape it had never been
  /// told about; a `TypeError` is not a `DioException`, so it escaped every catch
  /// on the way up and surfaced as "an unexpected error occurred".
  malformed,

  unknown,
}

class ApiException implements Exception {
  final String message;
  final int? statusCode;
  final ApiErrorKind kind;

  /// The server's machine-readable tag for this refusal, where it sends one.
  ///
  /// Two refusals can share a status code and mean opposite things — one worth
  /// retrying, one final. Matching on the message text would break the moment
  /// the wording changed, and the wording is already translated in places.
  final String? code;

  /// Whatever structured extras the server attached, unread and untyped.
  ///
  /// The face routes use it for a quality `reason`; the validator uses it for a
  /// flattened Zod error. Kept as `Object?` on purpose — a model for every
  /// possible shape would be a model of the server's internals.
  final Object? details;

  const ApiException(
    this.message, {
    this.statusCode,
    this.kind = ApiErrorKind.unknown,
    this.code,
    this.details,
  });

  bool get isNotFound => statusCode == 404;
  bool get isUnauthorized => statusCode == 401;

  /// Signed in, and refused on role. `/samples/scan` answers this for anyone
  /// but a PREPARATOR — which, since the role is re-read on every request, is
  /// what an account whose role changed mid-shift will start getting.
  bool get isForbidden => statusCode == 403;

  /// The sample moved between the server deciding and writing: two scans raced.
  /// Nothing is wrong with the scan itself, so it is worth sending again.
  bool get isRetryableConflict => code == 'STAGE_MOVED';

  /// The sample is already on the stage this scan asked for. For a queued scan
  /// that usually means the server saved it the first time and only the answer
  /// was lost to a timeout: done, not refused.
  bool get isAlreadyRecorded => code == 'STAGE_ALREADY_RECORDED';

  /// True when the server was never reached, so nothing was decided about the
  /// request and it is safe to queue and retry.
  bool get isOffline => statusCode == null;

  @override
  String toString() => message;
}
