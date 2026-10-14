import '../l10n/app_localizations.dart';
import '../models/sample_model.dart';
import '../models/user_model.dart';

/// The sample's status in the operator's own language.
///
/// This used to be a plain function on the model returning "Pending" /
/// "In Progress" / "Completed", hardcoded in English — and it was rendered on
/// every sample card, so an Indonesian operator read an English word on the one
/// screen they use all day. Presentation belongs beside the other text helpers,
/// where the localisations are in scope; the model keeps only the enum.
String sampleStatusText(AppLocalizations l10n, SampleStatus status) {
  switch (status) {
    case SampleStatus.pending:
      return l10n.statusPending;
    case SampleStatus.inProgress:
      return l10n.statusInProgress;
    case SampleStatus.completed:
      return l10n.statusCompleted;
  }
}

/// The account's role, for the badge on the home screen.
///
/// That badge showed the raw Dart enum name — `OPERATOR` — which is a detail of
/// how the app is written, not a word anyone chose to show someone.
///
/// Every role, although only an operator can be signed in here: the switch
/// is exhaustive so a fifth role is a compile error rather than a blank badge.
String userRoleText(AppLocalizations l10n, UserRole role) {
  return switch (role) {
    UserRole.superAdmin => l10n.roleSuperAdmin,
    UserRole.admin => l10n.roleAdmin,
    UserRole.database => l10n.roleDatabase,
    UserRole.analisis => l10n.roleAnalisis,
    UserRole.preparator => l10n.rolePreparator,
  };
}
