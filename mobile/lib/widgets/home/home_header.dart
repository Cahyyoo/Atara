import 'dart:ui' show lerpDouble;

import 'package:flutter/cupertino.dart';

import '../../l10n/app_localizations.dart';
import '../../models/user_model.dart';
import '../../services/sample_status_text.dart';
import '../../theme/app_motion.dart';
import '../../theme/app_theme.dart';
import '../brand/green_header.dart';
import '../brand/illustration.dart';
import '../motion/reveal.dart';

/// Home's top: the green header with who is signed in, and the scan banner
/// riding over its lower edge — the reference's "Deliver to" bar and promo.
///
/// Pinned. Scrolling shrinks the green to a compact bar with rounded bottom
/// corners while the banner slides up beneath it and fades, which is what the
/// reference's header does once its feed starts moving.
class HomeHeaderDelegate extends SliverPersistentHeaderDelegate {
  HomeHeaderDelegate({
    required this.topInset,
    required this.bar,
    required this.banner,
  });

  final double topInset;
  final Widget bar;
  final Widget banner;

  static const double bannerHeight = 176;
  static const double _gap = AppSpacing.sm;

  @override
  double get minExtent => GreenHeaderMetrics.homeCollapsed(topInset);

  @override
  double get maxExtent => minExtent + _gap + bannerHeight + AppSpacing.lg;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    final range = maxExtent - minExtent;
    final t = (shrinkOffset / range).clamp(0.0, 1.0);
    final gradientHeight = lerpDouble(
      GreenHeaderMetrics.homeExpanded(topInset),
      minExtent,
      t,
    )!;
    final bannerTop = _gap - shrinkOffset;

    return Stack(
      fit: StackFit.expand,
      clipBehavior: Clip.none,
      children: [
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          height: gradientHeight,
          child: const GreenHeader(),
        ),
        // Clipped to below the bar, so the banner slides *under* it.
        Positioned(
          top: minExtent,
          left: 0,
          right: 0,
          bottom: 0,
          child: ClipRect(
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned(
                  top: bannerTop,
                  left: AppSpacing.lg,
                  right: AppSpacing.lg,
                  height: bannerHeight,
                  child: Opacity(
                    opacity: (1 - t * 1.4).clamp(0.0, 1.0),
                    child: banner,
                  ),
                ),
              ],
            ),
          ),
        ),
        Positioned(
          top: topInset,
          left: 0,
          right: 0,
          height: GreenHeaderMetrics.homeBar,
          child: bar,
        ),
      ],
    );
  }

  @override
  bool shouldRebuild(HomeHeaderDelegate oldDelegate) =>
      oldDelegate.topInset != topInset ||
      oldDelegate.bar != bar ||
      oldDelegate.banner != banner;
}

/// Who is signed in, on the green: initial, role, name — and the refresh.
class HomeTopBar extends StatelessWidget {
  const HomeTopBar({
    super.key,
    required this.user,
    required this.isRefreshing,
    required this.onRefresh,
  });

  final UserModel? user;
  final bool isRefreshing;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;
    final user = this.user;
    final name = user?.name ?? '';
    final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';
    final onHero = palette.onHero;

    return Reveal(
      animation: EntranceScope.slice(context, 0.1, 0.45, curve: Curves.easeOut),
      offset: Offset.zero,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                // White in both appearances: the initial has to read on the
                // green whichever theme is on.
                color: const Color(0xF2FFFFFF),
                shape: BoxShape.circle,
                border: Border.all(color: palette.lime, width: 2),
              ),
              child: Text(
                initial,
                style: AppText.headline.copyWith(
                  color: const Color(0xFF2A3A12),
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        CupertinoIcons.lab_flask_solid,
                        size: 13,
                        color: palette.lime,
                      ),
                      const SizedBox(width: AppSpacing.xs),
                      Flexible(
                        child: Text(
                          user == null ? '' : userRoleText(l10n, user.role),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppText.caption.copyWith(
                            color: onHero.withValues(alpha: 0.85),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.headline.copyWith(color: onHero),
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            // A pull gesture announces itself to nobody. The button is how a
            // preparator who has never been told about it finds the same thing.
            Semantics(
              button: true,
              label: l10n.refresh,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: isRefreshing ? null : onRefresh,
                child: Container(
                  width: 44,
                  height: 44,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: onHero.withValues(alpha: 0.18),
                    shape: BoxShape.circle,
                  ),
                  child: isRefreshing
                      ? CupertinoActivityIndicator(color: onHero, radius: 9)
                      : Icon(
                          CupertinoIcons.arrow_clockwise,
                          size: 20,
                          color: onHero,
                        ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The banner over the header's edge: an illustration, a line, and the way to
/// a scan — with the typed-code fallback for when the camera is the problem.
class ScanBanner extends StatelessWidget {
  const ScanBanner({super.key, required this.onScan, required this.onManual});

  final VoidCallback onScan;
  final VoidCallback onManual;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;
    final dark = context.isDark;
    final ink = dark ? palette.label : palette.heroStart;

    return Reveal(
      animation: EntranceScope.slice(context, 0.2, 0.62),
      offset: const Offset(0, AppMotion.rise),
      scale: 0.96,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppRadius.xl),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [palette.blob, dark ? palette.heroMid : palette.lime],
          ),
          boxShadow: palette.heroShadows,
        ),
        clipBehavior: Clip.antiAlias,
        child: Row(
          children: [
            Expanded(
              flex: 8,
              child: Padding(
                padding: const EdgeInsets.only(
                  left: AppSpacing.md,
                  top: AppSpacing.md,
                ),
                child: Illustration(
                  Art.homeBanner,
                  fit: BoxFit.contain,
                  alignment: Alignment.bottomCenter,
                ),
              ),
            ),
            // The gap the picture and the words were missing: without it the
            // microscope's edge ran straight into the headline.
            const SizedBox(width: AppSpacing.md),
            Expanded(
              flex: 11,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  0,
                  AppSpacing.md + 2,
                  AppSpacing.lg,
                  AppSpacing.sm + 2,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      l10n.bannerTitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.headline.copyWith(
                        color: ink,
                        fontSize: 16,
                        height: 1.2,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      l10n.bannerBody,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.caption.copyWith(
                        color: ink.withValues(alpha: 0.8),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    _BannerButton(label: l10n.bannerAction, onPressed: onScan),
                    // The way out when the camera is the thing that is broken.
                    // It has to live here rather than inside the scanner,
                    // which in that case may never render anything usable.
                    GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: onManual,
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(minHeight: 32),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          widthFactor: 1,
                          child: Text(
                            l10n.manualEntry,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppText.caption.copyWith(
                              color: ink,
                              fontWeight: FontWeight.w700,
                              decoration: TextDecoration.underline,
                              decorationColor: ink.withValues(alpha: 0.5),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BannerButton extends StatefulWidget {
  const _BannerButton({required this.label, required this.onPressed});

  final String label;
  final VoidCallback onPressed;

  @override
  State<_BannerButton> createState() => _BannerButtonState();
}

class _BannerButtonState extends State<_BannerButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Semantics(
      button: true,
      child: GestureDetector(
        onTap: widget.onPressed,
        onTapDown: (_) => setState(() => _pressed = true),
        onTapUp: (_) => setState(() => _pressed = false),
        onTapCancel: () => setState(() => _pressed = false),
        child: AnimatedScale(
          scale: _pressed ? 0.95 : 1,
          duration: const Duration(milliseconds: 120),
          child: Container(
            constraints: const BoxConstraints(minHeight: 36),
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
            decoration: BoxDecoration(
              color: palette.heroStart,
              borderRadius: BorderRadius.circular(AppRadius.pill),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  CupertinoIcons.qrcode_viewfinder,
                  size: 16,
                  color: palette.onHero,
                ),
                const SizedBox(width: AppSpacing.xs + 2),
                Flexible(
                  child: Text(
                    widget.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.caption.copyWith(
                      color: palette.onHero,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
