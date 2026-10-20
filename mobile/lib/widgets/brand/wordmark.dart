import 'package:flutter/widgets.dart';

import '../../theme/app_theme.dart';

/// "Atara Lab." — the name with its lime full stop, as the reference sets its
/// own.
///
/// [color] is the name's colour: the label colour on the page, white on a
/// green header. The full stop is always [AppColors.lime].
class Wordmark extends StatelessWidget {
  const Wordmark({super.key, this.size = 40, this.color});

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
      label: 'Atara Lab',
      excludeSemantics: true,
      // Shrinks rather than overflows: the login header gives it only the
      // width beside the illustration, and a large system text size would
      // otherwise push the full stop off the edge.
      child: FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerLeft,
        child: Text.rich(
          TextSpan(
            style: style,
            children: [
              const TextSpan(text: 'Atara Lab'),
              TextSpan(
                text: '.',
                style: TextStyle(color: palette.lime),
              ),
            ],
          ),
          maxLines: 1,
          softWrap: false,
        ),
      ),
    );
  }
}
