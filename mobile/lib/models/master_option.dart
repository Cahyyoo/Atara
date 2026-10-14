/// The five lists a Sample ID's coded parts are picked from, each carrying its
/// exact wire spelling.
enum MasterKind {
  place('PLACE'),
  rockType('ROCK_TYPE'),
  nonProd('NON_PROD'),
  sir('SIR'),
  pit('PIT');

  const MasterKind(this.wire);

  final String wire;

  static MasterKind? tryParse(Object? value) {
    for (final kind in values) {
      if (kind.wire == value) return kind;
    }
    return null;
  }
}

/// One code in a master list: "MOL" as a place, "LIM" as an ore class.
class MasterOption {
  final String id;
  final MasterKind kind;
  final String code;
  final String? label;
  final int sortOrder;
  final bool isActive;

  const MasterOption({
    required this.id,
    required this.kind,
    required this.code,
    this.label,
    this.sortOrder = 0,
    this.isActive = true,
  });

  /// Null for a row this build cannot read, such as a list it does not know.
  static MasterOption? tryFromJson(Object? json) {
    if (json is! Map) return null;
    final id = json['id'];
    final code = json['code'];
    final kind = MasterKind.tryParse(json['kind']);
    if (id is! String || code is! String || kind == null) return null;
    final sortOrder = json['sortOrder'];
    return MasterOption(
      id: id,
      kind: kind,
      code: code,
      label: json['label'] is String ? json['label'] as String : null,
      sortOrder: sortOrder is num ? sortOrder.toInt() : 0,
      isActive: json['isActive'] != false,
    );
  }
}

/// The rule a new code has to meet, the same one the server checks.
final RegExp masterCodePattern = RegExp(r'^[A-Za-z0-9-]{1,16}$');
