import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter/foundation.dart' show clampDouble;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../providers/onboarding_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/brand/illustration.dart';
import '../widgets/ios/app_page.dart';
import '../widgets/ios/ios_button.dart';

/// A welcome, then the four things a preparator has to know before their first
/// shift.
///
/// Three of those four are invisible until they bite: that a damaged label can
/// be typed instead of scanned, that a scan taken with no signal is kept and
/// sent on its own later, and that Home already tallies the shift. None of it
/// was said anywhere, so it was learned by asking whoever was standing nearby.
///
/// [isFirstRun] separates the two hosts the way [SettingsScreen.isTab] does. At
/// the gate this screen is the whole app: it dismisses by writing the flag and
/// letting the gate replace it. Opened from Settings it is a visit, so it
/// dismisses by popping and leaves the flag alone — re-reading the guide is not
/// the same as never having seen it.
class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key, this.isFirstRun = false});

  final bool isFirstRun;

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _controller = PageController();

  /// The settled page. Not read back from `_controller.page`, which asserts
  /// before a PageView has attached to it and again once it is disposed — and
  /// at first run this screen is torn down the frame after the flag is written.
  int _index = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  /// The live scroll position in pages, safe to read at any point in a build.
  ///
  /// Beyond the assertions [_index] documents, `page` also returns null on the
  /// very first layout pass: content dimensions are established after the
  /// viewport is sized, which is after the first itemBuilder call. [_index] is
  /// the honest fallback — it is where the settled page is, which is what the
  /// first frame shows. `initialPage` would not do: it is always 0, so a
  /// rebuild while sitting on page 3 would compute a delta of -3 and blank the
  /// screen.
  double get _pageOffset {
    if (!_controller.hasClients) return _index.toDouble();
    final position = _controller.position;
    if (!position.hasPixels || !position.hasContentDimensions) {
      return _index.toDouble();
    }
    return _controller.page ?? _index.toDouble();
  }

  void _next(int pageCount) {
    if (_index >= pageCount - 1) {
      _finish();
      return;
    }
    _controller.nextPage(
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOutCubic,
    );
  }

  void _finish() {
    // Opened from Settings there is a page underneath to go back to, and the
    // flag was written the first time round.
    if (!widget.isFirstRun) {
      Navigator.of(context).pop();
      return;
    }
    // Deliberately not awaited, and nothing reads `context` afterwards: the
    // notifier flips its state synchronously, the gate rebuilds, and this
    // State is gone before the write to the store has even landed.
    unawaited(ref.read(onboardingSeenProvider.notifier).markSeen());
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;

    final pages = <_Guide>[
      _Guide(
        art: Art.splashCart,
        title: l10n.appTitle,
        body: l10n.onboardingWelcomeBody,
      ),
      _Guide(
        art: Art.loginWave,
        title: l10n.onboardingScanTitle,
        body: l10n.onboardingScanBody,
      ),
      _Guide(
        art: Art.homeBanner,
        title: l10n.onboardingStageTitle,
        body: l10n.onboardingStageBody,
      ),
      _Guide(
        art: Art.emptyQueue,
        title: l10n.onboardingOfflineTitle,
        body: l10n.onboardingOfflineBody,
      ),
      _Guide(
        art: Art.stageReport,
        title: l10n.onboardingWorkTitle,
        body: l10n.onboardingWorkBody,
      ),
    ];

    final isLast = _index == pages.length - 1;

    final content = Column(
      children: [
        // Reserved whether or not it holds anything, so the pages do not jump
        // upward when the shortcut leaves on the last one.
        SizedBox(
          height: 44,
          child: widget.isFirstRun && !isLast
              ? Align(
                  alignment: Alignment.centerRight,
                  child: Padding(
                    padding: const EdgeInsets.only(right: AppSpacing.sm),
                    child: NavBarAction(
                      onPressed: _finish,
                      label: l10n.onboardingSkip,
                    ),
                  ),
                )
              : null,
        ),
        Expanded(
          child: PageView.builder(
            controller: _controller,
            itemCount: pages.length,
            onPageChanged: (index) => setState(() => _index = index),
            itemBuilder: (context, index) => _PageTransition(
              offset: () => _pageOffset,
              listenable: _controller,
              index: index,
              // A PageView keeps its neighbours built. Without this a screen
              // reader walks straight out of one page body into the next page
              // heading, with nothing on screen to say it moved. Opacity alone
              // would not cover it: mid-drag both pages are partly visible
              // while `_index` still names the one being left.
              child: ExcludeSemantics(
                excluding: index != _index,
                child: _GuidePage(guide: pages[index]),
              ),
            ),
          ),
        ),
        _PageDots(
          count: pages.length,
          index: _index,
          label: l10n.onboardingPageOf(_index + 1, pages.length),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.xl,
            AppSpacing.lg,
            AppSpacing.xl,
          ),
          child: AppButton(
            label: isLast
                ? (widget.isFirstRun
                    ? l10n.onboardingStart
                    : l10n.onboardingDone)
                : l10n.onboardingNext,
            onPressed: () => _next(pages.length),
          ),
        ),
      ],
    );

    // Pushed from Settings this gets the plain bar, the back chevron and the
    // SafeArea from the primitive. At first run there is nothing to go back to,
    // so it is the bare scaffold the sign-in screen uses.
    if (!widget.isFirstRun) {
      return AppModalPage(title: l10n.onboardingTitle, child: content);
    }

    return CupertinoPageScaffold(
      backgroundColor: palette.groupedBackground,
      child: SafeArea(child: content),
    );
  }
}

/// One page's content, kept together so the list above reads as five entries
/// rather than five blocks of layout.
class _Guide {
  const _Guide({required this.art, required this.title, required this.body});

  /// The lab illustration that leads the page, in the redesign's flat style.
  final Art art;
  final String title;
  final String body;
}

/// Fades and lifts a page as it enters and leaves, following the finger.
///
/// Driven by the [PageController] rather than by `onPageChanged`: that fires
/// only once a page has settled, so an implicit animation keyed on it would be
/// invisible during a drag — the content is already in place by then — and
/// would pop when the button is tapped instead.
///
/// One wrapper around the whole page, never one per element. Separate
/// transforms on the tile and the text would move them at different rates,
/// which is parallax.
class _PageTransition extends StatelessWidget {
  const _PageTransition({
    required this.listenable,
    required this.offset,
    required this.index,
    required this.child,
  });

  /// How far the page travels as it leaves. At `|delta| == 1` the page is
  /// entirely off-screen, so only the first half of this is ever seen.
  static const double _travel = 24;

  final Listenable listenable;
  final ValueGetter<double> offset;
  final int index;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.disableAnimationsOf(context)) return child;

    return ListenableBuilder(
      listenable: listenable,
      builder: (context, child) {
        final t = clampDouble((offset() - index).abs(), 0, 1);
        return Transform.translate(
          offset: Offset(0, t * _travel),
          child: Opacity(opacity: 1 - t, child: child),
        );
      },
      // Passed as a child so the page below is built once per settled page
      // rather than once per frame of the drag.
      child: child,
    );
  }
}

/// A large illustration on its soft blob, a title and a line of explanation,
/// centred in a scroll view — the same pieces the rest of the app is built
/// from, so the guide does not read as a slideshow bolted onto it.
///
/// The picture, the title and the body arrive in that order off a single
/// controller, each reading its own [Interval] of it. One animator for three
/// staggered elements is cheaper than three that have to agree, and handing
/// each slice to a `*Transition` keeps the whole entrance out of the build
/// phase: `FadeTransition`'s render object subscribes to the animation and
/// only updates its layer alpha. The `TweenAnimationBuilder` this replaces
/// rebuilt the entire page -- picture and both `TextStyle`s -- 25 times
/// per entrance.
///
/// It runs once, when this page is first built -- which a [PageView] with no
/// cache extent does as the page scrolls into view, so the entrance plays
/// under the finger. Restarting it when the page settles was the obvious thing
/// and it is wrong: the content is already fully drawn by then, so it would
/// blink back to nothing and fade in a second time.
class _GuidePage extends StatefulWidget {
  const _GuidePage({required this.guide});

  final _Guide guide;

  @override
  State<_GuidePage> createState() => _GuidePageState();
}

class _GuidePageState extends State<_GuidePage>
    with SingleTickerProviderStateMixin {
  // preserve, for the same reason SplashScreen needs it: the default behaviour
  // shrinks this to 21ms when the platform asks for less motion, which is a
  // flash rather than an absence. The movement is dropped in build instead.
  late final AnimationController _controller = AnimationController(
    duration: const Duration(milliseconds: 420),
    animationBehavior: AnimationBehavior.preserve,
    vsync: this,
  );

  late final _tile = _slice(0, 0.70);
  late final _title = _slice(0.15, 0.85);
  late final _body = _slice(0.30, 1);

  CurvedAnimation _slice(double from, double to) => CurvedAnimation(
        parent: _controller,
        curve: Interval(from, to, curve: Curves.easeOut),
      );

  @override
  void initState() {
    super.initState();
    _controller.forward();
  }

  @override
  void dispose() {
    for (final slice in [_tile, _title, _body]) {
      slice.dispose();
    }
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final guide = widget.guide;
    final still = MediaQuery.disableAnimationsOf(context);

    return Center(
      // Scrollable, not merely centred: at the largest system text setting the
      // body copy runs to four lines under the picture, and a Column would
      // overflow rather than give way.
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.xl,
          vertical: AppSpacing.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _Arrive(
              animation: _tile,
              still: still,
              // Only the picture scales: it is the heaviest thing on the page
              // and the one that reads as arriving rather than appearing.
              scaleFrom: 0.9,
              child: Illustration(guide.art, height: 220, width: 260),
            ),
            const SizedBox(height: AppSpacing.xl),
            _Arrive(
              animation: _title,
              still: still,
              child: Semantics(
                header: true,
                child: Text(
                  guide.title,
                  textAlign: TextAlign.center,
                  style: AppText.title1.copyWith(color: palette.label),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            _Arrive(
              animation: _body,
              still: still,
              child: Text(
                guide.body,
                textAlign: TextAlign.center,
                style: AppText.subhead.copyWith(color: palette.secondaryLabel),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// One element fading, lifting and optionally scaling into place.
///
/// The wrapper is unconditional: an earlier version returned the bare child
/// once its slice finished, which changed the widget's runtime type mid-
/// animation. `Widget.canUpdate` is false across types, so Flutter tore the
/// subtree down and inflated it again from scratch -- three times per page
/// entrance, discarding the freshly built picture each time.
class _Arrive extends StatelessWidget {
  const _Arrive({
    required this.animation,
    required this.still,
    this.scaleFrom = 1,
    required this.child,
  });

  static const double _rise = AppSpacing.md;

  final Animation<double> animation;

  /// True when the platform asked for less motion: the fade stays, the
  /// movement goes.
  final bool still;

  final double scaleFrom;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    Widget result = child;

    if (!still && scaleFrom != 1) {
      result = ScaleTransition(
        scale: Tween<double>(begin: scaleFrom, end: 1).animate(animation),
        child: result,
      );
    }
    if (!still) {
      result = _Rise(animation: animation, distance: _rise, child: result);
    }
    return FadeTransition(opacity: animation, child: result);
  }
}

/// Lifts its child into place as [animation] runs.
///
/// `SlideTransition` measures its offset as a fraction of the child's own
/// size, so a fixed rise would depend on how tall the element happens to be.
/// This is the same thing in logical pixels.
class _Rise extends AnimatedWidget {
  const _Rise({
    required Animation<double> animation,
    required this.distance,
    required this.child,
  }) : super(listenable: animation);

  final double distance;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final t = (listenable as Animation<double>).value;
    return Transform.translate(offset: Offset(0, distance * (1 - t)), child: child);
  }
}

/// Where the preparator is in the guide, and how much is left.
///
/// Drawn rather than depended on: every package that does this brings a
/// transitive tree for five dots, and this app keeps its dependency list to the
/// ones that earn their place.
class _PageDots extends StatelessWidget {
  const _PageDots({
    required this.count,
    required this.index,
    required this.label,
  });

  final int count;
  final int index;

  /// "Halaman 2 dari 5" — the number is what a screen reader needs; the shapes
  /// say nothing, and five blank nodes would say it five times.
  final String label;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return Semantics(
      container: true,
      label: label,
      excludeSemantics: true,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          for (var i = 0; i < count; i++)
            AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              curve: Curves.easeOut,
              margin: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
              // The current dot lengthens rather than only recolouring, so the
              // position survives a dim lab and a screen held at an angle.
              width: i == index ? AppSpacing.xl : AppSpacing.sm,
              height: AppSpacing.sm,
              decoration: BoxDecoration(
                gradient: i == index ? palette.primaryGradient : null,
                color: i == index ? null : palette.separator,
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
            ),
        ],
      ),
    );
  }
}
