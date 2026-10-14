import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/login_result.dart';
import '../models/user_model.dart';
import '../services/api_service.dart';
import '../services/session_service.dart';
import '../services/work_summary_cache_service.dart';

class SessionNotifier extends StateNotifier<AsyncValue<UserModel?>> {
  SessionNotifier({
    this.onSignedOut,
    this.logoutWait = const Duration(seconds: 3),
  }) : super(const AsyncValue.loading()) {
    // A token the server no longer accepts should drop the operator back to the
    // sign-in screen rather than leaving them stuck on a screen that only errors.
    ApiService.instance.onUnauthorized = (notice) {
      if (!mounted) return;
      // The reason goes out before the state flips, so the sign-in screen that
      // flip puts up is built with its notice already there.
      if (notice != null) onSignedOut?.call(notice);
      state = const AsyncValue.data(null);
    };
    // The session is good, but the server will not serve it until the
    // password is replaced. Re-read the stored user so the gate sees it.
    ApiService.instance.onPasswordChangeRequired = () async {
      if (!mounted) return;
      final user = await SessionService.getUser();
      if (mounted && user != null) state = AsyncValue.data(user);
    };
    _restore();
  }

  /// Hands on why the session ended, when the operator did not end it. The
  /// provider wires it to [signedOutNoticeProvider]; this class has no `ref`.
  final void Function(SignedOutNotice notice)? onSignedOut;

  /// How long signing out waits for the server before carrying on regardless.
  final Duration logoutWait;

  Future<void> _restore() async {
    // A throw here used to leave the state on `loading` for ever, and AuthGate
    // holds a spinner for exactly that state — the app would never get past its
    // opening frame. An error routes to the sign-in screen instead, which is
    // somewhere the operator can act.
    try {
      var user = await SessionService.getUser();
      // A session saved by an older build, when administrators could use the
      // app too. It is a real, unexpired token — which is exactly why it cannot
      // be kept: it would open Home for an account the sign-in now turns away.
      if (user != null && user.role != UserRole.preparator) {
        await SessionService.clearSession();
        user = null;
      }
      state = AsyncValue.data(user);
    } catch (error, stackTrace) {
      state = AsyncValue.error(error, stackTrace);
    }
  }

  /// The password is the operator's own now, so the gate may let them past.
  ///
  /// Stored before the state flips: [AuthGate] reads the user it is handed,
  /// and a flip over a user still carrying the duty would bounce straight
  /// back to the change screen.
  Future<void> markPasswordChanged() async {
    await SessionService.setMustChangePassword(false);
    final user = await SessionService.getUser();
    if (mounted && user != null) state = AsyncValue.data(user);
  }

  /// Offers a password and hands back what the server decided.
  ///
  /// It returns a [LoginResult] rather than nothing, because a correct password
  /// no longer always means a session: an account with a second factor gets a
  /// challenge instead, and the caller is the only thing that can put a screen
  /// in front of it. When a session DID come back it is adopted here before
  /// returning, so a caller that ignores the result still ends up signed in —
  /// or, for any role but PREPARATOR, throws [PreparatorOnlyException] instead.
  Future<LoginResult> login(String email, String password) async {
    final result = await ApiService.instance.login(
      email: email,
      password: password,
    );
    if (result is LoginSession) await _adopt(result);
    return result;
  }

  /// Answers a second-factor challenge with an authenticator code.
  Future<LoginResult> verifyTotp({
    required String challenge,
    required String code,
  }) async {
    final result = await ApiService.instance.verifyTotp(
      challenge: challenge,
      code: code,
    );
    if (result is LoginSession) await _adopt(result);
    return result;
  }

  /// Answers a second-factor challenge with a burst of face images.
  Future<LoginResult> verifyFace({
    required String challenge,
    required List<String> frames,
    int? videoWidth,
    int? videoHeight,
  }) async {
    final result = await ApiService.instance.verifyFace(
      challenge: challenge,
      frames: frames,
      videoWidth: videoWidth,
      videoHeight: videoHeight,
    );
    if (result is LoginSession) await _adopt(result);
    return result;
  }

  /// Begins an authenticator enrolment. Carries no session of its own.
  Future<TotpSetup> startTotpSetup({required String challenge}) =>
      ApiService.instance.startTotpSetup(challenge: challenge);

  /// The three things that have to happen together when a session arrives.
  ///
  /// They used to happen in two files — the write inside `ApiService.login`, the
  /// cache clear and the state flip out here — which meant no single place was
  /// responsible for a session existing. Now there is one, and every door into
  /// the app goes through it.
  ///
  /// Which also makes it the one place to turn away an account this app is not
  /// for. The password and any second factor were genuinely accepted, so the
  /// server has already issued a token; it is dropped here unsaved, and nothing
  /// on the device changes. Checked last, not first, because a face or code
  /// sign-in only learns the role once the whole exchange is over.
  Future<void> _adopt(LoginSession session) async {
    if (session.user.role != UserRole.preparator) {
      throw const PreparatorOnlyException();
    }
    await SessionService.saveSession(session.token, session.user);
    await WorkSummaryCacheService.clear();
    if (mounted) state = AsyncValue.data(session.user);
  }

  /// Signs out here, and tells the server so the account's phone slot is free.
  ///
  /// The server call is a courtesy, never a gate. It goes first because it
  /// needs the token that the local sign-out deletes, but it gets [logoutWait]
  /// and no more: an operator at a rack with no signal must still be able to
  /// hand the phone over. A slot left held is not lost — the next phone to sign
  /// in simply takes it.
  Future<void> logout() async {
    try {
      final token = await SessionService.getToken();
      if (token != null) {
        await ApiService.instance.logout(token: token).timeout(logoutWait);
      }
    } catch (_) {
      // Offline, refused, too slow: all the same here. See above.
    }
    await SessionService.clearSession();
    if (mounted) state = const AsyncValue.data(null);
  }
}

final sessionProvider =
    StateNotifierProvider<SessionNotifier, AsyncValue<UserModel?>>(
      (ref) => SessionNotifier(
        onSignedOut: (notice) =>
            ref.read(signedOutNoticeProvider.notifier).state = notice,
      ),
    );

/// Why the last session ended, when the operator did not end it themselves:
/// another phone took the account, or somebody on the website ended it.
///
/// Set on the way out by [SessionNotifier] and read by the sign-in screen,
/// which clears it once the operator tries again. Null for every other
/// sign-out, which the operator either did themselves or needs no story for.
final signedOutNoticeProvider = StateProvider<SignedOutNotice?>((ref) => null);

/// The question the heartbeat asks. A provider only so a test can answer it
/// without a server; the app never overrides it.
final sessionCheckProvider = Provider<Future<void> Function()>(
  (ref) => ApiService.instance.checkSession,
);
