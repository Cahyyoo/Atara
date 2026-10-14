import 'package:flutter_test/flutter_test.dart';

import 'package:atara/models/user_model.dart';

/// The role is parsed exactly, because the old default was a privilege.
///
/// Anything that was not `ADMIN` used to read as an operator. With four roles
/// that would have handed a DATABASE or ANALISIS account the one role this app
/// is for — and the one allowed to override the stage order.
void main() {
  Map<String, dynamic> json(Object? role) => {
    'id': 'u1',
    'name': 'Siti',
    'email': 'siti@atara.local',
    'role': role,
  };

  test('every role survives a round trip spelled exactly as sent', () {
    const expected = {
      'SUPER_ADMIN': UserRole.superAdmin,
      'ADMIN': UserRole.admin,
      'DATABASE': UserRole.database,
      'ANALISIS': UserRole.analisis,
      'PREPARATOR': UserRole.preparator,
    };
    expect(UserRole.values, hasLength(5));

    expected.forEach((wire, role) {
      final user = UserModel.fromJson(json(wire));
      expect(user.role, role);
      expect(
        user.toJson()['role'],
        wire,
        reason: 'stored as the server says it',
      );
      expect(UserModel.fromJson(user.toJson()).role, role);
      expect(UserModel.tryFromJson(json(wire))?.role, role);
    });
  });

  test('the old OPERATOR spelling still reads as the preparator', () {
    // A phone signed in before the rename has it in storage, and a server not
    // yet migrated still sends it. It is written back under the new name.
    final user = UserModel.fromJson(json('OPERATOR'));
    expect(user.role, UserRole.preparator);
    expect(user.toJson()['role'], 'PREPARATOR');
    expect(UserModel.tryFromJson(json('OPERATOR'))?.role, UserRole.preparator);
  });

  test('an unknown role is refused, never read as a preparator', () {
    for (final wire in ['AUDITOR', 'operator', 'Preparator', 'preparator', '', null, 7]) {
      expect(UserRole.tryParse(wire), isNull, reason: '$wire');
      expect(UserModel.tryFromJson(json(wire)), isNull, reason: '$wire');
      expect(
        () => UserModel.fromJson(json(wire)),
        throwsA(anything),
        reason: '$wire must not become a user',
      );
    }
    // The case the stored-session reader relies on: a string it does not know
    // is a FormatException, which SessionService.getUser already catches.
    expect(
      () => UserModel.fromJson(json('AUDITOR')),
      throwsA(isA<FormatException>()),
    );
  });
}
