import 'package:flutter/cupertino.dart';

import '../../theme/app_theme.dart';

/// A screen with an iOS large title that shrinks into the bar as it scrolls.
///
/// The collapsing title is the most recognisable piece of iOS chrome, and it
/// earns its place here: the title is large and legible while the operator is
/// orienting, then gets out of the way once they are reading rows.
///
/// [slivers] takes the page body. Use [AppPage.list] for the common case of a
/// plain column of sections.
class AppPage extends StatelessWidget {
  const AppPage({
    super.key,
    required this.title,
    required this.slivers,
    this.leading,
    this.trailing,
    this.onRefresh,
    this.automaticallyImplyLeading = true,
  });

  AppPage.list({
    super.key,
    required this.title,
    required List<Widget> children,
    this.leading,
    this.trailing,
    this.onRefresh,
    this.automaticallyImplyLeading = true,
    EdgeInsets padding = const EdgeInsets.fromLTRB(
      AppSpacing.lg,
      AppSpacing.lg,
      AppSpacing.lg,
      AppSpacing.xxl,
    ),
  }) : slivers = [
          SliverPadding(
            padding: padding,
            sliver: SliverList(delegate: SliverChildListDelegate(children)),
          ),
        ];

  final String title;
  final List<Widget> slivers;
  final Widget? leading;
  final Widget? trailing;

  /// When given, the page pulls down to refresh the iOS way — a ratcheting
  /// spinner in the space above the content, rather than a floating circle.
  final Future<void> Function()? onRefresh;

  final bool automaticallyImplyLeading;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return CupertinoPageScaffold(
      backgroundColor: palette.groupedBackground,
      child: CustomScrollView(
        // Without this, pull-to-refresh on Android does nothing at all.
        //
        // MaterialApp hands Android ClampingScrollPhysics, which refuses to
        // overscroll — and CupertinoSliverRefreshControl only appears once the
        // list is dragged past its top edge. So the gesture was silently dead
        // from the moment the Material RefreshIndicator was replaced.
        //
        // AlwaysScrollable matters as much as Bouncing: a page shorter than the
        // screen is otherwise not draggable at all, and Home is short whenever
        // the shift has just started.
        physics: const BouncingScrollPhysics(
          parent: AlwaysScrollableScrollPhysics(),
        ),
        slivers: [
          CupertinoSliverNavigationBar(
            largeTitle: Text(title),
            // Opaque on purpose. CupertinoNavigationBar inserts a real
            // BackdropFilter the moment this colour is translucent, and a
            // backdrop blur forces a read-back of everything painted beneath
            // it — the most expensive primitive in Flutter, and Home was
            // compositing two of them every frame with the tab bar. iOS itself
            // only blurs while content is actually passing under the bar.
            backgroundColor: palette.cardBackground,
            border: Border(
              bottom: BorderSide(color: palette.separator, width: 0.5),
            ),
            leading: leading,
            trailing: trailing,
            automaticallyImplyLeading: automaticallyImplyLeading,
            // iOS shows the previous page's title next to the chevron, but the
            // titles here are long enough to crowd the bar on a small phone.
            automaticallyImplyTitle: false,
            previousPageTitle: '',
          ),
          if (onRefresh != null) CupertinoSliverRefreshControl(onRefresh: onRefresh),
          ...slivers,
        ],
      ),
    );
  }
}

/// A screen with a plain, non-collapsing bar — for pages pushed on top of
/// another, where a large title would restate what the operator just tapped.
class AppModalPage extends StatelessWidget {
  const AppModalPage({
    super.key,
    required this.title,
    required this.child,
    this.leading,
    this.trailing,
  });

  final String title;
  final Widget child;
  final Widget? leading;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return CupertinoPageScaffold(
      backgroundColor: palette.groupedBackground,
      navigationBar: CupertinoNavigationBar(
        middle: Text(title),
        backgroundColor: palette.cardBackground,
        border: Border(bottom: BorderSide(color: palette.separator, width: 0.5)),
        leading: leading,
        trailing: trailing,
        automaticallyImplyLeading: leading == null,
        previousPageTitle: '',
      ),
      child: SafeArea(child: child),
    );
  }
}

/// The blue text button iOS puts in a navigation bar.
class NavBarAction extends StatelessWidget {
  const NavBarAction({
    super.key,
    required this.onPressed,
    this.label,
    this.icon,
    this.isDestructive = false,
  });

  final VoidCallback onPressed;
  final String? label;
  final IconData? icon;
  final bool isDestructive;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final colour = isDestructive ? palette.danger.foreground : palette.accent;

    return CupertinoButton(
      padding: EdgeInsets.zero,
      minimumSize: const Size(44, 44),
      onPressed: onPressed,
      child: icon != null
          ? Icon(icon, size: 22, color: colour)
          : Text(label ?? '', style: AppText.body.copyWith(color: colour)),
    );
  }
}
