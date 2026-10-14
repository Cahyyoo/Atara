import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:atara/l10n/app_localizations.dart';
import 'package:atara/widgets/manual_code_dialog.dart';
/// The dialog is identified by the field it exists to offer, not by its
/// widget class -- that class changed once already when its backdrop blur was
/// dropped for the scanner's sake.
final dialogOpen = find.byType(CupertinoTextField);

/// Holds what the dialog handed back, which is only known after it closes.
class DialogHost {
  String? result;
  bool closed = false;
}

/// The dialog is the whole feature, and it only exists once it is opened — so
/// it is opened here rather than trusted to a static check.
Future<DialogHost> openDialog(WidgetTester tester, {Locale locale = const Locale('id')}) async {
  final host = DialogHost();
  var opened = false;

  await tester.pumpWidget(
    MaterialApp(
      locale: locale,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () async {
                opened = true;
                host.result = await showManualCodeDialog(context);
                host.closed = true;
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ),
  );

  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
  expect(opened, isTrue);
  return host;
}

void main() {
  testWidgets('opens with a field ready to type into', (tester) async {
    await openDialog(tester);

    expect(find.text('Masukkan Kode Sampel'), findsOneWidget);
    expect(find.text('Pakai ini kalau kamera bermasalah atau labelnya rusak.'), findsOneWidget);
    expect(find.byType(CupertinoTextField), findsOneWidget);
  });

  testWidgets('returns the code tidied up, not as it was typed', (tester) async {
    final host = await openDialog(tester);

    // What a gloved thumb actually produces off a scuffed label.
    await tester.enterText(find.byType(CupertinoTextField), '  nkl-2026-31 ');
    await tester.tap(find.text('Lanjut'));
    await tester.pumpAndSettle();

    expect(dialogOpen, findsNothing);
    expect(host.closed, isTrue);
    // The caller gets a code it can hand straight to UpdateStatusScreen.
    expect(host.result, 'NKL-2026-00031');
  });

  testWidgets('refuses an empty code and stays open', (tester) async {
    await openDialog(tester);

    await tester.tap(find.text('Lanjut'));
    await tester.pumpAndSettle();

    expect(find.text('Kode sampel wajib diisi.'), findsOneWidget);
    expect(dialogOpen, findsOneWidget);
  });

  testWidgets('clears the error once the preparator starts typing', (tester) async {
    await openDialog(tester);

    await tester.tap(find.text('Lanjut'));
    await tester.pumpAndSettle();
    expect(find.text('Kode sampel wajib diisi.'), findsOneWidget);

    await tester.enterText(find.byType(CupertinoTextField), 'N');
    await tester.pumpAndSettle();
    expect(find.text('Kode sampel wajib diisi.'), findsNothing);
  });

  testWidgets('cancelling closes without a code', (tester) async {
    final host = await openDialog(tester);

    await tester.enterText(find.byType(CupertinoTextField), 'NKL-2026-00031');
    await tester.tap(find.text('Batal'));
    await tester.pumpAndSettle();

    expect(dialogOpen, findsNothing);
    expect(host.closed, isTrue);
    // Typed and then thought better of it: nothing is opened.
    expect(host.result, isNull);
  });

  testWidgets('reads in English too', (tester) async {
    await openDialog(tester, locale: const Locale('en'));

    expect(find.text('Enter Sample Code'), findsOneWidget);
    expect(find.text('Continue'), findsOneWidget);
  });
}
