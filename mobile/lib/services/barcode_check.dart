import '../models/sample_model.dart';
import 'api_exception.dart';
import 'api_service.dart';

/// What the scanner's "Check Barcode" mode has to say about one code.
enum BarcodeCheckState {
  /// Still asking the server.
  checking,

  /// It has a Sample ID, and the app may show it: [BarcodeCheck.sampleIdent].
  hasIdent,

  /// It has a Sample ID, but the lab admin keeps it off the app.
  hasIdentHidden,

  /// It has no Sample ID yet: the thing to fix.
  noIdent,

  /// The server does not know the barcode.
  notRegistered,

  /// No server, and nothing about it on the phone either.
  offline,
}

class BarcodeCheck {
  const BarcodeCheck(this.code, this.state, {this.sampleIdent});

  const BarcodeCheck.checking(this.code)
    : state = BarcodeCheckState.checking,
      sampleIdent = null;

  final String code;
  final BarcodeCheckState state;
  final String? sampleIdent;

  bool get isSettled => state != BarcodeCheckState.checking;
}

/// Looks one code up and says only what the check needs: whether it has a
/// Sample ID, and the id itself when the app may show it.
///
/// [fetch] is the sample lookup, which falls back to the phone's cache when
/// there is no server — so a sample already seen still answers offline.
Future<BarcodeCheck> checkBarcode(
  String code, {
  Future<SampleModel> Function(String code)? fetch,
}) async {
  try {
    final sample = await (fetch ?? ApiService.instance.getSampleByCode)(code);
    if (!sample.hasSampleIdent) {
      return BarcodeCheck(code, BarcodeCheckState.noIdent);
    }
    final ident = sample.sampleIdent;
    return ident == null
        ? BarcodeCheck(code, BarcodeCheckState.hasIdentHidden)
        : BarcodeCheck(code, BarcodeCheckState.hasIdent, sampleIdent: ident);
  } on ApiException catch (error) {
    if (error.isNotFound) {
      return BarcodeCheck(code, BarcodeCheckState.notRegistered);
    }
    return BarcodeCheck(code, BarcodeCheckState.offline);
  } catch (_) {
    return BarcodeCheck(code, BarcodeCheckState.offline);
  }
}
