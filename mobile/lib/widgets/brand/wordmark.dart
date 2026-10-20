import 'package:flutter/widgets.dart';

import '../../theme/app_theme.dart';

/// "Atara." — the name with its lime full stop, as the reference sets its own.
///
/// [color] is the name's colour: the label colour on the page, white on a
/// green header. The full stop is always [AppColors.lime].
class Wordmark extends StatelessWidget {
  const Wordmark({
    super.key,
    this.size = 40,
    this.color,
  });

  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final style = AppText.title1.copyWith(
      fontSize: size,
      height: 1.1,
      fontWeight: FontWeight.w700,
      letterSpacing: -size * 0.03,
      color: color ?? palette.label,
    );
    return Semantics(
      label: 'Atara',
      excludeSemantics: true,
      child: Text.rich(
        TextSpan(
          style: style,
          children: [
            const TextSpan(text: 'Atara'),
            TextSpan(text: '.', style: TextStyle(color: palette.lime)),
          ],
        ),
        maxLines: 1,
        softWrap: false,
      ),
    );
  }
}
