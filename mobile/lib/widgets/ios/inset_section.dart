import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

/// The hairline between two rows of an inset card.
///
/// Material's [Divider] was eight render objects for half a logical pixel. It
/// expands to SizedBox + Center + Container, and a childless Container with a
/// height and a margin is itself LimitedBox + ConstrainedBox + DecoratedBox +
/// ConstrainedBox + Padding — plus four Theme.of/DividerTheme.of lookups and two
/// _DividerDefaultsM3 allocations per row, all to resolve a colour and a
/// thickness that every call site was already passing explicitly. In a scan
/// history row it was also the deepest chain in the tree, twelve levels. This is
/// two render objects and a drawRect, and it removes six of that row's
/// thirty-five — paid again for every row that scrolls into view.
///
/// The explicit width is not decoration and must not be tidied away. What gave
/// the Divider its full width was the Center inside it; a childless [ColoredBox]
/// sizes to `constraints.smallest`. [InsetSection] below stretches its children
/// so it would survive, but the scan history row paints its own card slice
/// through a Column with the default centre alignment, which hands its children
/// LOOSE width. Without this the separators there render zero pixels wide — a
/// change that looks right in the diff, compiles, passes analysis, and silently
/// deletes every hairline on the screen.
class InsetHairline extends StatelessWidget {
  const InsetHairline({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      // Inset from the leading edge, never the trailing one. The gap is what
      // makes a list of rows read as one group rather than as a stack of
      // separate bars.
      padding: const EdgeInsets.only(left: AppSpacing.lg),
      child: SizedBox(
        height: 0.5,
        width: double.infinity,
        child: ColoredBox(color: context.palette.separator),
      ),
    );
  }
}

/// The inset grouped list: a rounded card of rows on the page's own ground,
/// rows divided by hairlines that start where the text starts.
///
/// This is the signature iOS container and the backbone of nearly every screen
/// here. Grouping rows this way is what lets a screen drop headings, borders
/// and shadows and still read as organised — the reason the redesign gets
/// simpler rather than busier.
///
/// [header] is set in the small uppercase footnote iOS uses above a group;
/// [footer] carries the help line that used to live inside a field.
class InsetSection extends StatelessWidget {
  const InsetSection({
    super.key,
    required this.children,
    this.header,
    this.footer,
    this.margin,
  });

  final List<Widget> children;
  final String? header;
  final String? footer;
  final EdgeInsets? margin;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return Padding(
      padding: margin ?? const EdgeInsets.only(bottom: AppSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (header != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                0,
                AppSpacing.lg,
                AppSpacing.sm,
              ),
              child: Text(
                header!.toUpperCase(),
                style: AppText.footnote.copyWith(
                  color: palette.secondaryLabel,
                  letterSpacing: 0.5,
                ),
              ),
            ),
          DecoratedBox(
            decoration: BoxDecoration(
              color: palette.cardBackground,
              borderRadius: BorderRadius.circular(AppRadius.lg),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(AppRadius.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (var i = 0; i < children.length; i++) ...[
                    children[i],
                    if (i != children.length - 1) const InsetHairline(),
                  ],
                ],
              ),
            ),
          ),
          if (footer != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.sm,
                AppSpacing.lg,
                0,
              ),
              child: Text(
                footer!,
                style: AppText.footnote.copyWith(color: palette.secondaryLabel),
              ),
            ),
        ],
      ),
    );
  }
}

/// One row inside an [InsetSection].
///
/// A tapped row dims to the system fill and back, which is how iOS answers a
/// touch. There is no ripple anywhere in this app: a spreading ink circle is
/// the single clearest tell that an interface was built with Material.
class InsetRow extends StatefulWidget {
  const InsetRow({
    super.key,
    required this.title,
    this.subtitle,
    this.leading,
    this.trailing,
    this.onTap,
    this.titleStyle,
    this.showChevron = false,
    this.isDestructive = false,
    this.padding,
    this.titleMaxLines = 2,
    this.subtitleMaxLines = 2,
  });

  final String title;
  final String? subtitle;
  final Widget? leading;
  final Widget? trailing;
  final VoidCallback? onTap;
  final TextStyle? titleStyle;

  /// The disclosure arrow, for a row that opens something.
  final bool showChevron;

  /// Colours the label red, for sign-out and the like.
  final bool isDestructive;

  final EdgeInsets? padding;

  /// Two lines by default; a row whose title is a whole sentence can ask for
  /// more, and one that must stay on a single line can ask for one.
  final int titleMaxLines;

  /// Also two. One line is right for an email or a code, but a stage
  /// description is explanatory text and cutting it at one line loses the
  /// explanation — which is the whole reason it is on screen.
  final int subtitleMaxLines;

  @override
  State<InsetRow> createState() => _InsetRowState();
}

class _InsetRowState extends State<InsetRow> {
  bool _isPressed = false;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final enabled = widget.onTap != null;

    final content = Padding(
      padding: widget.padding ??
          const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.md,
          ),
      child: Row(
        children: [
          if (widget.leading != null) ...[
            widget.leading!,
            const SizedBox(width: AppSpacing.md),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                // Bounded on purpose. Nothing in this app used to cap a
                // Text showing data, so a long operator name or a server-worded
                // stage description grew a row to four or five lines. Two lines
                // is enough to read; past that an ellipsis says more than a
                // wall of text.
                Text(
                  widget.title,
                  maxLines: widget.titleMaxLines,
                  overflow: TextOverflow.ellipsis,
                  style: widget.titleStyle ??
                      AppText.body.copyWith(
                        color: widget.isDestructive
                            ? palette.danger.foreground
                            : palette.label,
                      ),
                ),
                if (widget.subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    widget.subtitle!,
                    maxLines: widget.subtitleMaxLines,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.footnote.copyWith(color: palette.secondaryLabel),
                  ),
                ],
              ],
            ),
          ),
          if (widget.trailing != null) ...[
            const SizedBox(width: AppSpacing.sm),
            // Capped so a badge can never take the row. "Administrator" beside
            // a 44px avatar left about 122px for a name *and* an email; past
            // that limit the trailing element gives way instead of the content.
            Flexible(
              flex: 0,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 140),
                child: widget.trailing!,
              ),
            ),
          ],
          if (widget.showChevron) ...[
            const SizedBox(width: AppSpacing.xs),
            Icon(Icons.chevron_right_rounded, size: 20, color: palette.tertiaryLabel),
          ],
        ],
      ),
    );

    if (!enabled) {
      return ColoredBox(color: palette.cardBackground, child: content);
    }

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: widget.onTap,
      onTapDown: (_) => setState(() => _isPressed = true),
      onTapUp: (_) => setState(() => _isPressed = false),
      onTapCancel: () => setState(() => _isPressed = false),
      child: ColoredBox(
        color: _isPressed ? palette.fill : palette.cardBackground,
        child: content,
      ),
    );
  }
}

/// A row whose whole body is supplied by the caller — a text field, a summary,
/// anything that is not title-and-subtitle. Keeps the card's padding and its
/// place in the hairline sequence.
class InsetCustomRow extends StatelessWidget {
  const InsetCustomRow({
    super.key,
    required this.child,
    this.padding,
    this.transparent = false,
  });

  final Widget child;
  final EdgeInsets? padding;

  /// Skips painting the card behind this row, for [InsetSectionSliver] where
  /// the card is painted once for the whole list instead of once per row.
  final bool transparent;

  @override
  Widget build(BuildContext context) {
    final content = Padding(
        padding: padding ??
          const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.md,
          ),
      child: child,
    );

    if (transparent) return content;
    return ColoredBox(color: context.palette.cardBackground, child: content);
  }
}

/// The same inset card, but its rows are built as they scroll into view.
///
/// [InsetSection] lays its children out in a `Column`, which is right for the
/// three or four rows most sections hold. My Work is not that: the server sends
/// up to a hundred log entries, and all of them were being built, laid out and
/// painted together — around a thousand render objects with no culling, rebuilt
/// in full after every save, most of them off screen.
///
/// The card is painted once for the whole list by [DecoratedSliver] rather than
/// once per row, which is why the rows here are transparent.
class InsetSectionSliver extends StatelessWidget {
  const InsetSectionSliver({
    super.key,
    required this.itemCount,
    required this.itemBuilder,
    this.header,
    this.footer,
  });

  final int itemCount;
  final Widget Function(BuildContext, int) itemBuilder;
  final String? header;
  final String? footer;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return SliverMainAxisGroup(
      slivers: [
        if (header != null)
          SliverToBoxAdapter(child: InsetSectionHeading(text: header!)),
        DecoratedSliver(
          decoration: BoxDecoration(
            color: palette.cardBackground,
            borderRadius: BorderRadius.circular(AppRadius.lg),
          ),
          sliver: SliverList.separated(
            itemCount: itemCount,
            itemBuilder: itemBuilder,
            separatorBuilder: (context, index) => const InsetHairline(),
          ),
        ),
        if (footer != null)
          SliverToBoxAdapter(child: _SectionFooter(text: footer!)),
        const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.xl)),
      ],
    );
  }
}

/// Shared with [InsetSection] so a heading reads the same either way.
///
/// Public because the history screen renders its day headers as rows of one
/// flat list rather than as section headers of ninety separate slivers, and
/// they still have to look like every other heading in the app.
class InsetSectionHeading extends StatelessWidget {
  const InsetSectionHeading({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        0,
        AppSpacing.lg,
        AppSpacing.sm,
      ),
      child: Text(
        text.toUpperCase(),
        style: AppText.footnote.copyWith(
          color: context.palette.secondaryLabel,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

class _SectionFooter extends StatelessWidget {
  const _SectionFooter({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.sm,
        AppSpacing.lg,
        0,
      ),
      child: Text(
        text,
        style: AppText.footnote.copyWith(color: context.palette.secondaryLabel),
      ),
    );
  }
}
