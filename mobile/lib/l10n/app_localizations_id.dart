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
  String get roleAdmin => 'Administrator';

  @override
  String get roleOperator => 'Operator';

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
  String get detailUpdateStage => 'Perbarui tahap';

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
  String get appTitle => 'Atara Operator';

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
  String get updateStageTitle => 'Perbarui Tahap';

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
  String get signInOperatorsOnly =>
      'Aplikasi ini khusus Operator. Silakan gunakan situs web.';

  @override
  String get errorForbidden =>
      'Peran akun Anda tidak mengizinkan ini. Aplikasi ini khusus Operator.';

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
}
