import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:atara/widgets/skeleton.dart';

/// Anything that means "still working", whichever form it takes.
///
/// Several tests assert that a busy state is *gone* — that a screen settled
/// rather than hanging, which is a regression this app has shipped twice.
/// Those assertions are the dangerous kind: they fail open. Matching only
/// [CircularProgressIndicator] would keep passing the moment the app switched
/// to [CupertinoActivityIndicator], while testing nothing at all and leaving
/// the hang uncovered.
///
/// That is exactly what happened when the centred spinners became skeleton
/// placeholders: a finder that named only the two spinner classes went on
/// passing while the screens it guarded were free to hang again. So the finder
/// names the behaviour — "something says it is busy" — and grows whenever a
/// new way of saying it is added.
final Finder anyBusyIndicator = find.byWidgetPredicate(
  (widget) =>
      widget is CircularProgressIndicator ||
      widget is CupertinoActivityIndicator ||
      widget is SkeletonBar ||
      widget is SkeletonCircle ||
      widget is SkeletonBadge,
  description: 'a spinner or a skeleton placeholder',
);

/// The old name, kept so the intent of existing call sites still reads.
@Deprecated('Use anyBusyIndicator: skeletons are busy states too.')
final Finder anySpinner = anyBusyIndicator;
