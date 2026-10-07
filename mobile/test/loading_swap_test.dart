import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:atara/theme/app_theme.dart';
import 'package:atara/widgets/loading_swap.dart';
import 'package:atara/widgets/skeleton.dart';

/// Drives a [LoadingSwap] the way a screen does: loading first, then not.
class _Host extends StatefulWidget {
  const _Host({required this.isSlow, required this.settleAfter});

  final bool isSlow;
  final Duration settleAfter;

  @override
  State<_Host> createState() => _HostState();
}

class _HostState extends State<_Host> {
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    Future<void>.delayed(widget.settleAfter).then((_) {
      if (mounted) setState(() => _loading = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    return LoadingSwap(
      isLoading: _loading,
      isSlow: widget.isSlow,
      placeholder: const SkeletonBar(width: 100),
      child: const Text('content'),
    );
  }
}

Future<void> pumpHost(
  WidgetTester tester, {
  required Duration settleAfter,
  bool isSlow = false,
  bool disableAnimations = true,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      home: Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(disableAnimations: disableAnimations),
          child: Material(
            child: _Host(isSlow: isSlow, settleAfter: settleAfter),
          ),
        ),
      ),
    ),
  );
}

void main() {
  final skeleton = find.byType(SkeletonBar);

  testWidgets('a wait nobody can perceive shows nothing at all',
      (tester) async {
    // The failure this exists to prevent: a placeholder that appears for 40ms
    // and flashes away makes a screen feel slower than showing nothing would.
    await pumpHost(tester, settleAfter: const Duration(milliseconds: 40));

    expect(skeleton, findsNothing);
    await tester.pump(const Duration(milliseconds: 60));
    expect(skeleton, findsNothing);

    await tester.pumpAndSettle();
    expect(skeleton, findsNothing);
    expect(find.text('content'), findsOneWidget);
  });

  testWidgets('a real wait gets a placeholder, and keeps it long enough to read',
      (tester) async {
    await pumpHost(tester, settleAfter: const Duration(milliseconds: 400));

    expect(skeleton, findsNothing);

    // Past the grace period: it appears.
    await tester.pump(const Duration(milliseconds: 200));
    expect(skeleton, findsOneWidget);

    // The data lands at 400ms, only 200ms after the placeholder appeared, so
    // it has to stay a little longer rather than blinking out.
    await tester.pump(const Duration(milliseconds: 250));
    expect(
      skeleton,
      findsOneWidget,
      reason: 'a placeholder that vanishes the instant it arrives is the same '
          'glitch from the other side',
    );

    await tester.pumpAndSettle();
    expect(skeleton, findsNothing);
    expect(find.text('content'), findsOneWidget);
  });

  testWidgets('a known-slow path does not wait to admit it', (tester) async {
    // No point sitting on 150ms of grace in front of a ten-second timeout.
    await pumpHost(
      tester,
      settleAfter: const Duration(seconds: 2),
      isSlow: true,
    );

    expect(skeleton, findsOneWidget);

    // Pump past the pending work rather than leaving its timer behind.
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    expect(find.text('content'), findsOneWidget);
  });

  testWidgets('leaves no timer behind when it is torn down mid-wait',
      (tester) async {
    // A pending timer outliving the tree fails the binding outright, which is
    // how a placeholder like this usually breaks an existing test suite.
    await pumpHost(tester, settleAfter: const Duration(seconds: 5));
    await tester.pump(const Duration(milliseconds: 200));
    expect(skeleton, findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 6));
    expect(tester.takeException(), isNull);
    expect(skeleton, findsNothing);
  });

  testWidgets('the pulse stops when the platform asks for less motion',
      (tester) async {
    // Load-bearing: a forever-repeating animation never lets pumpAndSettle
    // settle, and this suite calls it 28 times.
    await pumpHost(
      tester,
      settleAfter: const Duration(milliseconds: 400),
      disableAnimations: true,
    );
    await tester.pump(const Duration(milliseconds: 200));
    expect(skeleton, findsOneWidget);

    // The real assertion is that this returns at all. A pulsing skeleton that
    // kept animating would schedule frames for ever and pumpAndSettle would
    // never come back -- which is how a placeholder like this usually takes a
    // whole suite down.
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle();
    expect(find.text('content'), findsOneWidget);
    expect(skeleton, findsNothing);
  });

  testWidgets('pumpAndSettle survives a skeleton that IS pulsing',
      (tester) async {
    // The other half of the same hazard: with motion allowed the pulse repeats
    // for as long as the placeholder is up, so a test must never be left
    // waiting on it to stop.
    await pumpHost(
      tester,
      settleAfter: const Duration(milliseconds: 400),
      disableAnimations: false,
    );
    await tester.pump(const Duration(milliseconds: 200));
    expect(skeleton, findsOneWidget);

    await tester.pump(const Duration(milliseconds: 300));
    // Bounded pumps, not pumpAndSettle: once the placeholder is gone nothing
    // repeats any more, but while it is up nothing will settle.
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 60));
    }
    expect(find.text('content'), findsOneWidget);
    expect(skeleton, findsNothing);
  });
}
