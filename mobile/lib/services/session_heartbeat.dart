import 'dart:async';

/// Asks the server, every so often, whether this phone still holds the account.
///
/// An account is open on one phone at a time, and the phone that loses it has
/// to find out. The server cannot push, so this asks: on every return to the
/// foreground and every [interval] while the app is in front and signed in.
/// Without it the old phone would learn only on its next scan — possibly an
/// hour later, and as a scan that failed rather than as a sign-out.
///
/// It does nothing with the answer. A replaced session comes back 401
/// `session-replaced`, and the Dio interceptor that already handles every 401
/// signs the phone out and carries the reason to the sign-in screen. Any other
/// failure — above all no network — is swallowed: a phone that is offline has
/// not been signed out, and must not act as if it had.
///
/// Plain Dart with its two inputs set from outside, so the timing rules can be
/// tested without a lifecycle or a server; see SessionHeartbeatScope.
class SessionHeartbeat {
  SessionHeartbeat({
    required this.check,
    this.interval = const Duration(seconds: 30),
  });

  final Future<void> Function() check;
  final Duration interval;

  Timer? _timer;
  bool _foreground = true;
  bool _signedIn = false;
  bool _inFlight = false;

  /// True while the periodic check is scheduled.
  bool get isRunning => _timer != null;

  set foreground(bool value) {
    _foreground = value;
    _reconcile();
  }

  set signedIn(bool value) {
    _signedIn = value;
    _reconcile();
  }

  /// Asks once, now, unless there is no one to ask about or a question is
  /// already out. One at a time: on a slow link a thirty-second tick can come
  /// round before the last answer, and stacking requests helps nobody.
  Future<void> checkNow() async {
    if (!_signedIn || !_foreground || _inFlight) return;
    _inFlight = true;
    try {
      await check();
    } catch (_) {
      // See the class comment: only a 401 means anything, and the interceptor
      // has already acted on it by the time it arrives here as an exception.
    } finally {
      _inFlight = false;
    }
  }

  void dispose() {
    _timer?.cancel();
    _timer = null;
  }

  void _reconcile() {
    final shouldRun = _foreground && _signedIn;
    if (shouldRun && _timer == null) {
      _timer = Timer.periodic(interval, (_) => checkNow());
    } else if (!shouldRun) {
      dispose();
    }
  }
}
