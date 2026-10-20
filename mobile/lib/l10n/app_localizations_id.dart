// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Indonesian (`id`).
class AppLocalizationsId extends AppLocalizations {
  AppLocalizationsId([String locale = 'id']) : super(locale);

  @override
  String get tabHome => 'Beranda';

  @override
  String get tabScan => 'Pindai';

  @override
  String get statusPending => 'Menunggu';

  @override
  String get statusInProgress => 'Berjalan';

  @override
  String get statusCompleted => 'Selesai';

  @override
  String get roleSuperAdmin => 'Super Admin';

  @override
  String get roleAdmin => 'Administrator';

  @override
  String get rolePreparator => 'Preparator';

  @override
  String get roleDatabase => 'Database';

  @override
  String get roleAnalisis => 'Analisis';

  @override
  String get cameraBlockedTitle => 'Kamera tidak dapat digunakan';

  @override
  String get cameraBlockedBody =>
      'Izin kamera belum diberikan, jadi barcode tidak bisa dipindai. Anda tetap dapat mengetik kodenya.';

  @override
  String get openAppSettings => 'Buka Pengaturan Aplikasi';

  @override
  String get scanTitle => 'Pindai';

  @override
  String get signOutSection => 'Akun';

  @override
  String get historyTitle => 'Riwayat';

  @override
  String historySeeAll(Object count) {
    return 'Lihat semua ($count)';
  }

  @override
  String get historyEmpty => 'Belum ada tahap yang tercatat untuk sampel ini.';

  @override
  String get historyCorrection => 'Koreksi';

  @override
  String get historyUnknownOnCache =>
      'Riwayat tidak tersimpan di HP. Sambungkan ke server untuk melihatnya.';

  @override
  String get overrideTitle => 'Melanggar urutan tahap';

  @override
  String get overrideBody =>
      'Tahap ini bukan lanjutan dari tahap sekarang. Anda boleh menimpanya, tapi alasannya wajib dicatat.';

  @override
  String get overrideReason => 'Alasan koreksi';

  @override
  String get overrideReasonHint => 'mis. salah pindai, label tertukar';

  @override
  String get overrideReasonTooShort => 'Alasan minimal 5 karakter.';

  @override
  String get continuousMode => 'Pindai beruntun';

  @override
  String continuousRecorded(Object count) {
    return '$count tercatat';
  }

  @override
  String get workflowComplete =>
      'Sampel ini sudah menyelesaikan seluruh tahap.';

  @override
  String get detailTitle => 'Detail Sampel';

  @override
  String seeAll(Object count) {
    return 'Lihat semua ($count)';
  }

  @override
  String queueSeeAll(Object count) {
    return 'Lihat seluruh antrean ($count)';
  }

  @override
  String get myWorkAllTitle => 'Kerja Saya';

  @override
  String get queueAllTitle => 'Antrean';

  @override
  String get queueEmptyTitle => 'Tidak ada lagi yang perlu dikirim';

  @override
  String get queueEmptyMessage =>
      'Semua scan di HP ini sudah sampai ke server.';

  @override
  String get appTitle => 'Atara Preparator';

  @override
  String get loginSubtitle => 'Masuk untuk mulai memindai sampel';

  @override
  String get email => 'Email';

  @override
  String get password => 'Kata Sandi';

  @override
  String get signIn => 'Masuk';

  @override
  String get signOut => 'Keluar';

  @override
  String get signOutConfirm => 'Keluar dari akun ini?';

  @override
  String get cancel => 'Batal';

  @override
  String get retry => 'Coba lagi';

  @override
  String get discard => 'Buang';

  @override
  String get save => 'Simpan';

  @override
  String get scanButton => 'Pindai Barcode Sampel';

  @override
  String get scanHint => 'Arahkan kamera ke barcode/QR pada label sampel';

  @override
  String get selectNextStage => 'Pilih Tahap Berikutnya';

  @override
  String get fieldNotes => 'Catatan Lapangan (Opsional)';

  @override
  String get fieldNotesHint =>
      'mis. Sampel dalam kondisi baik, kadar air normal.';

  @override
  String get saveAndUpdate => 'Simpan & Perbarui Tahap';

  @override
  String sampleIdent(Object ident) {
    return 'Sample ID: $ident';
  }

  @override
  String currentStage(Object stage) {
    return 'Tahap saat ini: $stage';
  }

  @override
  String status(Object status) {
    return 'Status: $status';
  }

  @override
  String get notStarted => 'Belum Dimulai';

  @override
  String pendingTitle(Object count) {
    return 'Menunggu Terkirim ($count)';
  }

  @override
  String get pendingDescription =>
      'Tersimpan di perangkat, akan dikirim saat jaringan kembali.';

  @override
  String get syncNow => 'Kirim sekarang';

  @override
  String get savedOffline =>
      'Jaringan tidak tersedia. Pindai disimpan dan akan dikirim otomatis.';

  @override
  String syncedCount(Object count) {
    return '$count pindai berhasil dikirim.';
  }

  @override
  String failedTitle(Object count) {
    return 'Gagal Disinkronkan ($count)';
  }

  @override
  String get failedDescription =>
      'Ditolak server. Periksa alasannya, lalu coba lagi atau buang.';

  @override
  String get settingsTitle => 'Pengaturan';

  @override
  String get serverAddress => 'Alamat Server';

  @override
  String get serverAddressHint => 'http://192.168.1.10:3000/api';

  @override
  String get serverAddressHelp =>
      'Ubah bila aplikasi dipakai di lokasi atau jaringan lain.';

  @override
  String get appearance => 'Tampilan';

  @override
  String get appearanceSystem => 'Ikuti Sistem';

  @override
  String get appearanceLight => 'Terang';

  @override
  String get appearanceDark => 'Gelap';

  @override
  String get language => 'Bahasa';

  @override
  String get settingsSaved => 'Pengaturan tersimpan.';

  @override
  String get resetDefault => 'Kembalikan ke bawaan';

  @override
  String get connectionTimeout =>
      'Koneksi habis waktu. Periksa jaringan lalu coba lagi.';

  @override
  String get connectionFailed =>
      'Tidak dapat menghubungi server. Periksa koneksi jaringan Anda.';

  @override
  String get unknownError =>
      'Terjadi kesalahan yang tidak diketahui. Silakan coba lagi.';

  @override
  String get sampleNotRegistered => 'Sampel Tidak Terdaftar';

  @override
  String get unexpectedError => 'Terjadi kesalahan yang tidak terduga.';

  @override
  String get emailRequired => 'Email wajib diisi';

  @override
  String get passwordRequired => 'Kata sandi wajib diisi';

  @override
  String get scanScreenTitle => 'Pindai Barcode Sampel';

  @override
  String sampleNotFoundBody(Object code) {
    return 'Kode \"$code\" tidak ditemukan di database. Pastikan barcode yang dipindai benar.';
  }

  @override
  String get scanAgain => 'Pindai Lagi';

  @override
  String get loadFailed => 'Gagal memuat data sampel.';

  @override
  String get tryAgain => 'Coba Lagi';

  @override
  String get updateSuccessful => 'Berhasil Diperbarui';

  @override
  String stageSaved(Object stage) {
    return 'Tahap \"$stage\" telah disimpan.';
  }

  @override
  String get stageListEmpty =>
      'Belum ada tahap yang dikonfigurasi di server. Hubungi administrator.';

  @override
  String get stageListFailed =>
      'Gagal memuat daftar tahap. Periksa koneksi jaringan Anda.';

  @override
  String get errorTimeout =>
      'Sambungan habis waktu. Periksa jaringan lalu coba lagi.';

  @override
  String get errorUnreachable =>
      'Server tidak dapat dihubungi. Periksa koneksi jaringan Anda.';

  @override
  String get serverAddressInvalid =>
      'Alamat tidak valid. Gunakan bentuk http://host:port/api.';

  @override
  String triedServerAddress(Object address) {
    return 'Alamat yang dicoba: $address';
  }

  @override
  String get manualEntry => 'Ketik kode sampel';

  @override
  String get manualEntryTitle => 'Masukkan Kode Sampel';

  @override
  String get manualEntryHelp =>
      'Pakai ini kalau kamera bermasalah atau labelnya rusak.';

  @override
  String get manualEntryRequired => 'Kode sampel wajib diisi.';

  @override
  String get manualEntryContinue => 'Lanjut';

  @override
  String get offlineUnknownTitle => 'Sampel belum tersimpan di HP';

  @override
  String get offlineUnknownBody =>
      'Tidak ada sinyal, jadi tahap saat ini tidak diketahui. Anda tetap bisa mencatat tahapnya — server akan memeriksa urutannya saat terkirim.';

  @override
  String get cachedNotice =>
      'Data tersimpan di HP; tahapnya mungkin sudah berubah di server.';

  @override
  String get scanHistoryTitle => 'Riwayat Scan';

  @override
  String get scanHistoryOpen => 'Lihat riwayat scan';

  @override
  String get scanHistoryToday => 'Hari ini';

  @override
  String get scanHistoryYesterday => 'Kemarin';

  @override
  String get scanHistoryEmptyTitle => 'Belum ada riwayat';

  @override
  String get scanHistoryEmptyBody =>
      'Scan yang Anda kirim akan muncul di sini, dikelompokkan per hari shift.';

  @override
  String get scanHistoryCachedNotice =>
      'Tersimpan di HP; tanpa sinyal hanya shift ini yang bisa ditampilkan.';

  @override
  String get scanHistoryOlderOffline =>
      'Hari sebelumnya butuh koneksi ke server.';

  @override
  String get scanHistoryLoadMore => 'Muat lagi';

  @override
  String get scanHistoryLoadMoreFailed => 'Gagal memuat sisanya.';

  @override
  String get scanHistoryWindow => 'Riwayat mencakup 90 hari shift terakhir.';

  @override
  String get myWorkTitle => 'Kerja Saya';

  @override
  String myWorkSummary(int count) {
    return '$count sampel shift ini';
  }

  @override
  String get myWorkEmpty => 'Belum ada scan pada shift ini.';

  @override
  String get emailHint => 'nama@atara.local';

  @override
  String get passwordHint => 'Kata sandi Anda';

  @override
  String get checkServerAddress => 'Periksa alamat server';

  @override
  String get sameLabelIgnored =>
      'Label yang sama diabaikan. Arahkan ke label lain.';

  @override
  String get scanThisAgain => 'Pindai ulang';

  @override
  String get stageReceived => 'DITERIMA';

  @override
  String get stageWetPrep => 'PREP BASAH';

  @override
  String get stageDryPrep => 'PREP KERING';

  @override
  String get stageAnalysis => 'ANALISA';

  @override
  String get stageReport => 'REPORT';

  @override
  String get onboardingTitle => 'Panduan Singkat';

  @override
  String get onboardingSkip => 'Lewati';

  @override
  String get onboardingNext => 'Lanjut';

  @override
  String get onboardingStart => 'Mulai';

  @override
  String get onboardingDone => 'Selesai';

  @override
  String onboardingPageOf(int current, int total) {
    return 'Halaman $current dari $total';
  }

  @override
  String get onboardingWelcomeBody =>
      'Panduan singkat sebelum Anda mulai memindai sampel.';

  @override
  String get onboardingScanTitle => 'Pindai label sampel';

  @override
  String get onboardingScanBody =>
      'Arahkan kamera ke barcode atau QR pada label sampel. Kalau labelnya rusak, kodenya bisa diketik.';

  @override
  String get onboardingStageTitle => 'Perbarui tahapnya';

  @override
  String get onboardingStageBody =>
      'Setelah sampel terbaca, pilih tahap berikutnya lalu simpan. Catatan lapangan boleh ditambahkan bila perlu.';

  @override
  String get onboardingOfflineTitle => 'Tanpa sinyal tetap jalan';

  @override
  String get onboardingOfflineBody =>
      'Pindai tetap tersimpan di HP saat jaringan hilang, lalu terkirim sendiri begitu koneksi kembali.';

  @override
  String get onboardingWorkTitle => 'Lihat hasil kerja Anda';

  @override
  String get onboardingWorkBody =>
      'Beranda merekap jumlah sampel yang Anda pindai pada shift ini, lengkap dengan riwayat tiap sampel.';

  @override
  String get helpSection => 'Panduan';

  @override
  String get onboardingReopen => 'Lihat panduan lagi';

  @override
  String get onboardingReopenHelp =>
      'Ulangi panduan lima langkah ini kapan saja.';

  @override
  String get errorUnreadableAnswer =>
      'Server menjawab dalam bentuk yang tidak dikenali. Periksa alamat server atau hubungi administrator.';

  @override
  String get signInPreparatorsOnly =>
      'Aplikasi ini khusus Preparator. Silakan gunakan situs web.';

  @override
  String get errorForbidden =>
      'Peran akun Anda tidak mengizinkan ini. Aplikasi ini khusus Preparator.';

  @override
  String get mfaTitle => 'Verifikasi Identitas';

  @override
  String get mfaStepLabel => 'Langkah 2 dari 2';

  @override
  String mfaGreeting(String name) {
    return 'Halo, $name';
  }

  @override
  String get mfaChooseSubtitle =>
      'Pilih cara verifikasi untuk menyelesaikan masuk.';

  @override
  String get mfaMethodFace => 'Verifikasi wajah';

  @override
  String get mfaMethodFaceHint => 'Hadap kamera dan berkedip sekali';

  @override
  String get mfaMethodTotp => 'Kode Authenticator';

  @override
  String get mfaMethodTotpHint => 'Kode 6 digit dari aplikasi authenticator';

  @override
  String get mfaMethodSetup => 'Siapkan Authenticator';

  @override
  String get mfaMethodSetupHint => 'Hubungkan aplikasi authenticator di HP ini';

  @override
  String get mfaUseAnotherMethod => 'Gunakan metode lain';

  @override
  String get mfaBackToPassword => 'Kembali ke kata sandi';

  @override
  String mfaExpiresIn(int seconds) {
    return 'Berlaku $seconds detik lagi';
  }

  @override
  String get mfaExpiredTitle => 'Sesi masuk sudah kedaluwarsa';

  @override
  String get mfaExpiredBody =>
      'Batas dua menit sudah terlewat. Masukkan kata sandi lagi untuk memulai ulang.';

  @override
  String get mfaStartAgain => 'Mulai ulang';

  @override
  String get mfaTotpSubtitle =>
      'Buka aplikasi authenticator Anda dan masukkan kode 6 digit untuk akun ATARA.';

  @override
  String get mfaCodeLabel => 'Kode 6 digit';

  @override
  String get mfaCodeHint => 'Ketik 6 digit';

  @override
  String get mfaVerify => 'Verifikasi';

  @override
  String get mfaVerified => 'Kode benar. Masuk…';

  @override
  String get mfaCodeIncomplete => 'Kodenya 6 digit.';

  @override
  String get mfaCodeWrong =>
      'Kode salah atau sudah dipakai. Tunggu kode berikutnya lalu coba lagi.';

  @override
  String get mfaSetupTitle => 'Siapkan Authenticator';

  @override
  String get mfaSetupIntro =>
      'Tambahkan akun ini ke aplikasi authenticator di HP ini, lalu masukkan kode yang muncul.';

  @override
  String get mfaSetupManualSteps =>
      'Di aplikasi authenticator: ketuk +, pilih “Akun lain”, lalu “Masukkan kunci secara manual”.';

  @override
  String get mfaSetupAccountLabel => 'Nama akun';

  @override
  String get mfaSetupKeyLabel => 'Kunci rahasia';

  @override
  String get mfaSetupCopyKey => 'Salin kunci';

  @override
  String get mfaSetupKeyCopied => 'Kunci disalin.';

  @override
  String get mfaSetupKeyWarning => 'Kunci ini hanya ditampilkan sekali.';

  @override
  String get mfaSetupLoading => 'Menyiapkan kunci…';

  @override
  String get mfaSetupUnavailable =>
      'Tidak ada pendaftaran Authenticator yang menunggu untuk akun ini. Hubungi administrator.';

  @override
  String get mfaSetupCodeTitle => 'Masukkan kode';

  @override
  String get mfaSetupCodeHint =>
      'Ketik kode 6 digit yang muncul di aplikasi authenticator untuk akun ATARA.';

  @override
  String get mfaEnrolled => 'Authenticator tersambung. Masuk…';

  @override
  String get mfaTooManyAttempts =>
      'Terlalu banyak percobaan. Tunggu beberapa menit, lalu masuk lagi.';

  @override
  String get mfaUnsupportedMethod =>
      'Akun ini memakai metode verifikasi yang belum didukung aplikasi. Selesaikan lewat situs web.';

  @override
  String get overrideNotesReplaced =>
      'Pada koreksi, alasan di atas yang tercatat sebagai catatan. Catatan lapangan tidak dikirim.';

  @override
  String get mfaFaceTitle => 'Verifikasi wajah';

  @override
  String get mfaFaceSubtitle => 'Hadap kamera dan berkedip sekali.';

  @override
  String get mfaFaceBlinkNow => 'Berkedip sekarang';

  @override
  String get mfaFaceChecking => 'Memeriksa…';

  @override
  String get mfaFaceVerified => 'Wajah cocok. Masuk…';

  @override
  String get faceNoFace =>
      'Wajah tidak terdeteksi. Pastikan pencahayaan cukup, lalu coba lagi.';

  @override
  String get faceNotAlive =>
      'Tidak terlihat kedipan. Hadap kamera dan berkedip sekali.';

  @override
  String get faceQualityUnsure =>
      'Wajah belum terbaca jelas. Hadap lurus ke kamera.';

  @override
  String get faceQualityTooFar => 'Wajah terlalu jauh. Mendekat ke kamera.';

  @override
  String get faceQualityTooClose => 'Wajah terlalu dekat. Mundur sedikit.';

  @override
  String get faceQualityOffCentre => 'Tengahkan wajah di dalam bingkai.';

  @override
  String get faceQualityTooDark =>
      'Terlalu gelap. Tambah pencahayaan atau hadap ke arah cahaya.';

  @override
  String get faceServiceDown =>
      'Pengenalan wajah sedang tidak tersedia. Hubungi administrator.';

  @override
  String get faceMismatch => 'Wajah tidak cocok dengan akun ini.';

  @override
  String get faceCameraDenied =>
      'Izin kamera belum diberikan, jadi verifikasi wajah tidak bisa dijalankan.';

  @override
  String get sessionReplaced =>
      'Akun Anda dibuka di HP lain, jadi Anda dikeluarkan dari HP ini.';

  @override
  String sessionReplacedAt(String time) {
    return 'Akun Anda dibuka di HP lain pukul $time, jadi Anda dikeluarkan dari HP ini.';
  }

  @override
  String sessionReplacedOnAt(String device, String time) {
    return 'Akun Anda dibuka di HP lain ($device) pukul $time, jadi Anda dikeluarkan dari HP ini.';
  }

  @override
  String get sessionReplacedElsewhere =>
      'Akun Anda dibuka di perangkat lain, sehingga Anda dikeluarkan dari HP ini.';

  @override
  String sessionReplacedElsewhereAt(String time) {
    return 'Akun Anda dibuka di perangkat lain pukul $time, sehingga Anda dikeluarkan dari HP ini.';
  }

  @override
  String get sessionReplacedDevice => 'Perangkat';

  @override
  String get sessionReplacedSystem => 'Sistem';

  @override
  String get sessionReplacedBrowser => 'Browser';

  @override
  String get sessionReplacedApp => 'Aplikasi';

  @override
  String get sessionReplacedModel => 'Model';

  @override
  String get deviceKindPhone => 'HP';

  @override
  String get deviceKindComputer => 'Komputer';

  @override
  String get deviceKindTablet => 'Tablet';

  @override
  String get changePasswordTitle => 'Ganti Password';

  @override
  String get changePasswordBody =>
      'Pilih password baru untuk akun Anda. Perangkat lain yang sedang masuk akan dikeluarkan.';

  @override
  String get changePasswordForcedBody =>
      'Password Anda dibuat oleh admin dan dipakai bersama. Ganti dulu sebelum memakai aplikasi.';

  @override
  String get changePasswordSubmit => 'Simpan Password';

  @override
  String get passwordCurrent => 'Password saat ini';

  @override
  String get passwordNew => 'Password baru';

  @override
  String get passwordConfirm => 'Ulangi password baru';

  @override
  String passwordRuleHint(int min) {
    return 'Minimal $min karakter, dan tidak boleh sama dengan password default.';
  }

  @override
  String get passwordCurrentRequired => 'Masukkan password Anda saat ini.';

  @override
  String passwordTooShort(int min) {
    return 'Password baru minimal $min karakter.';
  }

  @override
  String get passwordMismatch => 'Dua password baru tidak sama.';

  @override
  String get passwordSameAsCurrent =>
      'Password baru harus berbeda dari yang sekarang.';

  @override
  String get passwordCurrentWrong => 'Itu bukan password Anda saat ini.';

  @override
  String get passwordIsRoleDefault =>
      'Itu password default peran Anda. Pilih password Anda sendiri.';

  @override
  String get passwordTooManyAttempts =>
      'Terlalu banyak percobaan. Tunggu beberapa menit.';

  @override
  String get passwordChanged => 'Password berhasil diganti.';

  @override
  String get sessionEndedByAdmin =>
      'Sesi Anda diakhiri oleh admin, jadi Anda dikeluarkan dari HP ini.';

  @override
  String sessionEndedByAdminAt(String time) {
    return 'Sesi Anda diakhiri oleh admin pukul $time, jadi Anda dikeluarkan dari HP ini.';
  }

  @override
  String get sessionEndedPasswordChanged =>
      'Password akun ini diganti, jadi Anda dikeluarkan dari HP ini.';

  @override
  String sessionEndedPasswordChangedAt(String time) {
    return 'Password akun ini diganti pukul $time, jadi Anda dikeluarkan dari HP ini.';
  }

  @override
  String get announcementDismiss => 'Tutup pengumuman';

  @override
  String get barcodeInfoTitle => 'Info Barcode';

  @override
  String get labCodeLabel => 'Lab Code';

  @override
  String get identityPlace => 'Tempat';

  @override
  String get identityRockType => 'Ore Class';

  @override
  String get identityNonProd => 'Kode Non-Produksi';

  @override
  String get identitySir => 'Sir (Tempat Penumpukan)';

  @override
  String get identityPit => 'Lokasi Pit';

  @override
  String get identityBargingNo => 'Urutan Barging';

  @override
  String get identitySequenceNo => 'No Sample';

  @override
  String get identitySampleNo => 'No Quality';

  @override
  String get identitySackCount => 'Jumlah Karung';

  @override
  String get identityCodesUnavailable =>
      'Daftar kode tidak bisa dimuat, jadi bagian-bagiannya tidak ditampilkan.';

  @override
  String get noSampleIdYet => 'Barcode ini belum punya Sample ID.';

  @override
  String get fillSampleId => 'Isi Sample ID';

  @override
  String get editSampleId => 'Ubah Sample ID';

  @override
  String get sampleIdPreviewTitle => 'Sample ID yang akan tersimpan';

  @override
  String get sampleIdNeedsPlace => 'Isi Tempat untuk menyusun Sample ID.';

  @override
  String sampleIdWas(String ident) {
    return 'Sebelumnya: $ident';
  }

  @override
  String get sampleIdChecking => 'Memeriksa…';

  @override
  String sampleIdClash(String sampleCode) {
    return 'Sample ID ini sudah dipakai oleh $sampleCode.';
  }

  @override
  String get sampleIdUnchanged => 'Belum ada yang diubah.';

  @override
  String get sampleIdSave => 'Simpan Sample ID';

  @override
  String get sampleIdSaved => 'Sample ID tersimpan';

  @override
  String get sampleIdOnlineOnly =>
      'Sample ID disimpan langsung ke server, jadi perlu koneksi.';

  @override
  String get pickerNone => '— tidak ada —';

  @override
  String get pickerChoose => 'Pilih…';

  @override
  String get pickerSearch => 'Cari atau ketik kode baru';

  @override
  String get pickerClear => 'Kosongkan';

  @override
  String pickerCreate(String code) {
    return 'Buat \"$code\"';
  }

  @override
  String get pickerRetired => 'nonaktif';

  @override
  String get pickerNoMatch => 'Tidak ada kode yang cocok.';

  @override
  String get pickerCodeRule =>
      'Kode baru: huruf, angka, atau tanda hubung, maksimal 16.';

  @override
  String pickerCreateFailed(String reason) {
    return 'Kode tidak bisa dibuat: $reason';
  }

  @override
  String numberOutOfRange(int max) {
    return 'Isi bilangan bulat 0–$max.';
  }

  @override
  String get bargingTooLong => 'Maksimal 32 karakter.';

  @override
  String get todoTitle => 'Tugas Menunggu';

  @override
  String get todoEmpty => 'Tidak ada sampel yang menunggu.';

  @override
  String get todoFooter =>
      'Sampel yang sedang ada di tiap tahap dan menunggu dipindah ke tahap berikutnya.';

  @override
  String todoCount(int count) {
    return '$count sampel';
  }

  @override
  String todoOverdue(int count) {
    return '$count lewat SLA';
  }

  @override
  String todoStageFooter(int shown, int total) {
    return 'Menampilkan $shown dari $total sampel, yang paling lama menunggu di atas.';
  }

  @override
  String todoWaitingHours(String hours) {
    return '$hours jam';
  }

  @override
  String get todoNoSampleId => 'Belum ada Sample ID';

  @override
  String get sampleIdRequired =>
      'Isi Sample ID dulu sebelum memperbarui tahap.';

  @override
  String get sampleIdRequiredOffline =>
      'Sampel ini belum punya Sample ID, dan mengisinya perlu koneksi.';

  @override
  String get scanModeUpdate => 'Update Tahap';

  @override
  String get scanModeCheck => 'Cek Barcode';

  @override
  String get checkHasIdent => 'Sudah ada Sample ID';

  @override
  String get checkNotRegistered => 'Barcode tidak terdaftar';

  @override
  String get checkOffline => 'Tidak bisa dicek tanpa koneksi';

  @override
  String get checkOpen => 'Ketuk untuk membuka';

  @override
  String get checkDismiss => 'Tutup';

  @override
  String get checkLabCode => 'Kode Lab';

  @override
  String get checkBarcode => 'Barcode';

  @override
  String get checkSampleId => 'Sample ID';

  @override
  String get checkIdentHiddenValue => 'Disembunyikan admin lab';

  @override
  String get checkTapToFill => 'Ketuk untuk mengisi Sample ID';

  @override
  String get splashTagline => 'Sampel terlacak, dari preparasi sampai laporan';

  @override
  String get loginHeaderSubtitle => 'Sampel lab,\ntercatat rapi.';

  @override
  String get loginWelcome => 'Selamat Datang';

  @override
  String get emailInvalid => 'Format email belum benar';

  @override
  String get forgotPassword => 'Lupa kata sandi?';

  @override
  String get forgotPasswordTitle => 'Lupa kata sandi';

  @override
  String get forgotPasswordBody =>
      'Kata sandi direset oleh admin lab. Hubungi admin, lalu masuk dengan kata sandi sementara yang diberikan.';

  @override
  String get understood => 'Mengerti';

  @override
  String get loginOr => 'atau';

  @override
  String get serverSettings => 'Pengaturan server';

  @override
  String get noAccount => 'Belum punya akun?';

  @override
  String get askAdmin => 'Hubungi admin';

  @override
  String get bannerTitle => 'Siap memindai sampel?';

  @override
  String get bannerBody => 'Arahkan kamera ke barcode label.';

  @override
  String get bannerAction => 'Mulai Scan';

  @override
  String get stagesTitle => 'Tahapan';

  @override
  String get stageAllChip => 'Semua';

  @override
  String get attentionTitle => 'Perlu perhatian';

  @override
  String get seeAllPlain => 'Lihat semua';

  @override
  String get tabHistory => 'Riwayat';

  @override
  String get tabQueue => 'Antrean';

  @override
  String get tabSettings => 'Pengaturan';

  @override
  String get announcementsOpen => 'Lihat pengumuman';

  @override
  String get waitingInStage => 'menunggu';

  @override
  String get pendingCardsTitle => 'Belum terkirim';

  @override
  String get myWorkGridTitle => 'Pekerjaan saya';

  @override
  String get refresh => 'Muat ulang';
}
