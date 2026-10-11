import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'l10n/app_localizations.dart';
import 'providers/onboarding_provider.dart';
import 'providers/pending_scans_provider.dart';
import 'providers/session_provider.dart';
import 'providers/settings_provider.dart';
import 'providers/theme_provider.dart';
import 'screens/change_password_screen.dart';
import 'screens/home_shell.dart';
import 'screens/login_screen.dart';
import 'screens/onboarding_screen.dart';
import 'screens/splash_screen.dart';
import 'services/session_heartbeat.dart';
import 'services/time_text.dart';
import 'theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Still nothing awaited before the first frame. The date tables used to be
  // loaded here, which delayed every cold start; then they moved to first use,
  // which was worse in a way that took a profile to see — first use is inside
  // the frame that paints the screen the operator just opened.
  //
  // scheduleTask runs it in the gap between frames, and the scheduler skips it
  // while a frame is in flight. addPostFrameCallback would extend the current
  // frame, which during a page push is the transition frame; scheduleMicrotask
  // is no better, since microtasks drain before the frame's work is done.
  runApp(const ProviderScope(child: AtaraApp()));
  SchedulerBinding.instance.scheduleTask(warmDateFormats, Priority.animation);
}

class AtaraApp extends ConsumerWidget {
  const AtaraApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = ref.watch(localeProvider);
    final themeMode = ref.watch(themeModeProvider);

    // A MaterialApp hosting an entirely Cupertino interface, on purpose.
    // Every screen is built from Cupertino widgets, but keeping the Material
    // host preserves the Overlay, the localisation delegates and the page
    // transition machinery the rest of the app already relies on.
    return MaterialApp(
      title: 'Atara Operator',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      // Following the system is still the default; Settings lets an operator
      // pin it when their phone is set one way and the shift wants the other.
      themeMode: themeMode,
      // Null follows the device language; otherwise the operator's choice wins.
      locale: locale == null ? null : Locale(locale),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      // Supplies the ambient text style the Cupertino scaffolds do not.
      //
      // A Material app normally gets this from the Material inside a Scaffold.
      // CupertinoPageScaffold is not one, and MaterialApp does not install the
      // style CupertinoApp would, so every Text fell back to the framework's
      // error style — real, shipped text with yellow underlines under it. One
      // wrapper here covers every screen rather than each one remembering.
      builder: (context, child) {
        final palette =
            Theme.of(context).extension<AppColors>() ?? AppColors.light;
        return DefaultTextStyle(
          style: AppText.body.copyWith(
            color: palette.label,
            decoration: TextDecoration.none,
          ),
          child: child!,
        );
      },
      home: const ScanSyncScope(
        child: SessionHeartbeatScope(child: SplashGate(child: AuthGate())),
      ),
    );
  }
}

/// Drains the offline scan queue whenever the app returns to the foreground or
/// the device regains a connection.
class ScanSyncScope extends ConsumerStatefulWidget {
  const ScanSyncScope({required this.child, super.key});

  final Widget child;

  @override
  ConsumerState<ScanSyncScope> createState() => _ScanSyncScopeState();
}

class _ScanSyncScopeState extends ConsumerState<ScanSyncScope>
    with WidgetsBindingObserver {
  StreamSubscription<List<ConnectivityResult>>? _connectivity;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    try {
      _connectivity = Connectivity().onConnectivityChanged.listen((results) {
        final isOnline = results.any((result) => result != ConnectivityResult.none);
        if (isOnline) _sync();
      });
    } catch (_) {
      // No connectivity channel (tests, unsupported platform): fall back to
      // syncing on resume and on pull-to-refresh only.
    }

    WidgetsBinding.instance.addPostFrameCallback((_) => _sync());
  }

  @override
  void dispose() {
    _connectivity?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _sync();
  }

  void _sync() {
    // Nothing can be sent until someone is signed in.
    //
    // `valueOrNull` because `value` rethrows on an error state, and this runs
    // from a post-frame callback where a throw has nowhere to go.
    if (ref.read(sessionProvider).valueOrNull == null) return;
    unawaited(ref.read(pendingScansProvider.notifier).sync());
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

/// Keeps asking whether this phone still holds the account, while it matters.
///
/// Signed in and in the foreground: every thirty seconds, and at once on every
/// return to the foreground — the moment an operator is most likely to be
/// looking at a screen that is no longer theirs. Backgrounded or signed out:
/// not at all, because nobody is looking and the battery is. See
/// [SessionHeartbeat] for what happens with the answer, which is nothing here.
class SessionHeartbeatScope extends ConsumerStatefulWidget {
  const SessionHeartbeatScope({required this.child, super.key});

  final Widget child;

  @override
  ConsumerState<SessionHeartbeatScope> createState() =>
      _SessionHeartbeatScopeState();
}

class _SessionHeartbeatScopeState extends ConsumerState<SessionHeartbeatScope>
    with WidgetsBindingObserver {
  late final SessionHeartbeat _heartbeat;

  @override
  void initState() {
    super.initState();
    _heartbeat = SessionHeartbeat(
      // Read per call rather than captured, so the provider stays the one
      // source of what "checking" means.
      check: () => ref.read(sessionCheckProvider)(),
    );
    WidgetsBinding.instance.addObserver(this);

    // Null before the first lifecycle event, which on a cold start is the app
    // coming up in front of the operator.
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    _heartbeat.foreground =
        lifecycle == null || lifecycle == AppLifecycleState.resumed;

    ref.listenManual<AsyncValue<Object?>>(sessionProvider, (previous, next) {
      final signedIn = next.valueOrNull != null;
      _heartbeat.signedIn = signedIn;
      // A session restored from storage at launch may have been replaced
      // while the app was closed, so it is asked about at once. One that has
      // just been granted by a sign-in on this phone is current by definition.
      final restored = previous == null || previous.isLoading;
      if (signedIn && restored) unawaited(_heartbeat.checkNow());
    }, fireImmediately: true);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _heartbeat.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        _heartbeat.foreground = true;
        unawaited(_heartbeat.checkNow());
      // Inactive is a notification shade or an incoming call over a screen
      // that is still showing. Neither stops the clock nor warrants a check
      // when it goes away.
      case AppLifecycleState.inactive:
        break;
      case AppLifecycleState.hidden:
      case AppLifecycleState.paused:
      case AppLifecycleState.detached:
        _heartbeat.foreground = false;
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

/// Holds the splash over the app while it starts.
///
/// A Stack, not a replacement: [AuthGate] has to be built from the first frame
/// or the providers it watches are never constructed, the stored answers are
/// not read until the splash leaves, and the operator gets a spinner
/// immediately afterwards. Underneath, the app settles while the mountain
/// draws; by the time the splash fades there is a real screen behind it.
class SplashGate extends StatefulWidget {
  const SplashGate({required this.child, super.key});

  final Widget child;

  @override
  State<SplashGate> createState() => _SplashGateState();
}

class _SplashGateState extends State<SplashGate> {
  bool _showSplash = true;
  Timer? _failsafe;

  @override
  void initState() {
    super.initState();
    // A belt to go with the animation's braces.
    //
    // Until now the only way off this screen was SplashScreen's controller
    // reaching `completed`. One unguarded 600ms promise stood between the
    // operator and the app: if that controller never finished -- a muted
    // ticker, a paused activity, anything -- the app was locked, forever,
    // behind a decoration. A Timer runs on the event loop rather than on
    // vsync, so it fires whether or not a single frame is ever scheduled.
    //
    // Deliberately longer than the splash, so in the ordinary case
    // `onFinished` wins and this never runs.
    _failsafe = Timer(
      SplashScreen.hold + const Duration(milliseconds: 400),
      _dismiss,
    );
  }

  @override
  void dispose() {
    _failsafe?.cancel();
    super.dispose();
  }

  void _dismiss() {
    _failsafe?.cancel();
    if (!mounted || !_showSplash) return;
    setState(() => _showSplash = false);
  }

  @override
  Widget build(BuildContext context) {
    // No reduced-motion branch here, deliberately. Skipping the splash
    // entirely when the platform asks for less motion is what made it vanish
    // on a device with transition_animation_scale at 0 -- which reads as a
    // broken app, not as an accessibility setting being honoured. SplashScreen
    // drops the movement instead and keeps the timing.
    if (!_showSplash) return widget.child;

    return Stack(
      children: [
        widget.child,
        Positioned.fill(child: SplashScreen(onFinished: _dismiss)),
      ],
    );
  }
}

class AuthGate extends ConsumerWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Two stored answers now stand between the app and its first usable
    // screen. Both are watched here rather than nested, so the two prefs reads
    // start on the same frame and the spinner below lasts as long as the
    // slower one instead of as long as both.
    final onboarding = ref.watch(onboardingSeenProvider);
    final session = ref.watch(sessionProvider);

    // The one spinner in the app, and the one state that can strand an
    // operator on it. Both notifiers resolve inside a try/catch precisely so
    // that neither can sit here for ever; see SessionNotifier._restore and
    // OnboardingNotifier._load. Nesting two `.when`s would give each provider
    // its own `loading:` branch, and only one of them tends to keep that
    // guarantee — hence a single check over both.
    if (onboarding.isLoading || session.isLoading) {
      return const CupertinoPageScaffold(
        child: Center(child: CupertinoActivityIndicator()),
      );
    }

    // A store that cannot be read cannot be written either, so treating a
    // failure as "not seen" would replay the guide on every single launch.
    // Skipping it leaves the operator one screen away from work, which is the
    // same call the session makes when its own read fails.
    if (!(onboarding.valueOrNull ?? true)) {
      return const OnboardingScreen(isFirstRun: true);
    }

    // `valueOrNull`, never `value`: on an error state `value` rethrows, so
    // reading it here would turn a session restore that failed into a crashed
    // gate — the one outcome SessionNotifier._restore exists to prevent. Null
    // covers both "signed out" and "the restore threw", and both belong on the
    // sign-in screen, which is what the old `error:` branch said in its own
    // line.
    final user = session.valueOrNull;
    if (user == null) return const LoginScreen();

    // Signed in, but on a password an administrator chose -- the one every
    // Operator is handed. The server refuses this session everything until it
    // is replaced, so Home would only be a screen full of refusals.
    if (user.mustChangePassword) {
      return const ChangePasswordScreen(forced: true);
    }

    return const HomeShell();
  }
}
