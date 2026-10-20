// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get tabHome => 'Home';

  @override
  String get tabScan => 'Scan';

  @override
  String get statusPending => 'Pending';

  @override
  String get statusInProgress => 'In Progress';

  @override
  String get statusCompleted => 'Completed';

  @override
  String get roleSuperAdmin => 'Super Admin';

  @override
  String get roleAdmin => 'Administrator';

  @override
  String get rolePreparator => 'Preparator';

  @override
  String get roleDatabase => 'Database';

  @override
  String get roleAnalisis => 'Analyst';

  @override
  String get cameraBlockedTitle => 'The camera is unavailable';

  @override
  String get cameraBlockedBody =>
      'Camera access has not been granted, so barcodes cannot be scanned. You can still type the code.';

  @override
  String get openAppSettings => 'Open App Settings';

  @override
  String get scanTitle => 'Scan';

  @override
  String get signOutSection => 'Account';

  @override
  String get historyTitle => 'History';

  @override
  String historySeeAll(Object count) {
    return 'See all ($count)';
  }

  @override
  String get historyEmpty =>
      'No stages have been recorded for this sample yet.';

  @override
  String get historyCorrection => 'Correction';

  @override
  String get historyUnknownOnCache =>
      'History is not stored on the phone. Connect to the server to see it.';

  @override
  String get overrideTitle => 'Out of stage order';

  @override
  String get overrideBody =>
      'This stage does not follow the current one. You may override that, but the reason has to be recorded.';

  @override
  String get overrideReason => 'Reason for the correction';

  @override
  String get overrideReasonHint => 'e.g. mis-scan, labels swapped';

  @override
  String get overrideReasonTooShort =>
      'The reason must be at least 5 characters.';

  @override
  String get continuousMode => 'Continuous scan';

  @override
  String continuousRecorded(Object count) {
    return '$count recorded';
  }

  @override
  String get workflowComplete => 'This sample has completed every stage.';

  @override
  String get detailTitle => 'Sample Detail';

  @override
  String seeAll(Object count) {
    return 'See all ($count)';
  }

  @override
  String queueSeeAll(Object count) {
    return 'See the whole queue ($count)';
  }

  @override
  String get myWorkAllTitle => 'My Work';

  @override
  String get queueAllTitle => 'Queue';

  @override
  String get queueEmptyTitle => 'Nothing left to send';

  @override
  String get queueEmptyMessage =>
      'Every scan on this device has reached the server.';

  @override
  String get appTitle => 'Atara Preparator';

  @override
  String get loginSubtitle => 'Sign in to start scanning nickel samples';

  @override
  String get email => 'Email';

  @override
  String get password => 'Password';

  @override
  String get signIn => 'Sign In';

  @override
  String get signOut => 'Sign Out';

  @override
  String get signOutConfirm => 'Sign out of this account?';

  @override
  String get cancel => 'Cancel';

  @override
  String get retry => 'Retry';

  @override
  String get discard => 'Discard';

  @override
  String get save => 'Save';

  @override
  String get scanButton => 'Scan Sample Barcode';

  @override
  String get scanHint =>
      'Point the camera at the barcode/QR on the sample label';

  @override
  String get selectNextStage => 'Select Next Stage';

  @override
  String get fieldNotes => 'Field Notes (Optional)';

  @override
  String get fieldNotesHint =>
      'e.g. Sample is in good condition, normal moisture level.';

  @override
  String get saveAndUpdate => 'Save & Update Stage';

  @override
  String sampleIdent(Object ident) {
    return 'Sample ID: $ident';
  }

  @override
  String currentStage(Object stage) {
    return 'Current stage: $stage';
  }

  @override
  String status(Object status) {
    return 'Status: $status';
  }

  @override
  String get notStarted => 'Not Started';

  @override
  String pendingTitle(Object count) {
    return 'Waiting to send ($count)';
  }

  @override
  String get pendingDescription =>
      'Saved on this device; they will be sent when the network is back.';

  @override
  String get syncNow => 'Send now';

  @override
  String get savedOffline =>
      'No network. The scan was saved and will be sent automatically.';

  @override
  String syncedCount(Object count) {
    return '$count scan(s) sent.';
  }

  @override
  String failedTitle(Object count) {
    return 'Failed to sync ($count)';
  }

  @override
  String get failedDescription =>
      'Refused by the server. Check the reason, then retry or discard.';

  @override
  String get settingsTitle => 'Settings';

  @override
  String get serverAddress => 'Server address';

  @override
  String get serverAddressHint => 'http://192.168.1.10:3000/api';

  @override
  String get serverAddressHelp =>
      'Change this when the app is used at another site or network.';

  @override
  String get appearance => 'Appearance';

  @override
  String get appearanceSystem => 'Follow System';

  @override
  String get appearanceLight => 'Light';

  @override
  String get appearanceDark => 'Dark';

  @override
  String get language => 'Language';

  @override
  String get settingsSaved => 'Settings saved.';

  @override
  String get resetDefault => 'Reset to default';

  @override
  String get connectionTimeout =>
      'Connection timed out. Check your network and try again.';

  @override
  String get connectionFailed =>
      'Could not reach the server. Please check your network connection.';

  @override
  String get unknownError => 'An unknown error occurred. Please try again.';

  @override
  String get sampleNotRegistered => 'Sample Not Registered';

  @override
  String get unexpectedError => 'An unexpected error occurred.';

  @override
  String get emailRequired => 'Email is required';

  @override
  String get passwordRequired => 'Password is required';

  @override
  String get scanScreenTitle => 'Scan Sample Barcode';

  @override
  String sampleNotFoundBody(Object code) {
    return 'Code \"$code\" was not found in the database. Make sure the scanned barcode is valid.';
  }

  @override
  String get scanAgain => 'Scan Again';

  @override
  String get loadFailed => 'Failed to load sample data.';

  @override
  String get tryAgain => 'Try Again';

  @override
  String get updateSuccessful => 'Update Successful';

  @override
  String stageSaved(Object stage) {
    return 'Stage \"$stage\" has been saved.';
  }

  @override
  String get stageListEmpty =>
      'No stages are configured on the server. Contact an administrator.';

  @override
  String get stageListFailed =>
      'Failed to load the stage list. Please check your network connection.';

  @override
  String get errorTimeout =>
      'The connection timed out. Check your network and try again.';

  @override
  String get errorUnreachable =>
      'Could not reach the server. Please check your network connection.';

  @override
  String get serverAddressInvalid =>
      'Not a valid address. Use the form http://host:port/api.';

  @override
  String triedServerAddress(Object address) {
    return 'Tried: $address';
  }

  @override
  String get manualEntry => 'Enter code manually';

  @override
  String get manualEntryTitle => 'Enter Sample Code';

  @override
  String get manualEntryHelp =>
      'Use this when the camera is unavailable or the label is damaged.';

  @override
  String get manualEntryRequired => 'A sample code is required.';

  @override
  String get manualEntryContinue => 'Continue';

  @override
  String get offlineUnknownTitle => 'This sample is not stored on the phone';

  @override
  String get offlineUnknownBody =>
      'There is no signal, so the current stage is unknown. You can still record a stage — the server will check the order when it is sent.';

  @override
  String get cachedNotice =>
      'Stored on this phone; the stage may have moved on since.';

  @override
  String get scanHistoryTitle => 'Scan History';

  @override
  String get scanHistoryOpen => 'See scan history';

  @override
  String get scanHistoryToday => 'Today';

  @override
  String get scanHistoryYesterday => 'Yesterday';

  @override
  String get scanHistoryEmptyTitle => 'No history yet';

  @override
  String get scanHistoryEmptyBody =>
      'Scans you send appear here, grouped by shift day.';

  @override
  String get scanHistoryCachedNotice =>
      'Stored on the phone; without a signal only this shift can be shown.';

  @override
  String get scanHistoryOlderOffline =>
      'Earlier days need a connection to the server.';

  @override
  String get scanHistoryLoadMore => 'Load more';

  @override
  String get scanHistoryLoadMoreFailed => 'Could not load the rest.';

  @override
  String get scanHistoryWindow => 'History covers the last 90 shift days.';

  @override
  String get myWorkTitle => 'My Work';

  @override
  String myWorkSummary(int count) {
    return '$count sample(s) this shift';
  }

  @override
  String get myWorkEmpty => 'No scans yet on this shift.';

  @override
  String get emailHint => 'name@atara.local';

  @override
  String get passwordHint => 'Your password';

  @override
  String get checkServerAddress => 'Check the server address';

  @override
  String get sameLabelIgnored =>
      'Same label ignored. Point at a different one.';

  @override
  String get scanThisAgain => 'Scan it again';

  @override
  String get stageReceived => 'RECEIVED';

  @override
  String get stageWetPrep => 'WET PREP';

  @override
  String get stageDryPrep => 'DRY PREP';

  @override
  String get stageAnalysis => 'ANALYSIS';

  @override
  String get stageReport => 'REPORT';

  @override
  String get onboardingTitle => 'Quick Guide';

  @override
  String get onboardingSkip => 'Skip';

  @override
  String get onboardingNext => 'Next';

  @override
  String get onboardingStart => 'Get Started';

  @override
  String get onboardingDone => 'Done';

  @override
  String onboardingPageOf(int current, int total) {
    return 'Page $current of $total';
  }

  @override
  String get onboardingWelcomeBody =>
      'A short guide before you start scanning samples.';

  @override
  String get onboardingScanTitle => 'Scan the sample label';

  @override
  String get onboardingScanBody =>
      'Point the camera at the barcode or QR on the sample label. If the label is damaged, you can type the code instead.';

  @override
  String get onboardingStageTitle => 'Move it to the next stage';

  @override
  String get onboardingStageBody =>
      'Once the sample is read, pick the next stage and save. Add field notes when they are worth recording.';

  @override
  String get onboardingOfflineTitle => 'It keeps working offline';

  @override
  String get onboardingOfflineBody =>
      'Scans are saved on the phone when the network drops, then sent on their own as soon as it is back.';

  @override
  String get onboardingWorkTitle => 'See what you have done';

  @override
  String get onboardingWorkBody =>
      'Home tallies the samples you scanned this shift, with the history of each one.';

  @override
  String get helpSection => 'Guide';

  @override
  String get onboardingReopen => 'See the guide again';

  @override
  String get onboardingReopenHelp => 'Replay the five-step guide at any time.';

  @override
  String get errorUnreadableAnswer =>
      'The server answered in a form the app does not recognise. Check the server address or contact an administrator.';

  @override
  String get signInPreparatorsOnly =>
      'This app is for Preparators. Please use the website.';

  @override
  String get errorForbidden =>
      'Your account\'s role does not allow this. This app is for Preparators.';

  @override
  String get mfaTitle => 'Verify It\'s You';

  @override
  String get mfaStepLabel => 'Step 2 of 2';

  @override
  String mfaGreeting(String name) {
    return 'Hello, $name';
  }

  @override
  String get mfaChooseSubtitle => 'Choose how to verify to finish signing in.';

  @override
  String get mfaMethodFace => 'Face verification';

  @override
  String get mfaMethodFaceHint => 'Face the camera and blink once';

  @override
  String get mfaMethodTotp => 'Authenticator code';

  @override
  String get mfaMethodTotpHint => '6-digit code from your authenticator app';

  @override
  String get mfaMethodSetup => 'Set up Authenticator';

  @override
  String get mfaMethodSetupHint => 'Connect an authenticator app on this phone';

  @override
  String get mfaUseAnotherMethod => 'Use another method';

  @override
  String get mfaBackToPassword => 'Back to password';

  @override
  String mfaExpiresIn(int seconds) {
    return 'Valid for $seconds more seconds';
  }

  @override
  String get mfaExpiredTitle => 'That sign-in attempt has expired';

  @override
  String get mfaExpiredBody =>
      'The two-minute window has passed. Enter your password again to start over.';

  @override
  String get mfaStartAgain => 'Start again';

  @override
  String get mfaTotpSubtitle =>
      'Open your authenticator app and enter the 6-digit code for your ATARA account.';

  @override
  String get mfaCodeLabel => '6-digit code';

  @override
  String get mfaCodeHint => 'Type the 6 digits';

  @override
  String get mfaVerify => 'Verify';

  @override
  String get mfaVerified => 'Code accepted. Signing in…';

  @override
  String get mfaCodeIncomplete => 'The code is six digits.';

  @override
  String get mfaCodeWrong =>
      'That code is wrong or was already used. Wait for the next code and try again.';

  @override
  String get mfaSetupTitle => 'Set up Authenticator';

  @override
  String get mfaSetupIntro =>
      'Add this account to an authenticator app on this phone, then enter the code it shows.';

  @override
  String get mfaSetupManualSteps =>
      'In your authenticator app: tap +, choose “Other account”, then “Enter key manually”.';

  @override
  String get mfaSetupAccountLabel => 'Account name';

  @override
  String get mfaSetupKeyLabel => 'Secret key';

  @override
  String get mfaSetupCopyKey => 'Copy key';

  @override
  String get mfaSetupKeyCopied => 'Key copied.';

  @override
  String get mfaSetupKeyWarning => 'This key is shown only once.';

  @override
  String get mfaSetupLoading => 'Preparing the key…';

  @override
  String get mfaSetupUnavailable =>
      'No Authenticator setup is waiting for this account. Contact an administrator.';

  @override
  String get mfaSetupCodeTitle => 'Enter the code';

  @override
  String get mfaSetupCodeHint =>
      'Type the 6-digit code your authenticator app shows for your ATARA account.';

  @override
  String get mfaEnrolled => 'Authenticator connected. Signing in…';

  @override
  String get mfaTooManyAttempts =>
      'Too many attempts. Wait a few minutes, then sign in again.';

  @override
  String get mfaUnsupportedMethod =>
      'This account uses a verification method the app does not support yet. Finish signing in on the website.';

  @override
  String get overrideNotesReplaced =>
      'On a correction the reason above is recorded as the note. Field notes are not sent.';

  @override
  String get mfaFaceTitle => 'Face check';

  @override
  String get mfaFaceSubtitle => 'Look at the camera and blink once.';

  @override
  String get mfaFaceBlinkNow => 'Blink now';

  @override
  String get mfaFaceChecking => 'Checking…';

  @override
  String get mfaFaceVerified => 'Face matched. Signing in…';

  @override
  String get faceNoFace =>
      'No face detected. Check the lighting and try again.';

  @override
  String get faceNotAlive =>
      'No blink seen. Look at the camera and blink once.';

  @override
  String get faceQualityUnsure =>
      'The face is not clear yet. Look straight at the camera.';

  @override
  String get faceQualityTooFar => 'Too far away. Move closer to the camera.';

  @override
  String get faceQualityTooClose => 'Too close. Move back a little.';

  @override
  String get faceQualityOffCentre => 'Centre your face inside the outline.';

  @override
  String get faceQualityTooDark => 'Too dark. Add light or turn towards it.';

  @override
  String get faceServiceDown =>
      'Face recognition is temporarily unavailable. Contact an administrator.';

  @override
  String get faceMismatch => 'That face did not match this account.';

  @override
  String get faceCameraDenied =>
      'Camera access has not been granted, so face verification cannot run.';

  @override
  String get sessionReplaced =>
      'Your account was opened on another phone, so you were signed out here.';

  @override
  String sessionReplacedAt(String time) {
    return 'Your account was opened on another phone at $time, so you were signed out here.';
  }

  @override
  String sessionReplacedOnAt(String device, String time) {
    return 'Your account was opened on another phone ($device) at $time, so you were signed out here.';
  }

  @override
  String get sessionReplacedElsewhere =>
      'Your account was opened on another device, so you were signed out on this phone.';

  @override
  String sessionReplacedElsewhereAt(String time) {
    return 'Your account was opened on another device at $time, so you were signed out on this phone.';
  }

  @override
  String get sessionReplacedDevice => 'Device';

  @override
  String get sessionReplacedSystem => 'System';

  @override
  String get sessionReplacedBrowser => 'Browser';

  @override
  String get sessionReplacedApp => 'App';

  @override
  String get sessionReplacedModel => 'Model';

  @override
  String get deviceKindPhone => 'Phone';

  @override
  String get deviceKindComputer => 'Computer';

  @override
  String get deviceKindTablet => 'Tablet';

  @override
  String get changePasswordTitle => 'Change Password';

  @override
  String get changePasswordBody =>
      'Choose a new password for your account. Every other device signed in will be signed out.';

  @override
  String get changePasswordForcedBody =>
      'Your password was set by an administrator and is shared. Replace it before using the app.';

  @override
  String get changePasswordSubmit => 'Save Password';

  @override
  String get passwordCurrent => 'Current password';

  @override
  String get passwordNew => 'New password';

  @override
  String get passwordConfirm => 'Confirm new password';

  @override
  String passwordRuleHint(int min) {
    return 'At least $min characters, and not the role\'s default.';
  }

  @override
  String get passwordCurrentRequired => 'Enter your current password.';

  @override
  String passwordTooShort(int min) {
    return 'The new password must be at least $min characters.';
  }

  @override
  String get passwordMismatch => 'The two new passwords do not match.';

  @override
  String get passwordSameAsCurrent =>
      'The new password must be different from the current one.';

  @override
  String get passwordCurrentWrong => 'That is not your current password.';

  @override
  String get passwordIsRoleDefault =>
      'That is your role\'s default password. Choose one of your own.';

  @override
  String get passwordTooManyAttempts =>
      'Too many attempts. Please wait a few minutes.';

  @override
  String get passwordChanged => 'Password changed.';

  @override
  String get sessionEndedByAdmin =>
      'An administrator ended your session, so you were signed out on this phone.';

  @override
  String sessionEndedByAdminAt(String time) {
    return 'An administrator ended your session at $time, so you were signed out on this phone.';
  }

  @override
  String get sessionEndedPasswordChanged =>
      'This account\'s password was changed, so you were signed out on this phone.';

  @override
  String sessionEndedPasswordChangedAt(String time) {
    return 'This account\'s password was changed at $time, so you were signed out on this phone.';
  }

  @override
  String get announcementDismiss => 'Dismiss announcement';

  @override
  String get barcodeInfoTitle => 'Barcode Info';

  @override
  String get labCodeLabel => 'Lab Code';

  @override
  String get identityPlace => 'Place';

  @override
  String get identityRockType => 'Ore Class';

  @override
  String get identityNonProd => 'Non-Production Code';

  @override
  String get identitySir => 'Sir (Field Stockpile)';

  @override
  String get identityPit => 'Pit Location';

  @override
  String get identityBargingNo => 'Barging Run';

  @override
  String get identitySequenceNo => 'Sample No.';

  @override
  String get identitySampleNo => 'Quality No.';

  @override
  String get identitySackCount => 'Sacks';

  @override
  String get identityCodesUnavailable =>
      'The code lists couldn\'t be loaded, so the parts aren\'t shown.';

  @override
  String get noSampleIdYet => 'This barcode has no Sample ID yet.';

  @override
  String get fillSampleId => 'Fill in Sample ID';

  @override
  String get editSampleId => 'Edit Sample ID';

  @override
  String get sampleIdPreviewTitle => 'Sample ID to be saved';

  @override
  String get sampleIdNeedsPlace => 'Choose a Place to build the Sample ID.';

  @override
  String sampleIdWas(String ident) {
    return 'Was: $ident';
  }

  @override
  String get sampleIdChecking => 'Checking…';

  @override
  String sampleIdClash(String sampleCode) {
    return 'This Sample ID is already used by $sampleCode.';
  }

  @override
  String get sampleIdUnchanged => 'Nothing changed yet.';

  @override
  String get sampleIdSave => 'Save Sample ID';

  @override
  String get sampleIdSaved => 'Sample ID saved';

  @override
  String get sampleIdOnlineOnly =>
      'The Sample ID is saved straight to the server, so it needs a connection.';

  @override
  String get pickerNone => '— none —';

  @override
  String get pickerChoose => 'Choose…';

  @override
  String get pickerSearch => 'Search or type a new code';

  @override
  String get pickerClear => 'Clear';

  @override
  String pickerCreate(String code) {
    return 'Create \"$code\"';
  }

  @override
  String get pickerRetired => 'retired';

  @override
  String get pickerNoMatch => 'No matching codes.';

  @override
  String get pickerCodeRule =>
      'New code: letters, digits or hyphens, up to 16.';

  @override
  String pickerCreateFailed(String reason) {
    return 'Couldn\'t create the code: $reason';
  }

  @override
  String numberOutOfRange(int max) {
    return 'Enter a whole number from 0 to $max.';
  }

  @override
  String get bargingTooLong => 'At most 32 characters.';

  @override
  String get todoTitle => 'Waiting Work';

  @override
  String get todoEmpty => 'No samples are waiting.';

  @override
  String get todoFooter =>
      'Samples sitting in each stage, waiting to be moved to the next one.';

  @override
  String todoCount(int count) {
    return '$count samples';
  }

  @override
  String todoOverdue(int count) {
    return '$count past SLA';
  }

  @override
  String todoStageFooter(int shown, int total) {
    return 'Showing $shown of $total samples, longest waiting first.';
  }

  @override
  String todoWaitingHours(String hours) {
    return '$hours h';
  }

  @override
  String get todoNoSampleId => 'No Sample ID yet';

  @override
  String get sampleIdRequired =>
      'Fill in the Sample ID before updating the stage.';

  @override
  String get sampleIdRequiredOffline =>
      'This sample has no Sample ID yet, and filling it in needs a connection.';

  @override
  String get scanModeUpdate => 'Update Stage';

  @override
  String get scanModeCheck => 'Check Barcode';

  @override
  String get checkHasIdent => 'Has a Sample ID';

  @override
  String get checkNotRegistered => 'Barcode not registered';

  @override
  String get checkOffline => 'Can\'t check without a connection';

  @override
  String get checkOpen => 'Tap to open';

  @override
  String get checkDismiss => 'Close';

  @override
  String get checkLabCode => 'Lab Code';

  @override
  String get checkBarcode => 'Barcode';

  @override
  String get checkSampleId => 'Sample ID';

  @override
  String get checkIdentHiddenValue => 'Hidden by the lab admin';

  @override
  String get checkTapToFill => 'Tap to fill in the Sample ID';

  @override
  String get splashTagline => 'Every sample tracked, prep to report';

  @override
  String get loginHeaderSubtitle => 'Lab samples,\nkept on track.';

  @override
  String get loginWelcome => 'Welcome Back';

  @override
  String get emailInvalid => 'That email doesn\'t look right';

  @override
  String get forgotPassword => 'Forgot password?';

  @override
  String get forgotPasswordTitle => 'Forgot password';

  @override
  String get forgotPasswordBody =>
      'Passwords are reset by the lab admin. Ask them, then sign in with the temporary password they give you.';

  @override
  String get understood => 'Got it';

  @override
  String get loginOr => 'or';

  @override
  String get serverSettings => 'Server settings';

  @override
  String get noAccount => 'No account yet?';

  @override
  String get askAdmin => 'Ask the admin';

  @override
  String get bannerTitle => 'Ready to scan samples?';

  @override
  String get bannerBody => 'Point the camera at the label\'s barcode.';

  @override
  String get bannerAction => 'Start scanning';

  @override
  String get stagesTitle => 'Stages';

  @override
  String get stageAllChip => 'All';

  @override
  String get attentionTitle => 'Needs attention';

  @override
  String get seeAllPlain => 'See all';

  @override
  String get tabHistory => 'History';

  @override
  String get tabQueue => 'Queue';

  @override
  String get tabSettings => 'Settings';

  @override
  String get announcementsOpen => 'Open announcements';

  @override
  String get waitingInStage => 'waiting';

  @override
  String get pendingCardsTitle => 'Not sent yet';

  @override
  String get myWorkGridTitle => 'My work';

  @override
  String get refresh => 'Refresh';
}
