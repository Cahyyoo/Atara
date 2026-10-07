class StageModel {
  final String id;

  /// Stable key the translations hang on; null on a stage that has none.
  final String? key;

  /// The stored wording, shown wherever no translation covers the key.
  final String name;
  final int sequenceOrder;
  final String? description;

  const StageModel({
    required this.id,
    this.key,
    required this.name,
    required this.sequenceOrder,
    this.description,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'key': key,
      'name': name,
      'sequenceOrder': sequenceOrder,
      'description': description,
    };
  }

  factory StageModel.fromJson(Map<String, dynamic> json) {
    return StageModel(
      id: json['id'] as String,
      // Absent in anything an older build cached, which must still read.
      key: json['key'] as String?,
      name: json['name'] as String,
      sequenceOrder: json['sequenceOrder'] as int,
      description: json['description'] as String?,
    );
  }
}
