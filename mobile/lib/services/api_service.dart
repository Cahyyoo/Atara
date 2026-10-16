import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart'
    show
        TargetPlatform,
        debugPrint,
        defaultTargetPlatform,
        kIsWeb,
        visibleForTesting;

import '../models/announcement.dart';
import '../models/login_result.dart';
import '../models/master_option.dart';
import '../models/sample_identity.dart';
import '../models/sample_model.dart';
import '../models/stage_board.dart';
import '../models/stage_model.dart';
import '../models/work_summary.dart';
import 'api_exception.dart';
import 'client_device.dart';
import 'sample_cache_service.dart';
import 'scan_request.dart';
import 'session_service.dart';
import 'work_summary_cache_service.dart';
import 'settings_service.dart';
import 'stage_cache_service.dart';

class ApiService {
  ApiService._internal() {
    _dio = Dio(
      BaseOptions(
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 10),
        sendTimeout: const Duration(seconds: 10),
        contentType: 'application/json',
      ),
    );

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          // Outside the try below: neither can throw, and both matter even on a
          // request that carries no token. The client header is what files a
          // session in the account's one PHONE slot — without it the server
          // takes the caller for a web browser, and signing in here would end
          // the preparator's desk session instead of their old phone's.
          options.headers['X-Atara-Client'] = 'mobile';
          final device = deviceHeader;
          if (device != null) options.headers['X-Atara-Device'] = device;
          // Cannot throw either: a failed read is cached as null and costs the
          // two headers, never the request.
          final described = await _describeDevice();
          if (described != null) options.headers.addAll(described.headers);

          // Dio waits on `handler.future`, not on this callback returning, so a
          // path out of here that calls neither `next` nor `reject` leaves that
          // future pending for ever. The timeouts above cannot rescue it: they
          // start when the request is dispatched, and this runs before that.
          // Both reads below go through a platform channel, and a throw from
          // either one is what froze the update screen on its opening spinner.
          try {
            // Read every time, so changing the address in Settings takes effect
            // without restarting the app.
            options.baseUrl = await SettingsService.getServerUrl();
            final token = await SessionService.getToken();
            if (token != null) {
              options.headers['Authorization'] = 'Bearer $token';
            }
          } catch (error, stackTrace) {
            // Nothing was sent, so this reports as unreachable: the caller may
            // safely queue the scan and retry, exactly as it does with no signal.
            handler.reject(
              DioException(
                requestOptions: options,
                type: DioExceptionType.connectionError,
                error: error,
                stackTrace: stackTrace,
                message: 'Could not prepare the request: $error',
              ),
            );
            return;
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          // The token lasts seven days, and the server also rejects it the
          // moment an administrator deactivates the account. Without this the
          // app would hold a dead token for ever: every screen would show the
          // same refusal and there would be no route back to the sign-in form.
          try {
            // Every route that runs BEFORE there is a session. A 401 from one of
            // these is the server refusing a credential being offered, not a
            // stored token going stale, and clearing the session over it is at
            // best pointless and at worst destructive.
            //
            // /auth/totp is the one that turned this from a tidiness point into a
            // bug: it answers 401 for a merely WRONG code, so with only
            // /auth/login exempt every mistyped digit called clearSession() —
            // which also wipes the cached work summary.
            //
            // Deliberately a list and not an '/auth/' prefix: /auth/me exists,
            // and a 401 from THAT is precisely the stale-token case this handler
            // is for. `contains` rather than `==` is kept from the original,
            // because Dio does not always hand back a bare relative path here.
            const preSessionPaths = [
              '/auth/login',
              '/auth/totp',
              '/auth/totp/setup',
              '/auth/face',
            ];
            final path = error.requestOptions.path;
            final isSignInAttempt = preSessionPaths.any(
              (candidate) => path.contains(candidate),
            );
            // Signing out is already clearing the session, and a 401 there only
            // means the server had let go first. Treating it as a replacement
            // would greet a deliberate sign-out with "someone else took over".
            final isSignOut = path.contains('/auth/logout');
            // A refusal of a token this phone no longer holds says nothing
            // about the session it holds now. A request that left before the
            // preparator signed in again, and came back 401 after, used to wipe
            // the fresh session and send them straight back to sign-in.
            final sentWith = error.requestOptions.headers['Authorization'];
            final current = await SessionService.getToken();
            final isStaleToken = current != null && sentWith != 'Bearer $current';
            if (error.response?.statusCode == 401 &&
                !isSignInAttempt &&
                !isSignOut &&
                !isStaleToken) {
              // A 401 that says WHY. Two of them do: another phone took the
              // account, or somebody on the website ended this session --
              // an administrator, or a password change. Any other 401 (an
              // expired token, a deactivated account) stays the silent kind.
              final body = error.response?.data;
              final code = body is Map ? body['code'] : null;
              final notice = switch (code) {
                'session-replaced' => SessionReplaced.fromDetails(
                  (body as Map)['details'],
                ),
                'session-ended' => SessionEnded.fromDetails(
                  (body as Map)['details'],
                ),
                _ => null,
              };
              await SessionService.clearSession();
              onUnauthorized?.call(notice);
            }

            // Not a dead session: a live one the server will not serve until
            // its password is replaced. The stored flag should already say
            // so, but it is set at sign-in and an administrator can reset a
            // password long after -- so the refusal itself is believed.
            if (error.response?.statusCode == 403) {
              final body = error.response?.data;
              if (body is Map && body['code'] == 'password-change-required') {
                await SessionService.setMustChangePassword(true);
                onPasswordChangeRequired?.call();
              }
            }
          } catch (_) {
            // Housekeeping. Failing at it must not swallow the server's own
            // answer, and must never leave the chain without a `next` — see
            // onRequest for what a missing one costs.
          }
          handler.next(error);
        },
      ),
    );
  }

  static final ApiService instance = ApiService._internal();

  late final Dio _dio;

  /// The transport, swappable so a test can answer a request without a server.
  ///
  /// This exists because the sign-in reply parsing had NO test at all, and that
  /// is how a crash on a shape the server had started sending reached an
  /// preparator's hands. The interceptors, the error mapping and the parser all
  /// live on this side of the socket, and none of them was reachable from
  /// `flutter test` while the Dio was sealed in.
  ///
  /// `instance` is a singleton, so a test that sets this owns restoring it.
  @visibleForTesting
  HttpClientAdapter get httpClientAdapter => _dio.httpClientAdapter;

  @visibleForTesting
  set httpClientAdapter(HttpClientAdapter adapter) =>
      _dio.httpClientAdapter = adapter;

  /// Called when the server rejects the stored token, so the app can return to
  /// the sign-in screen instead of retrying with credentials that are gone.
  ///
  /// The argument is non-null only when another phone took the account over,
  /// which is the one sign-out the preparator did not cause and needs telling
  /// about.
  void Function(SignedOutNotice? notice)? onUnauthorized;

  /// The server refused a live session until its password is replaced.
  void Function()? onPasswordChangeRequired;

  /// `X-Atara-Device`: which kind of phone, so the OTHER phone can be told
  /// what took its place. Null anywhere else, and the header is then omitted.
  ///
  /// `defaultTargetPlatform` rather than `dart:io`'s `Platform`: identical on a
  /// device, and a test can pin it.
  @visibleForTesting
  static String? get deviceHeader {
    if (kIsWeb) return null;
    return switch (defaultTargetPlatform) {
      TargetPlatform.android => 'android',
      TargetPlatform.iOS => 'ios',
      _ => null,
    };
  }

  static Future<ClientDevice?> Function() _readClientDevice = ClientDevice.read;

  static Future<ClientDevice?>? _clientDevice;

  /// Where `X-Atara-Device-Model` and `X-Atara-OS-Version` come from.
  ///
  /// Asked once per process, on the first request, and the answer — null
  /// included — is kept: the phone does not change model between requests,
  /// and a platform channel per request would be a cost for nothing. Setting
  /// this forgets that answer, and null puts the real reader back.
  @visibleForTesting
  static set clientDeviceReader(Future<ClientDevice?> Function()? reader) {
    _readClientDevice = reader ?? ClientDevice.read;
    _clientDevice = null;
  }

  /// The cached description, never an error. The time limit is there because
  /// this runs inside the request interceptor, where a platform call that
  /// never answers would hold every request with it — see onRequest.
  static Future<ClientDevice?> _describeDevice() => _clientDevice ??= () async {
    try {
      return await _readClientDevice().timeout(const Duration(seconds: 2));
    } catch (_) {
      return null;
    }
  }();

  ApiException _mapError(DioException error) {
    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.sendTimeout ||
        error.type == DioExceptionType.receiveTimeout) {
      return const ApiException(
        'Connection timed out. Check your network and try again.',
        kind: ApiErrorKind.timeout,
      );
    }
    if (error.type == DioExceptionType.connectionError) {
      return const ApiException(
        'Could not reach the server. Please check your network connection.',
        kind: ApiErrorKind.unreachable,
      );
    }

    final response = error.response;
    if (response != null) {
      final data = response.data;
      final serverMessage = data is Map<String, dynamic>
          ? data['error'] as String?
          : null;
      final serverCode = data is Map<String, dynamic>
          ? data['code'] as String?
          : null;
      // `details` carries the server's structured extras — the face routes put a
      // quality `reason` in there, which is the difference between "try again"
      // and "move closer to the camera".
      final serverDetails = data is Map<String, dynamic>
          ? data['details']
          : null;
      return ApiException(
        serverMessage ?? 'A server error occurred (${response.statusCode}).',
        statusCode: response.statusCode,
        kind: ApiErrorKind.server,
        code: serverCode,
        details: serverDetails,
      );
    }

    return const ApiException('An unknown error occurred. Please try again.');
  }

  /// Offers a password, and returns whichever of the two answers came back.
  ///
  /// It no longer persists anything. Saving the session used to happen here as a
  /// side effect of a method named "login", which is how the untested parse and
  /// the untested write ended up in the same four lines; `SessionNotifier` owns
  /// that now. This method is transport and parsing, nothing else.
  ///
  /// An account open on another phone is not a question here: the latest
  /// sign-in wins, and the other phone learns so from its next request.
  Future<LoginResult> login({
    required String email,
    required String password,
  }) async {
    try {
      final response = await _dio.post(
        '/auth/login',
        data: {'email': email, 'password': password},
      );
      return LoginResult.parse(response.data);
    } on DioException catch (error) {
      throw _mapError(error);
    }
  }

  /// Asks whether this phone's session is still the account's current one.
  ///
  /// The answer that matters arrives as a 401 `session-replaced`, and the
  /// interceptor above does everything about it; this only has to ask. Throws
  /// the mapped [ApiException] on any failure, for the caller to ignore.
  Future<void> checkSession() async {
    try {
      await _dio.get('/auth/session');
    } on DioException catch (error) {
      throw _mapError(error);
    }
  }

  /// Tells the server this phone is done, so the account's phone slot is free.
  ///
  /// The token is passed in rather than read by the interceptor, because the
  /// caller clears the stored one without waiting for this to finish.
  Future<void> logout({required String token}) async {
    try {
      await _dio.post(
        '/auth/logout',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );
    } on DioException catch (error) {
      throw _mapError(error);
    }
  }

  /// Answers a challenge with a code from an authenticator.
  ///
  /// A wrong code comes back 401 with `code: 'totp-mismatch'` and leaves the
  /// challenge unspent, so the caller may offer another go without sending the
  /// preparator back to the password field. See `secondFactorRefusal`.
  Future<LoginResult> verifyTotp({
    required String challenge,
    required String code,
  }) async {
    try {
      final response = await _dio.post(
        '/auth/totp',
        data: {'challenge': challenge, 'code': code},
      );
      return LoginResult.parse(response.data);
    } on DioException catch (error) {
      throw _mapError(error);
    }
  }

  /// Answers a second-factor challenge with a burst of face images.
  Future<LoginResult> verifyFace({
    required String challenge,
    required List<String> frames,
    int? videoWidth,
    int? videoHeight,
  }) async {
    try {
      final response = await _dio.post(
        '/auth/face',
        data: {
          'challenge': challenge,
          'frames': frames,
          'videoWidth': ?videoWidth,
          'videoHeight': ?videoHeight,
        },
      );
      return LoginResult.parse(response.data);
    } on DioException catch (error) {
      throw _mapError(error);
    }
  }

  /// Sends a single preview frame to check framing and positioning.
  Future<Map<String, dynamic>?> checkFacePreview({
    required String frame,
    required String challenge,
  }) async {
    try {
      final response = await _dio.post(
        '/face/preview',
        data: {'frame': frame, 'challenge': challenge},
      );
      final data = response.data;
      if (data is Map<String, dynamic> &&
          data['data'] is Map<String, dynamic>) {
        return data['data'] as Map<String, dynamic>;
      }
      return null;
    } on DioException catch (e) {
      debugPrint(
        '[checkFacePreview] status: ${e.response?.statusCode}, data: ${e.response?.data}',
      );
      if (e.response?.statusCode == 401) {
        return {'expired': true};
      }
      if (e.response?.statusCode == 429) {
        return {'busy': true};
      }
      final data = e.response?.data;
      if (data is Map && data['code'] == 'service-down') {
        return {'serviceDown': true};
      }
      return null;
    } catch (e) {
      debugPrint('[checkFacePreview] error: $e');
      return null;
    }
  }

  /// Starts an authenticator enrolment the administrator has already requested.
  ///
  /// Call this **once** per sign-in attempt. Every call mints a fresh secret
  /// server-side, so a second one silently invalidates a key the preparator may
  /// already have typed into their authenticator. The reply carries a
  /// REPLACEMENT challenge, because reading a key across takes longer than the
  /// two minutes the first one had left.
  Future<TotpSetup> startTotpSetup({required String challenge}) async {
    try {
      final response = await _dio.post(
        '/auth/totp/setup',
        data: {'challenge': challenge},
      );
      return TotpSetup.parse(response.data);
    } on DioException catch (error) {
      throw _mapError(error);
    }
  }

  Future<List<StageModel>> getStages() async {
    try {
      final response = await _dio.get('/stages');
      final data = response.data['data'] as List<dynamic>;
      final stages = data
          .map((item) => StageModel.fromJson(item as Map<String, dynamic>))
          .toList();
      await StageCacheService.save(stages);
      return stages;
    } on DioException catch (error) {
      final mapped = _mapError(error);
      // Offline: the stage picker is useless without this list, so fall back
      // to the last one we saw rather than blocking the preparator.
      if (mapped.isOffline) {
        final cached = await StageCacheService.load();
        if (cached.isNotEmpty) return cached;
      }
      throw mapped;
    }
  }

  /// Replaces the signed-in account's own password.
  ///
  /// The current one is asked for even though the session is good: an
  /// unlocked phone left on a bench should not be enough to take an account
  /// over. The server ends every OTHER session on success and keeps this one,
  /// so the preparator carries on working here.
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    try {
      await _dio.post(
        '/auth/password',
        data: {'currentPassword': currentPassword, 'newPassword': newPassword},
      );
    } on DioException catch (error) {
      throw _mapError(error);
    }
  }

  /// The banner for this account's role, or an empty list.
  ///
  /// Never throws. An announcement is something extra on top of Home; a
  /// server that will not answer must cost the preparator nothing, least of
  /// all the screen they scan from.
  Future<List<Announcement>> fetchAnnouncements() async {
    try {
      final response = await _dio.get('/announcements/active');
      final data = response.data['data'];
      final list = data is Map ? data['announcements'] : null;
      if (list is! List) return const [];
      return list
          .map(Announcement.tryFromJson)
          .whereType<Announcement>()
          .toList(growable: false);
    } catch (_) {
      return const [];
    }
  }

  Future<SampleModel> getSampleByCode(String code) async {
    try {
      final response = await _dio.get('/samples/${Uri.encodeComponent(code)}');
      final sample = SampleModel.fromJson(
        response.data['data'] as Map<String, dynamic>,
      );
      await SampleCacheService.save(sample);
      return sample;
    } on DioException catch (error) {
      final mapped = _mapError(error);
      // Offline: fall back to what the device already knows, exactly as the
      // stage list does. A refusal from the server is a real answer and must
      // never be papered over with stale data — only a missing server is.
      if (mapped.isOffline) {
        final cached = await SampleCacheService.load(code);
        if (cached != null) return cached;
      }
      throw mapped;
    }
  }

  /// The signed-in preparator's own work for the current shift day.
  Future<WorkSummary> getMyWork() async {
    try {
      final response = await _dio.get('/samples/scan/mine');
      final summary = WorkSummary.fromJson(
        response.data['data'] as Map<String, dynamic>,
      );
      await WorkSummaryCacheService.save(summary);
      return summary;
    } on DioException catch (error) {
      final mapped = _mapError(error);
      if (mapped.isOffline) {
        final cached = await WorkSummaryCacheService.load();
        if (cached != null) return cached;
      }
      throw mapped;
    }
  }

  /// The signed-in preparator's own scans, one page at a time, across days.
  ///
  /// Never writes WorkSummaryCacheService. That cache is Home's shift tally,
  /// and a ninety-day total written into it would leave the Home card claiming
  /// a season's work as "this shift" the next time the phone is offline.
  ///
  /// Offline, only the first page can be answered — from that same cache, which
  /// holds the current shift. Later pages are a real request or nothing; see
  /// ScanHistoryNotifier.
  Future<ScanHistoryPage> getMyScanHistory({
    required int page,
    int pageSize = kScanHistoryPageSize,
    int days = kScanHistoryDays,
  }) async {
    try {
      final response = await _dio.get(
        '/samples/scan/mine',
        queryParameters: {'days': days, 'page': page, 'pageSize': pageSize},
      );
      return ScanHistoryPage.fromJson(
        response.data['data'] as Map<String, dynamic>,
      );
    } on DioException catch (error) {
      final mapped = _mapError(error);
      if (mapped.isOffline && page == 1) {
        final cached = await WorkSummaryCacheService.load();
        if (cached != null) return ScanHistoryPage.fromCache(cached);
      }
      throw mapped;
    }
  }

  /// The server takes the preparator from the auth token, so none is sent here.
  /// [force] and [reason] are the preparator's override of the stage order.
  ///
  /// `evaluateStageTransition` honours them for PREPARATOR and refuses them
  /// without a reason, so a mis-scan is fixed at the rack instead of at a desk.
  /// Every other role is refused this endpoint outright (403), and the app
  /// signs none of them in.
  Future<SampleModel> scanUpdate({
    required String sampleCode,
    required String stageId,
    String? notes,
    bool force = false,
    String? reason,
  }) async {
    try {
      final response = await _dio.post(
        '/samples/scan',
        // Built by scanUpdateBody, not inline, because the correction rule it
        // carries has to hold for the offline drain as much as for a live tap.
        data: scanUpdateBody(
          sampleCode: sampleCode,
          stageId: stageId,
          notes: notes,
          force: force,
          reason: reason,
        ),
      );
      return SampleModel.fromJson(
        response.data['data'] as Map<String, dynamic>,
      );
    } on DioException catch (error) {
      throw _mapError(error);
    }
  }

  /// Every code in the five lists a Sample ID is picked from, retired ones
  /// included: a sample may still carry a code that has since been retired,
  /// and it has to be shown by name. The pickers offer only the active ones.
  Future<List<MasterOption>> getMasterOptions() async {
    try {
      final response = await _dio.get('/master-options');
      final data = response.data['data'];
      final list = data is Map ? data['options'] : null;
      if (list is! List) return const [];
      return list
          .map(MasterOption.tryFromJson)
          .whereType<MasterOption>()
          .toList(growable: false);
    } on DioException catch (error) {
      throw _mapError(error);
    }
  }

  /// Adds a code to a master list straight from a picker, as the identity form
  /// on the website does. A 409 means somebody added it first; the caller
  /// re-reads the list and picks theirs.
  Future<MasterOption> createMasterOption({
    required MasterKind kind,
    required String code,
  }) async {
    try {
      final response = await _dio.post(
        '/master-options',
        data: {'kind': kind.wire, 'code': code.toUpperCase()},
      );
      final option = MasterOption.tryFromJson(response.data['data']);
      if (option == null) {
        throw const ApiException('Unreadable reply.');
      }
      return option;
    } on DioException catch (error) {
      throw _mapError(error);
    }
  }

  /// A sample's identity for the form that edits it: whole, with the Sample ID,
  /// even when the lab admin keeps Sample IDs off the rest of the app. Needs
  /// the server, like saving does; nothing here comes from the cache.
  Future<IdentitySnapshot> getSampleIdentity(String sampleCode) async {
    try {
      final response = await _dio.get(
        '/samples/${Uri.encodeComponent(sampleCode)}/identity',
      );
      final snapshot = IdentitySnapshot.tryFromJson(response.data['data']);
      if (snapshot == null) {
        throw const ApiException(
          'Unreadable reply.',
          kind: ApiErrorKind.malformed,
        );
      }
      return snapshot;
    } on DioException catch (error) {
      throw _mapError(error);
    }
  }

  /// Fills in or corrects a sample's identity by barcode.
  ///
  /// With [dryRun] nothing is written: the server answers with the Sample ID
  /// the parts compose and the sample already holding it, if any, so the form
  /// can warn while it is being filled in. A real save of an id that is taken
  /// is refused with a 409. Needs the server: an identity is never queued.
  Future<IdentityCheck> updateSampleIdentity({
    required String sampleCode,
    required SampleIdentity identity,
    bool dryRun = false,
  }) async {
    try {
      final response = await _dio.patch(
        '/samples/${Uri.encodeComponent(sampleCode)}/identity',
        data: {...identity.toPayload(), 'dryRun': dryRun},
      );
      return IdentityCheck.fromJson(
        response.data['data'] as Map<String, dynamic>,
      );
    } on DioException catch (error) {
      throw _mapError(error);
    }
  }

  /// Where every live sample is now, stage by stage: Home's to-do list.
  Future<StageBoard> getStageBoard() async {
    try {
      final response = await _dio.get('/samples/board');
      return StageBoard.fromJson(response.data['data'] as Map<String, dynamic>);
    } on DioException catch (error) {
      throw _mapError(error);
    }
  }
}
