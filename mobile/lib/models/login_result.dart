import '../services/api_exception.dart';
import 'user_model.dart';

/// A second factor the server is willing to accept.
///
/// The wire vocabulary is fixed by the server (`web/src/lib/second-factor.ts`).
/// An unrecognised string parses to null rather than throwing, and the caller
/// drops it — see [LoginSecondFactor.hasUnsupportedMethods] for why that matters
/// more than it sounds.
enum SecondFactorMethod {
  face,
  totp,
  totpSetup;

  static SecondFactorMethod? fromWire(Object? value) {
    return switch (value) {
      'face' => SecondFactorMethod.face,
      'totp' => SecondFactorMethod.totp,
      'totp-setup' => SecondFactorMethod.totpSetup,
      _ => null,
    };
  }
}

/// What a sign-in attempt actually produced.
///
/// Sealed, and that is the whole point. `POST /auth/login` has two success
/// shapes — both HTTP 200 with `success: true` — and they carry **different
/// fields**, not the same fields with holes: the second-factor branch has no
/// `id`, no `email` and no `role` at all, only a name to greet with.
///
/// The obvious alternative, one class with a nullable token, was rejected. It
/// would force [UserModel] to be mostly nullable and leak that nullability into
/// Home, the role badge and the queued-scan attribution — and nothing would stop
/// a caller reading `challenge` off a session or `token` off a challenge, since
/// both would merely be null. An exhaustive `switch` over a sealed type turns "a
/// third outcome appeared server-side" into a compile error instead of a
/// null-dereference at sign-in.
sealed class LoginResult {
  const LoginResult();

  /// Reads any of the three bodies the auth routes answer with.
  ///
  /// **It branches on the token, never on `mfaRequired`**, and the difference is
  /// not cosmetic. `/auth/totp` and `/auth/face` finish through the server's
  /// shared `issueSessionResponse(user)` with no extra keys, so their success
  /// bodies have **no `mfaRequired` field at all**; only `/auth/login` adds it. A
  /// parser keyed on `mfaRequired == false` rejects both of those outright, and
  /// one keyed on `!= true` works purely by accident and breaks the day a fourth
  /// flag appears. The token is not metadata about the decision — it *is* the
  /// thing being decided. One parser, three bodies, keyed on the fact that
  /// settles it.
  ///
  /// Nothing here is a hard cast. The old code did four of them in a row
  /// (`data['token'] as String` and friends) and threw a `TypeError` on the
  /// second-factor body — which is not a `DioException`, so the catch below it
  /// never saw it, and the operator got "an unexpected error occurred" with no
  /// hint that a second step even existed. That is the bug this file exists to
  /// close.
  static LoginResult parse(Object? body) {
    if (body is! Map) throw _unreadable();
    final data = body['data'];
    if (data is! Map) throw _unreadable();

    final token = data['token'];
    if (token is String && token.isNotEmpty) {
      final rawUser = data['user'];
      final user = UserModel.tryFromJson(rawUser);
      if (user == null) {
        // A role this build has never heard of is not a malformed answer — it
        // is, whatever it turns out to be, not OPERATOR, and this app is for
        // nobody else. Saying "unreadable" would send someone to check a
        // server address that is fine.
        if (rawUser is Map &&
            rawUser['role'] is String &&
            UserRole.tryParse(rawUser['role']) == null) {
          throw const OperatorOnlyException();
        }
        throw _unreadable();
      }
      return LoginSession(token: token, user: user);
    }

    final challenge = data['challenge'];
    if (challenge is String && challenge.isNotEmpty) {
      final rawMethods = data['methods'];
      final wire = rawMethods is List ? rawMethods : const [];
      final methods = <SecondFactorMethod>[];
      for (final entry in wire) {
        final method = SecondFactorMethod.fromWire(entry);
        if (method != null && !methods.contains(method)) methods.add(method);
      }

      final user = data['user'];
      final name = user is Map && user['name'] is String
          ? user['name'] as String
          : '';

      final seconds = data['expiresIn'];
      return LoginSecondFactor(
        challenge: challenge,
        name: name,
        methods: List.unmodifiable(methods),
        expiresIn: Duration(seconds: seconds is int ? seconds : 120),
        hasUnsupportedMethods: methods.length < wire.length,
      );
    }

    throw _unreadable();
  }

  /// The failure for a body that parsed as JSON but meant nothing.
  ///
  /// The status code is carried deliberately and must stay. `ApiException`
  /// treats a NULL status as "the server was never reached"
  /// (`ApiException.isOffline`), and the update screen queues a scan offline on
  /// exactly that basis. A malformed answer from a server that plainly did reply
  /// must never be mistaken for no server at all.
  static ApiException _unreadable() => const ApiException(
    'The server answered in a form this app does not recognise.',
    statusCode: 200,
    kind: ApiErrorKind.malformed,
  );
}

/// The server issued a session, and it belongs to an account this app will not
/// serve.
///
/// Scanning and moving samples is an OPERATOR's job; ADMIN, DATABASE and
/// ANALISIS work on the website. The server will happily sign any of them in,
/// so the refusal is made here, after the fact, and the token it came with is
/// simply never stored. `SessionNotifier._adopt` raises it for the known roles,
/// [LoginResult.parse] for a role it has never heard of.
class OperatorOnlyException implements Exception {
  const OperatorOnlyException();

  @override
  String toString() => 'This app is for Operators.';
}

/// Why this phone was signed out: the account was signed in somewhere else.
///
/// An account holds one phone at a time, and the latest sign-in simply wins —
/// the server asks nobody first. The phone that lost the account hears about it
/// as a 401 `session-replaced` carrying when, and on what. Without it the
/// operator is simply dropped on the sign-in screen mid-shift, which reads as a
/// crash rather than as someone else signing in.
class SessionReplaced {
  const SessionReplaced({this.device, this.at, this.deviceInfo});

  /// The server's own one-line summary of the other device. Kept for the
  /// notice to fall back on when [deviceInfo] is missing.
  final String? device;
  final DateTime? at;

  /// What the server could tell about the other device, field by field.
  final DeviceInfo? deviceInfo;

  static SessionReplaced fromDetails(Object? details) {
    final map = details is Map ? details : const {};
    return SessionReplaced(
      device: _label(map['device']),
      at: _instant(map['at']),
      deviceInfo: DeviceInfo.tryParse(map['deviceInfo']),
    );
  }
}

/// The broad kind of device the server says the account was opened on.
enum DeviceKind {
  desktop,
  phone,
  tablet;

  static DeviceKind? fromWire(Object? value) {
    return switch (value) {
      'desktop' => DeviceKind.desktop,
      'phone' => DeviceKind.phone,
      'tablet' => DeviceKind.tablet,
      _ => null,
    };
  }
}

/// The other device, as the server read it off that device's request.
///
/// Every field is optional because every field is a guess from a user agent or
/// from headers a client chose to send. The notice shows what is here and
/// leaves the rest out, so a missing browser version costs one word, not the
/// whole explanation.
class DeviceInfo {
  const DeviceInfo({
    this.kind,
    this.os,
    this.osVersion,
    this.browser,
    this.browserVersion,
    this.model,
    this.app = false,
  });

  /// Null for a kind this build does not know, which is shown as nothing.
  final DeviceKind? kind;

  /// A proper name: "Windows", "Android", "iOS".
  final String? os;
  final String? osVersion;

  /// "Chrome", "Microsoft Edge"… Null when [app] is set.
  final String? browser;

  /// A major version only, e.g. "129".
  final String? browserVersion;

  /// e.g. "Samsung SM-A515F". Usually null for a computer.
  final String? model;

  /// True when it was the Atara phone app rather than a browser.
  final bool app;

  /// Reads `details.deviceInfo`. Never throws, and answers null for anything
  /// that says nothing — the notice then falls back to `details.device`
  /// rather than showing a sentence with an empty list under it.
  static DeviceInfo? tryParse(Object? value) {
    if (value is! Map) return null;
    final info = DeviceInfo(
      kind: DeviceKind.fromWire(value['kind']),
      os: _label(value['os']),
      osVersion: _label(value['osVersion']),
      browser: _label(value['browser']),
      browserVersion: _label(value['browserVersion']),
      model: _label(value['model']),
      app: value['app'] == true,
    );
    return info._isEmpty ? null : info;
  }

  bool get _isEmpty =>
      kind == null &&
      os == null &&
      osVersion == null &&
      browser == null &&
      browserVersion == null &&
      model == null &&
      !app;
}

String? _label(Object? value) =>
    value is String && value.trim().isNotEmpty ? value.trim() : null;

DateTime? _instant(Object? value) =>
    value is String ? DateTime.tryParse(value) : null;

/// The password — or the second factor — was accepted, and this is the session.
final class LoginSession extends LoginResult {
  const LoginSession({required this.token, required this.user});

  final String token;
  final UserModel user;
}

/// The password was right, and the server is holding the session back.
final class LoginSecondFactor extends LoginResult {
  const LoginSecondFactor({
    required this.challenge,
    required this.name,
    required this.methods,
    required this.expiresIn,
    required this.hasUnsupportedMethods,
  });

  /// Single-use, and short-lived — 120 seconds by the server's own clock.
  final String challenge;

  /// The only thing the server tells us about the account at this point, and
  /// the reason an unexpected prompt is legible rather than alarming.
  final String name;

  /// The methods this app can actually carry out, in the order offered.
  final List<SecondFactorMethod> methods;

  final Duration expiresIn;

  /// True when the server offered something this build cannot do.
  ///
  /// An account whose only factor is one this build does not know reaches an
  /// empty [methods] with this set, and the screen can say so plainly instead of
  /// rendering a blank page or, worse, pretending the sign-in failed.
  final bool hasUnsupportedMethods;
}

/// What `/auth/totp/setup` hands back so an authenticator can be enrolled.
final class TotpSetup {
  const TotpSetup({
    required this.manualKey,
    required this.otpauthUri,
    required this.challenge,
    required this.expiresIn,
  });

  /// Already grouped in fours by the server, ready to read aloud or copy.
  final String manualKey;

  final String otpauthUri;

  /// A **replacement** for the challenge that was spent getting here. The server
  /// issues a fresh one because typing a key into an authenticator takes longer
  /// than the two minutes the first one had left.
  final String challenge;

  final Duration expiresIn;

  static TotpSetup parse(Object? body) {
    if (body is! Map) throw LoginResult._unreadable();
    final data = body['data'];
    if (data is! Map) throw LoginResult._unreadable();

    final manualKey = data['manualKey'];
    final otpauthUri = data['otpauthUri'];
    final challenge = data['challenge'];
    if (manualKey is! String || otpauthUri is! String || challenge is! String) {
      throw LoginResult._unreadable();
    }

    final seconds = data['expiresIn'];
    return TotpSetup(
      manualKey: manualKey,
      otpauthUri: otpauthUri,
      challenge: challenge,
      expiresIn: Duration(seconds: seconds is int ? seconds : 120),
    );
  }
}
