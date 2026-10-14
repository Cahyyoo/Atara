/// The roles the server knows, each carrying its exact wire spelling.
///
/// The server is a super app now: a role belongs to a department (LAB or
/// EKSPLORASI), and SUPER_ADMIN to none. This app only needs the role -- the
/// operator, who is always in the lab -- so the department is not read here.
///
/// This used to be two values and a parser that read anything other than
/// `ADMIN` as an operator. With four roles that default would have been a
/// privilege: a DATABASE or ANALISIS account would have come back from storage
/// as an operator, and the operator is now the one role this app is for and the
/// one allowed to override the stage order. So the parse is exact, and a string
/// it does not know is refused rather than guessed at.
enum UserRole {
  superAdmin('SUPER_ADMIN'),
  admin('ADMIN'),
  database('DATABASE'),
  analisis('ANALISIS'),
  preparator('PREPARATOR');

  const UserRole(this.wire);

  /// What the server sends and what is written back to storage.
  final String wire;

  /// What the preparator was called before the role was renamed.
  ///
  /// Still read, never written: a phone signed in before the update has it in
  /// storage, and a server not yet migrated still sends it. Refusing it would
  /// sign every preparator out mid-shift for a change of name.
  static const legacyOperatorWire = 'OPERATOR';

  /// Null for anything that is not exactly one of these.
  static UserRole? tryParse(Object? value) {
    if (value == legacyOperatorWire) return preparator;
    for (final role in values) {
      if (role.wire == value) return role;
    }
    return null;
  }
}

class UserModel {
  final String id;
  final String name;
  final String email;
  final UserRole role;

  /// An administrator chose this password -- a new account, or a reset -- so
  /// it has to be replaced before the app can be used. Kept on the stored
  /// user so closing the app cannot shake the duty off; the server refuses
  /// everything but the change itself regardless.
  final bool mustChangePassword;

  const UserModel({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    this.mustChangePassword = false,
  });

  UserModel copyWith({bool? mustChangePassword}) {
    return UserModel(
      id: id,
      name: name,
      email: email,
      role: role,
      mustChangePassword: mustChangePassword ?? this.mustChangePassword,
    );
  }

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'] as String,
      name: json['name'] as String,
      email: json['email'] as String,
      role: _roleFrom(json['role']),
      mustChangePassword: json['mustChangePassword'] == true,
    );
  }

  /// Throws rather than defaulting, for the reason on [UserRole]. The one
  /// caller that reads a stored user already treats a throw as "not signed in".
  static UserRole _roleFrom(Object? value) {
    final role = UserRole.tryParse(value);
    if (role == null) throw FormatException('Unknown role', value);
    return role;
  }

  /// The same four fields, but refusing rather than throwing.
  ///
  /// The sign-in routes answer with two different `user` objects: a full one
  /// beside a token, and — when a second factor is owed — a stub carrying only
  /// `name`. [fromJson]'s casts are right for the first and fatal for the
  /// second, and a `TypeError` out of a parser is not something a caller can
  /// handle sensibly. This lets `LoginResult.parse` decide what an unusable
  /// shape means instead of being told by an exception from four frames down.
  static UserModel? tryFromJson(Object? json) {
    if (json is! Map) return null;
    final id = json['id'];
    final name = json['name'];
    final email = json['email'];
    final role = UserRole.tryParse(json['role']);
    if (id is! String || name is! String || email is! String || role == null) {
      return null;
    }
    return UserModel(id: id, name: name, email: email, role: role);
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'email': email,
      'role': role.wire,
      'mustChangePassword': mustChangePassword,
    };
  }
}
