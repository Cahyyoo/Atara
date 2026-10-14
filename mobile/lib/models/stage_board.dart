/// Where every live sample is right now, one column per stage: the same data
/// the lab's wall monitor shows (`GET /samples/board`). On the phone it is the
/// to-do list: what is sitting in each stage, waiting to be moved on.
class StageBoard {
  final DateTime generatedAt;
  final int slaHours;
  final List<BoardColumn> columns;

  const StageBoard({
    required this.generatedAt,
    required this.slaHours,
    required this.columns,
  });

  /// The stages something can still be waiting in, with anything in them.
  ///
  /// The last column is what finished in the past day — done, not to do.
  List<BoardColumn> get waiting =>
      columns.where((column) => !column.isDone && column.count > 0).toList();

  factory StageBoard.fromJson(Map<String, dynamic> json) {
    final raw = json['columns'];
    return StageBoard(
      generatedAt:
          DateTime.tryParse(json['generatedAt'] as String? ?? '') ??
          DateTime.now(),
      slaHours: (json['slaHours'] as num?)?.toInt() ?? 24,
      columns: raw is List
          ? raw
                .whereType<Map<String, dynamic>>()
                .map(BoardColumn.fromJson)
                .toList(growable: false)
          : const [],
    );
  }

  Map<String, dynamic> toJson() => {
    'generatedAt': generatedAt.toIso8601String(),
    'slaHours': slaHours,
    'columns': columns.map((column) => column.toJson()).toList(),
  };
}

class BoardColumn {
  final String id;
  final bool isDone;
  final String? stageKey;
  final String? stageName;

  /// Every sample in the stage; [cards] is capped by the server.
  final int count;
  final int overdue;
  final List<BoardCard> cards;

  const BoardColumn({
    required this.id,
    required this.isDone,
    required this.stageKey,
    required this.stageName,
    required this.count,
    required this.overdue,
    required this.cards,
  });

  factory BoardColumn.fromJson(Map<String, dynamic> json) {
    final raw = json['cards'];
    return BoardColumn(
      id: json['id'] as String,
      isDone: json['kind'] == 'done',
      stageKey: json['stageKey'] as String?,
      stageName: json['stageName'] as String?,
      count: (json['count'] as num?)?.toInt() ?? 0,
      overdue: (json['overdue'] as num?)?.toInt() ?? 0,
      cards: raw is List
          ? raw
                .whereType<Map<String, dynamic>>()
                .map(BoardCard.fromJson)
                .toList(growable: false)
          : const [],
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'kind': isDone ? 'done' : 'stage',
    'stageKey': stageKey,
    'stageName': stageName,
    'count': count,
    'overdue': overdue,
    'cards': cards.map((card) => card.toJson()).toList(),
  };
}

/// One sample waiting in a stage, longest-waiting first.
class BoardCard {
  final String sampleCode;
  final String? labCode;
  final String? sampleIdent;
  final DateTime since;
  final double hours;
  final bool overdue;

  const BoardCard({
    required this.sampleCode,
    required this.labCode,
    required this.sampleIdent,
    required this.since,
    required this.hours,
    required this.overdue,
  });

  factory BoardCard.fromJson(Map<String, dynamic> json) {
    return BoardCard(
      sampleCode: json['sampleCode'] as String,
      labCode: json['labCode'] as String?,
      sampleIdent: json['sampleIdent'] as String?,
      since:
          DateTime.tryParse(json['since'] as String? ?? '') ?? DateTime.now(),
      hours: (json['hours'] as num?)?.toDouble() ?? 0,
      overdue: json['overdue'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
    'sampleCode': sampleCode,
    'labCode': labCode,
    'sampleIdent': sampleIdent,
    'since': since.toIso8601String(),
    'hours': hours,
    'overdue': overdue,
  };
}
