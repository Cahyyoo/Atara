import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:atara/screens/splash_screen.dart';
import 'package:atara/theme/app_theme.dart';
import 'package:atara/widgets/pill_field.dart';

/// Whether the field's text box really holds focus — the keyboard follows it.
bool fieldFocused(WidgetTester tester) =>
    tester.widget<EditableText>(find.byType(EditableText)).focusNode.hasFocus;

void main() {
  late TextEditingController controller;

  setUp(() => controller = TextEditingController());
  tearDown(() => controller.dispose());

  Widget host({ValueNotifier<bool>? splashDone}) {
    final field = PillField(
      controller: controller,
      placeholder: 'nama@atara.local',
      label: 'Email',
      autofocus: true,
    );
    return MaterialApp(
      theme: AppTheme.light,
      home: Scaffold(
        body: splashDone == null
            ? field
            : SplashStatus(done: splashDone, child: field),
      ),
    );
  }

  testWidgets('an autofocused field waits for the splash before taking focus', (
    tester,
  ) async {
    // The regression: the sign-in screen is built under the splash, and its
    // email field opened the keyboard while the trolley was still rolling.
    final done = ValueNotifier<bool>(false);
    addTearDown(done.dispose);

    await tester.pumpWidget(host(splashDone: done));
    await tester.pump();
    await tester.pump();
    expect(fieldFocused(tester), isFalse);

    done.value = true;
    await tester.pump();
    await tester.pump();
    expect(fieldFocused(tester), isTrue);
  });

  testWidgets('with no splash above, it focuses at once', (tester) async {
    await tester.pumpWidget(host());
    await tester.pump();
    expect(fieldFocused(tester), isTrue);
  });
}
