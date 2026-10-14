import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/master_option.dart';
import '../services/api_service.dart';

/// The five master lists a Sample ID is picked from, fetched once per session
/// and kept. Invalidated after a code is added from a picker, so every form
/// sees the new one.
final masterOptionsProvider = FutureProvider<List<MasterOption>>((ref) async {
  return ApiService.instance.getMasterOptions();
});

/// One list, in the order the website shows it: by sort order, then by code.
List<MasterOption> optionsOfKind(List<MasterOption> all, MasterKind kind) {
  final list = all.where((option) => option.kind == kind).toList()
    ..sort((a, b) {
      final byOrder = a.sortOrder.compareTo(b.sortOrder);
      return byOrder != 0 ? byOrder : a.code.compareTo(b.code);
    });
  return list;
}

/// The code an option id stands for, or null when it is unknown.
String? codeOf(List<MasterOption> all, String? id) {
  if (id == null) return null;
  for (final option in all) {
    if (option.id == id) return option.code;
  }
  return null;
}
