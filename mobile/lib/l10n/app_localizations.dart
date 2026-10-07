import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_id.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('id'),
  ];

  /// No description provided for @tabHome.
  ///
  /// In id, this message translates to:
  /// **'Beranda'**
  String get tabHome;

  /// No description provided for @tabScan.
  ///
  /// In id, this message translates to:
  /// **'Pindai'**
  String get tabScan;

  /// No description provided for @statusPending.
  ///
  /// In id, this message translates to:
  /// **'Menunggu'**
  String get statusPending;

  /// No description provided for @statusInProgress.
  ///
  /// In id, this message translates to:
  /// **'Berjalan'**
  String get statusInProgress;

  /// No description provided for @statusCompleted.
  ///
  /// In id, this message translates to:
  /// **'Selesai'**
  String get statusCompleted;

  /// No description provided for @roleAdmin.
  ///
  /// In id, this message translates to:
  /// **'Administrator'**
  String get roleAdmin;

  /// No description provided for @roleOperator.
  ///
  /// In id, this message translates to:
  /// **'Operator'**
  String get roleOperator;

  /// No description provided for @roleDatabase.
  ///
  /// In id, this message translates to:
  /// **'Database'**
  String get roleDatabase;

  /// No description provided for @roleAnalisis.
  ///
  /// In id, this message translates to:
  /// **'Analisis'**
  String get roleAnalisis;

  /// No description provided for @cameraBlockedTitle.
  ///
  /// In id, this message translates to:
  /// **'Kamera tidak dapat digunakan'**
  String get cameraBlockedTitle;

  /// No description provided for @cameraBlockedBody.
  ///
  /// In id, this message translates to:
  /// **'Izin kamera belum diberikan, jadi barcode tidak bisa dipindai. Anda tetap dapat mengetik kodenya.'**
  String get cameraBlockedBody;

  /// No description provided for @openAppSettings.
  ///
  /// In id, this message translates to:
  /// **'Buka Pengaturan Aplikasi'**
  String get openAppSettings;

  /// No description provided for @scanTitle.
  ///
  /// In id, this message translates to:
  /// **'Pindai'**
  String get scanTitle;

  /// No description provided for @signOutSection.
  ///
  /// In id, this message translates to:
  /// **'Akun'**
  String get signOutSection;

  /// No description provided for @historyTitle.
  ///
  /// In id, this message translates to:
  /// **'Riwayat'**
  String get historyTitle;

  /// No description provided for @historySeeAll.
  ///
  /// In id, this message translates to:
  /// **'Lihat semua ({count})'**
  String historySeeAll(Object count);

  /// No description provided for @historyEmpty.
  ///
  /// In id, this message translates to:
  /// **'Belum ada tahap yang tercatat untuk sampel ini.'**
  String get historyEmpty;

  /// No description provided for @historyCorrection.
  ///
  /// In id, this message translates to:
  /// **'Koreksi'**
  String get historyCorrection;

  /// No description provided for @historyUnknownOnCache.
  ///
  /// In id, this message translates to:
  /// **'Riwayat tidak tersimpan di HP. Sambungkan ke server untuk melihatnya.'**
  String get historyUnknownOnCache;

  /// No description provided for @overrideTitle.
  ///
  /// In id, this message translates to:
  /// **'Melanggar urutan tahap'**
  String get overrideTitle;

  /// No description provided for @overrideBody.
  ///
  /// In id, this message translates to:
  /// **'Tahap ini bukan lanjutan dari tahap sekarang. Anda boleh menimpanya, tapi alasannya wajib dicatat.'**
  String get overrideBody;

  /// No description provided for @overrideReason.
  ///
  /// In id, this message translates to:
  /// **'Alasan koreksi'**
  String get overrideReason;

  /// No description provided for @overrideReasonHint.
  ///
  /// In id, this message translates to:
  /// **'mis. salah pindai, label tertukar'**
  String get overrideReasonHint;

  /// No description provided for @overrideReasonTooShort.
  ///
  /// In id, this message translates to:
  /// **'Alasan minimal 5 karakter.'**
  String get overrideReasonTooShort;

  /// No description provided for @continuousMode.
  ///
  /// In id, this message translates to:
  /// **'Pindai beruntun'**
  String get continuousMode;

  /// No description provided for @continuousRecorded.
  ///
  /// In id, this message translates to:
  /// **'{count} tercatat'**
  String continuousRecorded(Object count);

  /// No description provided for @workflowComplete.
  ///
  /// In id, this message translates to:
  /// **'Sampel ini sudah menyelesaikan seluruh tahap.'**
  String get workflowComplete;

  /// No description provided for @detailTitle.
  ///
  /// In id, this message translates to:
  /// **'Detail Sampel'**
  String get detailTitle;

  /// No description provided for @detailUpdateStage.
  ///
  /// In id, this message translates to:
  /// **'Perbarui tahap'**
  String get detailUpdateStage;

  /// No description provided for @seeAll.
  ///
  /// In id, this message translates to:
  /// **'Lihat semua ({count})'**
  String seeAll(Object count);

  /// No description provided for @queueSeeAll.
  ///
  /// In id, this message translates to:
  /// **'Lihat seluruh antrean ({count})'**
  String queueSeeAll(Object count);

  /// No description provided for @myWorkAllTitle.
  ///
  /// In id, this message translates to:
  /// **'Kerja Saya'**
  String get myWorkAllTitle;

  /// No description provided for @queueAllTitle.
  ///
  /// In id, this message translates to:
  /// **'Antrean'**
  String get queueAllTitle;

  /// No description provided for @queueEmptyTitle.
  ///
  /// In id, this message translates to:
  /// **'Tidak ada lagi yang perlu dikirim'**
  String get queueEmptyTitle;

  /// No description provided for @queueEmptyMessage.
  ///
  /// In id, this message translates to:
  /// **'Semua scan di HP ini sudah sampai ke server.'**
  String get queueEmptyMessage;

  /// No description provided for @appTitle.
  ///
  /// In id, this message translates to:
  /// **'Atara Operator'**
  String get appTitle;

  /// No description provided for @loginSubtitle.
  ///
  /// In id, this message translates to:
  /// **'Masuk untuk mulai memindai sampel'**
  String get loginSubtitle;

  /// No description provided for @email.
  ///
  /// In id, this message translates to:
  /// **'Email'**
  String get email;

  /// No description provided for @password.
  ///
  /// In id, this message translates to:
  /// **'Kata Sandi'**
  String get password;

  /// No description provided for @signIn.
  ///
  /// In id, this message translates to:
  /// **'Masuk'**
  String get signIn;

  /// No description provided for @signOut.
  ///
  /// In id, this message translates to:
  /// **'Keluar'**
  String get signOut;

  /// No description provided for @signOutConfirm.
  ///
  /// In id, this message translates to:
  /// **'Keluar dari akun ini?'**
  String get signOutConfirm;

  /// No description provided for @cancel.
  ///
  /// In id, this message translates to:
  /// **'Batal'**
  String get cancel;

  /// No description provided for @retry.
  ///
  /// In id, this message translates to:
  /// **'Coba lagi'**
  String get retry;

  /// No description provided for @discard.
  ///
  /// In id, this message translates to:
  /// **'Buang'**
  String get discard;

  /// No description provided for @save.
  ///
  /// In id, this message translates to:
  /// **'Simpan'**
  String get save;

  /// No description provided for @scanButton.
  ///
  /// In id, this message translates to:
  /// **'Pindai Barcode Sampel'**
  String get scanButton;

  /// No description provided for @scanHint.
  ///
  /// In id, this message translates to:
  /// **'Arahkan kamera ke barcode/QR pada label sampel'**
  String get scanHint;

  /// No description provided for @updateStageTitle.
  ///
  /// In id, this message translates to:
  /// **'Perbarui Tahap'**
  String get updateStageTitle;

  /// No description provided for @selectNextStage.
  ///
  /// In id, this message translates to:
  /// **'Pilih Tahap Berikutnya'**
  String get selectNextStage;

  /// No description provided for @fieldNotes.
  ///
  /// In id, this message translates to:
  /// **'Catatan Lapangan (Opsional)'**
  String get fieldNotes;

  /// No description provided for @fieldNotesHint.
  ///
  /// In id, this message translates to:
  /// **'mis. Sampel dalam kondisi baik, kadar air normal.'**
  String get fieldNotesHint;

  /// No description provided for @saveAndUpdate.
  ///
  /// In id, this message translates to:
  /// **'Simpan & Perbarui Tahap'**
  String get saveAndUpdate;

  /// No description provided for @sampleIdent.
  ///
  /// In id, this message translates to:
  /// **'Sample ID: {ident}'**
  String sampleIdent(Object ident);

  /// No description provided for @currentStage.
  ///
  /// In id, this message translates to:
  /// **'Tahap saat ini: {stage}'**
  String currentStage(Object stage);

  /// No description provided for @status.
  ///
  /// In id, this message translates to:
  /// **'Status: {status}'**
  String status(Object status);

  /// No description provided for @notStarted.
  ///
  /// In id, this message translates to:
  /// **'Belum Dimulai'**
  String get notStarted;

  /// No description provided for @pendingTitle.
  ///
  /// In id, this message translates to:
  /// **'Menunggu Terkirim ({count})'**
  String pendingTitle(Object count);

  /// No description provided for @pendingDescription.
  ///
  /// In id, this message translates to:
  /// **'Tersimpan di perangkat, akan dikirim saat jaringan kembali.'**
  String get pendingDescription;

  /// No description provided for @syncNow.
  ///
  /// In id, this message translates to:
  /// **'Kirim sekarang'**
  String get syncNow;

  /// No description provided for @savedOffline.
  ///
  /// In id, this message translates to:
  /// **'Jaringan tidak tersedia. Pindai disimpan dan akan dikirim otomatis.'**
  String get savedOffline;

  /// No description provided for @syncedCount.
  ///
  /// In id, this message translates to:
  /// **'{count} pindai berhasil dikirim.'**
  String syncedCount(Object count);

  /// No description provided for @failedTitle.
  ///
  /// In id, this message translates to:
  /// **'Gagal Disinkronkan ({count})'**
  String failedTitle(Object count);

  /// No description provided for @failedDescription.
  ///
  /// In id, this message translates to:
  /// **'Ditolak server. Periksa alasannya, lalu coba lagi atau buang.'**
  String get failedDescription;

  /// No description provided for @settingsTitle.
  ///
  /// In id, this message translates to:
  /// **'Pengaturan'**
  String get settingsTitle;

  /// No description provided for @serverAddress.
  ///
  /// In id, this message translates to:
  /// **'Alamat Server'**
  String get serverAddress;

  /// No description provided for @serverAddressHint.
  ///
  /// In id, this message translates to:
  /// **'http://192.168.1.10:3000/api'**
  String get serverAddressHint;

  /// No description provided for @serverAddressHelp.
  ///
  /// In id, this message translates to:
  /// **'Ubah bila aplikasi dipakai di lokasi atau jaringan lain.'**
  String get serverAddressHelp;

  /// No description provided for @appearance.
  ///
  /// In id, this message translates to:
  /// **'Tampilan'**
  String get appearance;

  /// No description provided for @appearanceSystem.
  ///
  /// In id, this message translates to:
  /// **'Ikuti Sistem'**
  String get appearanceSystem;

  /// No description provided for @appearanceLight.
  ///
  /// In id, this message translates to:
  /// **'Terang'**
  String get appearanceLight;

  /// No description provided for @appearanceDark.
  ///
  /// In id, this message translates to:
  /// **'Gelap'**
  String get appearanceDark;

  /// No description provided for @language.
  ///
  /// In id, this message translates to:
  /// **'Bahasa'**
  String get language;

  /// No description provided for @settingsSaved.
  ///
  /// In id, this message translates to:
  /// **'Pengaturan tersimpan.'**
  String get settingsSaved;

  /// No description provided for @resetDefault.
  ///
  /// In id, this message translates to:
  /// **'Kembalikan ke bawaan'**
  String get resetDefault;

  /// No description provided for @connectionTimeout.
  ///
  /// In id, this message translates to:
  /// **'Koneksi habis waktu. Periksa jaringan lalu coba lagi.'**
  String get connectionTimeout;

  /// No description provided for @connectionFailed.
  ///
  /// In id, this message translates to:
  /// **'Tidak dapat menghubungi server. Periksa koneksi jaringan Anda.'**
  String get connectionFailed;

  /// No description provided for @unknownError.
  ///
  /// In id, this message translates to:
  /// **'Terjadi kesalahan yang tidak diketahui. Silakan coba lagi.'**
  String get unknownError;

  /// No description provided for @sampleNotRegistered.
  ///
  /// In id, this message translates to:
  /// **'Sampel Tidak Terdaftar'**
  String get sampleNotRegistered;

  /// No description provided for @unexpectedError.
  ///
  /// In id, this message translates to:
  /// **'Terjadi kesalahan yang tidak terduga.'**
  String get unexpectedError;

  /// No description provided for @emailRequired.
  ///
  /// In id, this message translates to:
  /// **'Email wajib diisi'**
  String get emailRequired;

  /// No description provided for @passwordRequired.
  ///
  /// In id, this message translates to:
  /// **'Kata sandi wajib diisi'**
  String get passwordRequired;

  /// No description provided for @scanScreenTitle.
  ///
  /// In id, this message translates to:
  /// **'Pindai Barcode Sampel'**
  String get scanScreenTitle;

  /// No description provided for @sampleNotFoundBody.
  ///
  /// In id, this message translates to:
  /// **'Kode \"{code}\" tidak ditemukan di database. Pastikan barcode yang dipindai benar.'**
  String sampleNotFoundBody(Object code);

  /// No description provided for @scanAgain.
  ///
  /// In id, this message translates to:
  /// **'Pindai Lagi'**
  String get scanAgain;

  /// No description provided for @loadFailed.
  ///
  /// In id, this message translates to:
  /// **'Gagal memuat data sampel.'**
  String get loadFailed;

  /// No description provided for @tryAgain.
  ///
  /// In id, this message translates to:
  /// **'Coba Lagi'**
  String get tryAgain;

  /// No description provided for @updateSuccessful.
  ///
  /// In id, this message translates to:
  /// **'Berhasil Diperbarui'**
  String get updateSuccessful;

  /// No description provided for @stageSaved.
  ///
  /// In id, this message translates to:
  /// **'Tahap \"{stage}\" telah disimpan.'**
  String stageSaved(Object stage);

  /// No description provided for @stageListEmpty.
  ///
  /// In id, this message translates to:
  /// **'Belum ada tahap yang dikonfigurasi di server. Hubungi administrator.'**
  String get stageListEmpty;

  /// No description provided for @stageListFailed.
  ///
  /// In id, this message translates to:
  /// **'Gagal memuat daftar tahap. Periksa koneksi jaringan Anda.'**
  String get stageListFailed;

  /// No description provided for @errorTimeout.
  ///
  /// In id, this message translates to:
  /// **'Sambungan habis waktu. Periksa jaringan lalu coba lagi.'**
  String get errorTimeout;

  /// No description provided for @errorUnreachable.
  ///
  /// In id, this message translates to:
  /// **'Server tidak dapat dihubungi. Periksa koneksi jaringan Anda.'**
  String get errorUnreachable;

  /// No description provided for @serverAddressInvalid.
  ///
  /// In id, this message translates to:
  /// **'Alamat tidak valid. Gunakan bentuk http://host:port/api.'**
  String get serverAddressInvalid;

  /// No description provided for @triedServerAddress.
  ///
  /// In id, this message translates to:
  /// **'Alamat yang dicoba: {address}'**
  String triedServerAddress(Object address);

  /// No description provided for @manualEntry.
  ///
  /// In id, this message translates to:
  /// **'Ketik kode sampel'**
  String get manualEntry;

  /// No description provided for @manualEntryTitle.
  ///
  /// In id, this message translates to:
  /// **'Masukkan Kode Sampel'**
  String get manualEntryTitle;

  /// No description provided for @manualEntryHelp.
  ///
  /// In id, this message translates to:
  /// **'Pakai ini kalau kamera bermasalah atau labelnya rusak.'**
  String get manualEntryHelp;

  /// No description provided for @manualEntryRequired.
  ///
  /// In id, this message translates to:
  /// **'Kode sampel wajib diisi.'**
  String get manualEntryRequired;

  /// No description provided for @manualEntryContinue.
  ///
  /// In id, this message translates to:
  /// **'Lanjut'**
  String get manualEntryContinue;

  /// No description provided for @offlineUnknownTitle.
  ///
  /// In id, this message translates to:
  /// **'Sampel belum tersimpan di HP'**
  String get offlineUnknownTitle;

  /// No description provided for @offlineUnknownBody.
  ///
  /// In id, this message translates to:
  /// **'Tidak ada sinyal, jadi tahap saat ini tidak diketahui. Anda tetap bisa mencatat tahapnya — server akan memeriksa urutannya saat terkirim.'**
  String get offlineUnknownBody;

  /// No description provided for @cachedNotice.
  ///
  /// In id, this message translates to:
  /// **'Data tersimpan di HP; tahapnya mungkin sudah berubah di server.'**
  String get cachedNotice;

  /// No description provided for @scanHistoryTitle.
  ///
  /// In id, this message translates to:
  /// **'Riwayat Scan'**
  String get scanHistoryTitle;

  /// No description provided for @scanHistoryOpen.
  ///
  /// In id, this message translates to:
  /// **'Lihat riwayat scan'**
  String get scanHistoryOpen;

  /// No description provided for @scanHistoryToday.
  ///
  /// In id, this message translates to:
  /// **'Hari ini'**
  String get scanHistoryToday;

  /// No description provided for @scanHistoryYesterday.
  ///
  /// In id, this message translates to:
  /// **'Kemarin'**
  String get scanHistoryYesterday;

  /// No description provided for @scanHistoryEmptyTitle.
  ///
  /// In id, this message translates to:
  /// **'Belum ada riwayat'**
  String get scanHistoryEmptyTitle;

  /// No description provided for @scanHistoryEmptyBody.
  ///
  /// In id, this message translates to:
  /// **'Scan yang Anda kirim akan muncul di sini, dikelompokkan per hari shift.'**
  String get scanHistoryEmptyBody;

  /// No description provided for @scanHistoryCachedNotice.
  ///
  /// In id, this message translates to:
  /// **'Tersimpan di HP; tanpa sinyal hanya shift ini yang bisa ditampilkan.'**
  String get scanHistoryCachedNotice;

  /// No description provided for @scanHistoryOlderOffline.
  ///
  /// In id, this message translates to:
  /// **'Hari sebelumnya butuh koneksi ke server.'**
  String get scanHistoryOlderOffline;

  /// No description provided for @scanHistoryLoadMore.
  ///
  /// In id, this message translates to:
  /// **'Muat lagi'**
  String get scanHistoryLoadMore;

  /// No description provided for @scanHistoryLoadMoreFailed.
  ///
  /// In id, this message translates to:
  /// **'Gagal memuat sisanya.'**
  String get scanHistoryLoadMoreFailed;

  /// No description provided for @scanHistoryWindow.
  ///
  /// In id, this message translates to:
  /// **'Riwayat mencakup 90 hari shift terakhir.'**
  String get scanHistoryWindow;

  /// No description provided for @myWorkTitle.
  ///
  /// In id, this message translates to:
  /// **'Kerja Saya'**
  String get myWorkTitle;

  /// No description provided for @myWorkSummary.
  ///
  /// In id, this message translates to:
  /// **'{count} sampel shift ini'**
  String myWorkSummary(int count);

  /// No description provided for @myWorkEmpty.
  ///
  /// In id, this message translates to:
  /// **'Belum ada scan pada shift ini.'**
  String get myWorkEmpty;

  /// No description provided for @emailHint.
  ///
  /// In id, this message translates to:
  /// **'nama@atara.local'**
  String get emailHint;

  /// No description provided for @passwordHint.
  ///
  /// In id, this message translates to:
  /// **'Kata sandi Anda'**
  String get passwordHint;

  /// No description provided for @checkServerAddress.
  ///
  /// In id, this message translates to:
  /// **'Periksa alamat server'**
  String get checkServerAddress;

  /// No description provided for @sameLabelIgnored.
  ///
  /// In id, this message translates to:
  /// **'Label yang sama diabaikan. Arahkan ke label lain.'**
  String get sameLabelIgnored;

  /// No description provided for @scanThisAgain.
  ///
  /// In id, this message translates to:
  /// **'Pindai ulang'**
  String get scanThisAgain;

  /// No description provided for @stageReceived.
  ///
  /// In id, this message translates to:
  /// **'DITERIMA'**
  String get stageReceived;

  /// No description provided for @stageWetPrep.
  ///
  /// In id, this message translates to:
  /// **'PREP BASAH'**
  String get stageWetPrep;

  /// No description provided for @stageDryPrep.
  ///
  /// In id, this message translates to:
  /// **'PREP KERING'**
  String get stageDryPrep;

  /// No description provided for @stageAnalysis.
  ///
  /// In id, this message translates to:
  /// **'ANALISA'**
  String get stageAnalysis;

  /// No description provided for @stageReport.
  ///
  /// In id, this message translates to:
  /// **'REPORT'**
  String get stageReport;

  /// No description provided for @onboardingTitle.
  ///
  /// In id, this message translates to:
  /// **'Panduan Singkat'**
  String get onboardingTitle;

  /// No description provided for @onboardingSkip.
  ///
  /// In id, this message translates to:
  /// **'Lewati'**
  String get onboardingSkip;

  /// No description provided for @onboardingNext.
  ///
  /// In id, this message translates to:
  /// **'Lanjut'**
  String get onboardingNext;

  /// No description provided for @onboardingStart.
  ///
  /// In id, this message translates to:
  /// **'Mulai'**
  String get onboardingStart;

  /// No description provided for @onboardingDone.
  ///
  /// In id, this message translates to:
  /// **'Selesai'**
  String get onboardingDone;

  /// No description provided for @onboardingPageOf.
  ///
  /// In id, this message translates to:
  /// **'Halaman {current} dari {total}'**
  String onboardingPageOf(int current, int total);

  /// No description provided for @onboardingWelcomeBody.
  ///
  /// In id, this message translates to:
  /// **'Panduan singkat sebelum Anda mulai memindai sampel.'**
  String get onboardingWelcomeBody;

  /// No description provided for @onboardingScanTitle.
  ///
  /// In id, this message translates to:
  /// **'Pindai label sampel'**
  String get onboardingScanTitle;

  /// No description provided for @onboardingScanBody.
  ///
  /// In id, this message translates to:
  /// **'Arahkan kamera ke barcode atau QR pada label sampel. Kalau labelnya rusak, kodenya bisa diketik.'**
  String get onboardingScanBody;

  /// No description provided for @onboardingStageTitle.
  ///
  /// In id, this message translates to:
  /// **'Perbarui tahapnya'**
  String get onboardingStageTitle;

  /// No description provided for @onboardingStageBody.
  ///
  /// In id, this message translates to:
  /// **'Setelah sampel terbaca, pilih tahap berikutnya lalu simpan. Catatan lapangan boleh ditambahkan bila perlu.'**
  String get onboardingStageBody;

  /// No description provided for @onboardingOfflineTitle.
  ///
  /// In id, this message translates to:
  /// **'Tanpa sinyal tetap jalan'**
  String get onboardingOfflineTitle;

  /// No description provided for @onboardingOfflineBody.
  ///
  /// In id, this message translates to:
  /// **'Pindai tetap tersimpan di HP saat jaringan hilang, lalu terkirim sendiri begitu koneksi kembali.'**
  String get onboardingOfflineBody;

  /// No description provided for @onboardingWorkTitle.
  ///
  /// In id, this message translates to:
  /// **'Lihat hasil kerja Anda'**
  String get onboardingWorkTitle;

  /// No description provided for @onboardingWorkBody.
  ///
  /// In id, this message translates to:
  /// **'Beranda merekap jumlah sampel yang Anda pindai pada shift ini, lengkap dengan riwayat tiap sampel.'**
  String get onboardingWorkBody;

  /// No description provided for @helpSection.
  ///
  /// In id, this message translates to:
  /// **'Panduan'**
  String get helpSection;

  /// No description provided for @onboardingReopen.
  ///
  /// In id, this message translates to:
  /// **'Lihat panduan lagi'**
  String get onboardingReopen;

  /// No description provided for @onboardingReopenHelp.
  ///
  /// In id, this message translates to:
  /// **'Ulangi panduan lima langkah ini kapan saja.'**
  String get onboardingReopenHelp;

  /// No description provided for @errorUnreadableAnswer.
  ///
  /// In id, this message translates to:
  /// **'Server menjawab dalam bentuk yang tidak dikenali. Periksa alamat server atau hubungi administrator.'**
  String get errorUnreadableAnswer;

  /// No description provided for @signInOperatorsOnly.
  ///
  /// In id, this message translates to:
  /// **'Aplikasi ini khusus Operator. Silakan gunakan situs web.'**
  String get signInOperatorsOnly;

  /// No description provided for @errorForbidden.
  ///
  /// In id, this message translates to:
  /// **'Peran akun Anda tidak mengizinkan ini. Aplikasi ini khusus Operator.'**
  String get errorForbidden;

  /// No description provided for @mfaTitle.
  ///
  /// In id, this message translates to:
  /// **'Verifikasi Identitas'**
  String get mfaTitle;

  /// No description provided for @mfaStepLabel.
  ///
  /// In id, this message translates to:
  /// **'Langkah 2 dari 2'**
  String get mfaStepLabel;

  /// No description provided for @mfaGreeting.
  ///
  /// In id, this message translates to:
  /// **'Halo, {name}'**
  String mfaGreeting(String name);

  /// No description provided for @mfaChooseSubtitle.
  ///
  /// In id, this message translates to:
  /// **'Pilih cara verifikasi untuk menyelesaikan masuk.'**
  String get mfaChooseSubtitle;

  /// No description provided for @mfaMethodFace.
  ///
  /// In id, this message translates to:
  /// **'Verifikasi wajah'**
  String get mfaMethodFace;

  /// No description provided for @mfaMethodFaceHint.
  ///
  /// In id, this message translates to:
  /// **'Hadap kamera dan berkedip sekali'**
  String get mfaMethodFaceHint;

  /// No description provided for @mfaMethodTotp.
  ///
  /// In id, this message translates to:
  /// **'Kode Authenticator'**
  String get mfaMethodTotp;

  /// No description provided for @mfaMethodTotpHint.
  ///
  /// In id, this message translates to:
  /// **'Kode 6 digit dari aplikasi authenticator'**
  String get mfaMethodTotpHint;

  /// No description provided for @mfaMethodSetup.
  ///
  /// In id, this message translates to:
  /// **'Siapkan Authenticator'**
  String get mfaMethodSetup;

  /// No description provided for @mfaMethodSetupHint.
  ///
  /// In id, this message translates to:
  /// **'Hubungkan aplikasi authenticator di HP ini'**
  String get mfaMethodSetupHint;

  /// No description provided for @mfaUseAnotherMethod.
  ///
  /// In id, this message translates to:
  /// **'Gunakan metode lain'**
  String get mfaUseAnotherMethod;

  /// No description provided for @mfaBackToPassword.
  ///
  /// In id, this message translates to:
  /// **'Kembali ke kata sandi'**
  String get mfaBackToPassword;

  /// No description provided for @mfaExpiresIn.
  ///
  /// In id, this message translates to:
  /// **'Berlaku {seconds} detik lagi'**
  String mfaExpiresIn(int seconds);

  /// No description provided for @mfaExpiredTitle.
  ///
  /// In id, this message translates to:
  /// **'Sesi masuk sudah kedaluwarsa'**
  String get mfaExpiredTitle;

  /// No description provided for @mfaExpiredBody.
  ///
  /// In id, this message translates to:
  /// **'Batas dua menit sudah terlewat. Masukkan kata sandi lagi untuk memulai ulang.'**
  String get mfaExpiredBody;

  /// No description provided for @mfaStartAgain.
  ///
  /// In id, this message translates to:
  /// **'Mulai ulang'**
  String get mfaStartAgain;

  /// No description provided for @mfaTotpSubtitle.
  ///
  /// In id, this message translates to:
  /// **'Buka aplikasi authenticator Anda dan masukkan kode 6 digit untuk akun ATARA.'**
  String get mfaTotpSubtitle;

  /// No description provided for @mfaCodeLabel.
  ///
  /// In id, this message translates to:
  /// **'Kode 6 digit'**
  String get mfaCodeLabel;

  /// No description provided for @mfaCodeHint.
  ///
  /// In id, this message translates to:
  /// **'Ketik 6 digit'**
  String get mfaCodeHint;

  /// No description provided for @mfaVerify.
  ///
  /// In id, this message translates to:
  /// **'Verifikasi'**
  String get mfaVerify;

  /// No description provided for @mfaVerified.
  ///
  /// In id, this message translates to:
  /// **'Kode benar. Masuk…'**
  String get mfaVerified;

  /// No description provided for @mfaCodeIncomplete.
  ///
  /// In id, this message translates to:
  /// **'Kodenya 6 digit.'**
  String get mfaCodeIncomplete;

  /// No description provided for @mfaCodeWrong.
  ///
  /// In id, this message translates to:
  /// **'Kode salah atau sudah dipakai. Tunggu kode berikutnya lalu coba lagi.'**
  String get mfaCodeWrong;

  /// No description provided for @mfaSetupTitle.
  ///
  /// In id, this message translates to:
  /// **'Siapkan Authenticator'**
  String get mfaSetupTitle;

  /// No description provided for @mfaSetupIntro.
  ///
  /// In id, this message translates to:
  /// **'Tambahkan akun ini ke aplikasi authenticator di HP ini, lalu masukkan kode yang muncul.'**
  String get mfaSetupIntro;

  /// No description provided for @mfaSetupManualSteps.
  ///
  /// In id, this message translates to:
  /// **'Di aplikasi authenticator: ketuk +, pilih “Akun lain”, lalu “Masukkan kunci secara manual”.'**
  String get mfaSetupManualSteps;

  /// No description provided for @mfaSetupAccountLabel.
  ///
  /// In id, this message translates to:
  /// **'Nama akun'**
  String get mfaSetupAccountLabel;

  /// No description provided for @mfaSetupKeyLabel.
  ///
  /// In id, this message translates to:
  /// **'Kunci rahasia'**
  String get mfaSetupKeyLabel;

  /// No description provided for @mfaSetupCopyKey.
  ///
  /// In id, this message translates to:
  /// **'Salin kunci'**
  String get mfaSetupCopyKey;

  /// No description provided for @mfaSetupKeyCopied.
  ///
  /// In id, this message translates to:
  /// **'Kunci disalin.'**
  String get mfaSetupKeyCopied;

  /// No description provided for @mfaSetupKeyWarning.
  ///
  /// In id, this message translates to:
  /// **'Kunci ini hanya ditampilkan sekali.'**
  String get mfaSetupKeyWarning;

  /// No description provided for @mfaSetupLoading.
  ///
  /// In id, this message translates to:
  /// **'Menyiapkan kunci…'**
  String get mfaSetupLoading;

  /// No description provided for @mfaSetupUnavailable.
  ///
  /// In id, this message translates to:
  /// **'Tidak ada pendaftaran Authenticator yang menunggu untuk akun ini. Hubungi administrator.'**
  String get mfaSetupUnavailable;

  /// No description provided for @mfaSetupCodeTitle.
  ///
  /// In id, this message translates to:
  /// **'Masukkan kode'**
  String get mfaSetupCodeTitle;

  /// No description provided for @mfaSetupCodeHint.
  ///
  /// In id, this message translates to:
  /// **'Ketik kode 6 digit yang muncul di aplikasi authenticator untuk akun ATARA.'**
  String get mfaSetupCodeHint;

  /// No description provided for @mfaEnrolled.
  ///
  /// In id, this message translates to:
  /// **'Authenticator tersambung. Masuk…'**
  String get mfaEnrolled;

  /// No description provided for @mfaTooManyAttempts.
  ///
  /// In id, this message translates to:
  /// **'Terlalu banyak percobaan. Tunggu beberapa menit, lalu masuk lagi.'**
  String get mfaTooManyAttempts;

  /// No description provided for @mfaUnsupportedMethod.
  ///
  /// In id, this message translates to:
  /// **'Akun ini memakai metode verifikasi yang belum didukung aplikasi. Selesaikan lewat situs web.'**
  String get mfaUnsupportedMethod;

  /// No description provided for @overrideNotesReplaced.
  ///
  /// In id, this message translates to:
  /// **'Pada koreksi, alasan di atas yang tercatat sebagai catatan. Catatan lapangan tidak dikirim.'**
  String get overrideNotesReplaced;

  /// No description provided for @mfaFaceTitle.
  ///
  /// In id, this message translates to:
  /// **'Verifikasi wajah'**
  String get mfaFaceTitle;

  /// No description provided for @mfaFaceSubtitle.
  ///
  /// In id, this message translates to:
  /// **'Hadap kamera dan berkedip sekali.'**
  String get mfaFaceSubtitle;

  /// No description provided for @mfaFaceBlinkNow.
  ///
  /// In id, this message translates to:
  /// **'Berkedip sekarang'**
  String get mfaFaceBlinkNow;

  /// No description provided for @mfaFaceChecking.
  ///
  /// In id, this message translates to:
  /// **'Memeriksa…'**
  String get mfaFaceChecking;

  /// No description provided for @mfaFaceVerified.
  ///
  /// In id, this message translates to:
  /// **'Wajah cocok. Masuk…'**
  String get mfaFaceVerified;

  /// No description provided for @faceNoFace.
  ///
  /// In id, this message translates to:
  /// **'Wajah tidak terdeteksi. Pastikan pencahayaan cukup, lalu coba lagi.'**
  String get faceNoFace;

  /// No description provided for @faceNotAlive.
  ///
  /// In id, this message translates to:
  /// **'Tidak terlihat kedipan. Hadap kamera dan berkedip sekali.'**
  String get faceNotAlive;

  /// No description provided for @faceQualityUnsure.
  ///
  /// In id, this message translates to:
  /// **'Wajah belum terbaca jelas. Hadap lurus ke kamera.'**
  String get faceQualityUnsure;

  /// No description provided for @faceQualityTooFar.
  ///
  /// In id, this message translates to:
  /// **'Wajah terlalu jauh. Mendekat ke kamera.'**
  String get faceQualityTooFar;

  /// No description provided for @faceQualityTooClose.
  ///
  /// In id, this message translates to:
  /// **'Wajah terlalu dekat. Mundur sedikit.'**
  String get faceQualityTooClose;

  /// No description provided for @faceQualityOffCentre.
  ///
  /// In id, this message translates to:
  /// **'Tengahkan wajah di dalam bingkai.'**
  String get faceQualityOffCentre;

  /// No description provided for @faceQualityTooDark.
  ///
  /// In id, this message translates to:
  /// **'Terlalu gelap. Tambah pencahayaan atau hadap ke arah cahaya.'**
  String get faceQualityTooDark;

  /// No description provided for @faceServiceDown.
  ///
  /// In id, this message translates to:
  /// **'Pengenalan wajah sedang tidak tersedia. Hubungi administrator.'**
  String get faceServiceDown;

  /// No description provided for @faceMismatch.
  ///
  /// In id, this message translates to:
  /// **'Wajah tidak cocok dengan akun ini.'**
  String get faceMismatch;

  /// No description provided for @faceCameraDenied.
  ///
  /// In id, this message translates to:
  /// **'Izin kamera belum diberikan, jadi verifikasi wajah tidak bisa dijalankan.'**
  String get faceCameraDenied;

  /// No description provided for @sessionReplaced.
  ///
  /// In id, this message translates to:
  /// **'Akun Anda dibuka di HP lain, jadi Anda dikeluarkan dari HP ini.'**
  String get sessionReplaced;

  /// No description provided for @sessionReplacedAt.
  ///
  /// In id, this message translates to:
  /// **'Akun Anda dibuka di HP lain pukul {time}, jadi Anda dikeluarkan dari HP ini.'**
  String sessionReplacedAt(String time);

  /// No description provided for @sessionReplacedOnAt.
  ///
  /// In id, this message translates to:
  /// **'Akun Anda dibuka di HP lain ({device}) pukul {time}, jadi Anda dikeluarkan dari HP ini.'**
  String sessionReplacedOnAt(String device, String time);

  /// No description provided for @sessionReplacedElsewhere.
  ///
  /// In id, this message translates to:
  /// **'Akun Anda dibuka di perangkat lain, sehingga Anda dikeluarkan dari HP ini.'**
  String get sessionReplacedElsewhere;

  /// No description provided for @sessionReplacedElsewhereAt.
  ///
  /// In id, this message translates to:
  /// **'Akun Anda dibuka di perangkat lain pukul {time}, sehingga Anda dikeluarkan dari HP ini.'**
  String sessionReplacedElsewhereAt(String time);

  /// No description provided for @sessionReplacedDevice.
  ///
  /// In id, this message translates to:
  /// **'Perangkat'**
  String get sessionReplacedDevice;

  /// No description provided for @sessionReplacedSystem.
  ///
  /// In id, this message translates to:
  /// **'Sistem'**
  String get sessionReplacedSystem;

  /// No description provided for @sessionReplacedBrowser.
  ///
  /// In id, this message translates to:
  /// **'Browser'**
  String get sessionReplacedBrowser;

  /// No description provided for @sessionReplacedApp.
  ///
  /// In id, this message translates to:
  /// **'Aplikasi'**
  String get sessionReplacedApp;

  /// No description provided for @sessionReplacedModel.
  ///
  /// In id, this message translates to:
  /// **'Model'**
  String get sessionReplacedModel;

  /// No description provided for @deviceKindPhone.
  ///
  /// In id, this message translates to:
  /// **'HP'**
  String get deviceKindPhone;

  /// No description provided for @deviceKindComputer.
  ///
  /// In id, this message translates to:
  /// **'Komputer'**
  String get deviceKindComputer;

  /// No description provided for @deviceKindTablet.
  ///
  /// In id, this message translates to:
  /// **'Tablet'**
  String get deviceKindTablet;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'id'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'id':
      return AppLocalizationsId();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
