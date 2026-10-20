import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../theme/app_theme.dart';

/// The app's flat lab illustrations.
///
/// Drawn as SVG in the reference's style — olive uniform, lime accents, a soft
/// blob behind — and recoloured per appearance at load time rather than kept
/// as a second set: every file paints its blob in one marker colour, and
/// [_BlobMapper] swaps it for [AppColors.blob].
enum Art {
  splashCart('splash_cart'),
  loginWave('login_wave'),
  homeBanner('home_banner'),
  emptyDone('empty_done'),
  emptyQueue('empty_queue'),
  stageAll('stage_all'),
  stageReceived('stage_received'),
  stageWetPrep('stage_wet_prep'),
  stageDryPrep('stage_dry_prep'),
  stageAnalysis('stage_analysis'),
  stageReport('stage_report');

  const Art(this.file);

  final String file;

  String get asset => 'assets/illustrations/$file.svg';

  /// The illustration for a stage, by the server's stable key.
  ///
  /// Unknown keys — a stage added after this build — fall back to the rack of
  /// tubes rather than to nothing, so a new stage still gets a picture.
  static Art forStage(String? key) => switch (key) {
        'RECEIVED' => Art.stageReceived,
        'WET_PREP' => Art.stageWetPrep,
        'DRY_PREP' => Art.stageDryPrep,
        'ANALYSIS' => Art.stageAnalysis,
        'REPORT' => Art.stageReport,
        _ => Art.stageAll,
      };
}

/// The marker every SVG paints its blob in.
const Color _blobMarker = Color(0xFFDCF2B4);

class Illustration extends StatelessWidget {
  const Illustration(
    this.art, {
    super.key,
    this.width,
    this.height,
    this.fit = BoxFit.contain,
    this.alignment = Alignment.center,
    this.semanticLabel,
  });

  final Art art;
  final double? width;
  final double? height;
  final BoxFit fit;
  final Alignment alignment;

  /// Most illustrations are decoration and stay out of the semantics tree.
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final blob = context.palette.blob;
    final cached = IllustrationCache.lookup(art, blob);
    if (cached != null) {
      return _painted(cached);
    }
    // Not parsed yet (a test, or the very first frames of a cold start):
    // load it the ordinary way, and make sure the next one is instant.
    IllustrationCache.warm(blob, arts: [art]);
    return SvgPicture(
      SvgAssetLoader(
        art.asset,
        colorMapper: blob == _blobMarker ? null : _BlobMapper(blob),
      ),
      width: width,
      height: height,
      fit: fit,
      alignment: alignment,
      semanticsLabel: semanticLabel,
      excludeFromSemantics: semanticLabel == null,
      // A blank box of the right size while the file parses, so nothing
      // around it jumps when it lands.
      placeholderBuilder: (_) => SizedBox(width: width, height: height),
    );
  }

  /// Drawn synchronously from the cache: no placeholder frame, so a card that
  /// is rebuilt — a filter changing, a list reordering — never blinks.
  Widget _painted(PictureInfo info) {
    final ratio = info.size.width / info.size.height;
    final paint = CustomPaint(
      painter: _PicturePainter(info, fit, alignment),
      child: const SizedBox.expand(),
    );
    final Widget sized;
    if (width != null && height != null) {
      sized = SizedBox(width: width, height: height, child: paint);
    } else if (width != null) {
      sized = SizedBox(width: width, height: width! / ratio, child: paint);
    } else if (height != null) {
      sized = SizedBox(width: height! * ratio, height: height, child: paint);
    } else {
      sized = AspectRatio(aspectRatio: ratio, child: paint);
    }
    if (semanticLabel == null) return ExcludeSemantics(child: sized);
    return Semantics(image: true, label: semanticLabel, child: sized);
  }
}

/// Every illustration, parsed once per blob colour and kept.
///
/// SvgPicture parses on demand and shows a placeholder until it has, which is
/// one blank frame every time a widget is rebuilt with a different picture —
/// visible as a blink when Home's stage filter swaps the cards below it. Eleven
/// small pictures in two colours are cheap to keep, so they are parsed at
/// start-up and drawn synchronously from here.
abstract final class IllustrationCache {
  static final Map<(Art, int), PictureInfo> _pictures = {};
  static final Map<(Art, int), Future<void>> _loading = {};

  static PictureInfo? lookup(Art art, Color blob) =>
      _pictures[(art, blob.toARGB32())];

  /// Parses [arts] (all of them by default) for [blob]. Safe to call often:
  /// each picture is parsed once, and failures are left to SvgPicture.
  static Future<void> warm(Color blob, {Iterable<Art>? arts}) {
    final jobs = <Future<void>>[];
    for (final art in arts ?? Art.values) {
      final key = (art, blob.toARGB32());
      if (_pictures.containsKey(key)) continue;
      jobs.add(_loading.putIfAbsent(key, () async {
        try {
          final info = await vg.loadPicture(
            SvgAssetLoader(
              art.asset,
              colorMapper: blob == _blobMarker ? null : _BlobMapper(blob),
            ),
            null,
          );
          _pictures[key] = info;
        } catch (_) {
          // SvgPicture keeps drawing it the slow way; nothing is lost.
        } finally {
          _loading.remove(key);
        }
      }));
    }
    return Future.wait(jobs);
  }
}

class _PicturePainter extends CustomPainter {
  _PicturePainter(this.info, this.fit, this.alignment);

  final PictureInfo info;
  final BoxFit fit;
  final Alignment alignment;

  @override
  void paint(Canvas canvas, Size size) {
    final src = info.size;
    if (src.isEmpty || size.isEmpty) return;
    final fitted = applyBoxFit(fit, src, size);
    final dst = alignment.inscribe(fitted.destination, Offset.zero & size);
    final from = alignment.inscribe(fitted.source, Offset.zero & src);
    canvas
      ..save()
      ..clipRect(dst)
      ..translate(dst.left, dst.top)
      ..scale(dst.width / from.width, dst.height / from.height)
      ..translate(-from.left, -from.top)
      ..drawPicture(info.picture)
      ..restore();
  }

  @override
  bool shouldRepaint(_PicturePainter old) =>
      old.info != info || old.fit != fit || old.alignment != alignment;
}

/// Swaps the blob marker for the current appearance's blob colour.
///
/// Value-equal so that flutter_svg's cache, which keys on the mapper, holds
/// one picture per appearance rather than one per build.
@immutable
class _BlobMapper extends ColorMapper {
  const _BlobMapper(this.blob);

  final Color blob;

  @override
  Color substitute(
    String? id,
    String elementName,
    String attributeName,
    Color color,
  ) {
    if (color.toARGB32() == _blobMarker.toARGB32()) return blob;
    return color;
  }

  @override
  bool operator ==(Object other) => other is _BlobMapper && other.blob == blob;

  @override
  int get hashCode => blob.hashCode;
}
