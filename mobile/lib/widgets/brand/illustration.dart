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
