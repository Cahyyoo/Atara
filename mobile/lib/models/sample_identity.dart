/// The nine parts a Sample ID is composed from, as the sample's lab record
/// holds them, plus the record's own Lab Code.
///
/// The five pickers are master-option ids, not codes: the server sends ids,
/// and the codes are looked up in the master list (MasterOption) when they are
/// shown. That keeps a renamed code from going stale here.
class SampleIdentity {
  final String labRecordId;
  final String labCode;
  final String? placeId;
  final String? rockTypeId;
  final String? nonProdId;
  final String? pitId;
  final String? sirId;
  final String? bargingNo;
  final int? sequenceNo;
  final int? sampleNo;
  final int? sackCount;

  const SampleIdentity({
    required this.labRecordId,
    required this.labCode,
    this.placeId,
    this.rockTypeId,
    this.nonProdId,
    this.pitId,
    this.sirId,
    this.bargingNo,
    this.sequenceNo,
    this.sampleNo,
    this.sackCount,
  });

  /// Null unless this is a whole lab record.
  ///
  /// The scan reply nests a cut-down record -- Lab Code and Sample ID only --
  /// and reading that as an identity would claim every part is empty. Without
  /// the record's id it is not one, so it is not read as one.
  static SampleIdentity? tryFromJson(Object? json) {
    if (json is! Map) return null;
    final id = json['id'];
    final labCode = json['labCode'];
    if (id is! String || labCode is! String) return null;

    String? text(String key) =>
        json[key] is String ? json[key] as String : null;
    int? number(String key) {
      final value = json[key];
      return value is num ? value.toInt() : null;
    }

    return SampleIdentity(
      labRecordId: id,
      labCode: labCode,
      placeId: text('placeId'),
      rockTypeId: text('rockTypeId'),
      nonProdId: text('nonProdId'),
      pitId: text('pitId'),
      sirId: text('sirId'),
      bargingNo: text('bargingNo'),
      sequenceNo: number('sequenceNo'),
      sampleNo: number('sampleNo'),
      sackCount: number('sackCount'),
    );
  }

  /// The nine parts as the identity endpoint takes them. Every key is sent,
  /// a null one included: null clears a part, where a missing key would keep it.
  Map<String, dynamic> toPayload() {
    return {
      'placeId': placeId,
      'rockTypeId': rockTypeId,
      'nonProdId': nonProdId,
      'pitId': pitId,
      'sirId': sirId,
      'bargingNo': bargingNo,
      'sequenceNo': sequenceNo,
      'sampleNo': sampleNo,
      'sackCount': sackCount,
    };
  }

  Map<String, dynamic> toJson() {
    return {
      'id': labRecordId,
      'labCode': labCode,
      'placeId': placeId,
      'rockTypeId': rockTypeId,
      'nonProdId': nonProdId,
      'pitId': pitId,
      'sirId': sirId,
      'bargingNo': bargingNo,
      'sequenceNo': sequenceNo,
      'sampleNo': sampleNo,
      'sackCount': sackCount,
    };
  }
}

/// What the server says about an identity: the Sample ID it composes, whether
/// that changes anything, and the sample already holding it, if one does.
class IdentityCheck {
  final String? sampleIdent;
  final bool changed;

  /// The barcode of the sample already holding [sampleIdent], or null when it
  /// is free. A save is refused while this is set.
  final String? clashSampleCode;

  /// The record as it stands after the call: unchanged on a dry run.
  final SampleIdentity? identity;

  const IdentityCheck({
    required this.sampleIdent,
    required this.changed,
    required this.clashSampleCode,
    required this.identity,
  });

  factory IdentityCheck.fromJson(Map<String, dynamic> json) {
    final clash = json['clash'];
    return IdentityCheck(
      sampleIdent: json['sampleIdent'] as String?,
      changed: json['changed'] == true,
      clashSampleCode: clash is Map ? clash['sampleCode'] as String? : null,
      identity: SampleIdentity.tryFromJson(json['labRecord']),
    );
  }
}
