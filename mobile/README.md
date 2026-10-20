# Atara Preparator — Aplikasi Mobile

Aplikasi Flutter untuk preparator lapangan/laboratorium: memindai barcode/QR pada label sampel dan memperbarui tahapan prosesnya secara real-time ke backend.

## Tech Stack

- Flutter (Dart). Antarmukanya **sepenuhnya Cupertino** di dalam sebuah
  `MaterialApp`, dengan `AppTheme`/`AppColors` sendiri dan subset font
  **Plus Jakarta Sans** yang dibundel. Bukan Material 3 — tidak ada ripple,
  tidak ada komponen Material yang terlihat.
- Tampilan mengikuti video referensi desain (`referensi untuk app mobile lab.mp4`
  di root repo): palet hijau olive → lime, header hijau bersudut bulat, kartu
  putih lembut, field dan tombol berbentuk pill, ilustrasi lab bergaya flat, dan
  koreografi animasi splash → login → beranda. Warna mobile kini **berbeda**
  dari web (web tetap teal).
- `flutter_svg` — ilustrasi lab dan ikon tahap (`assets/illustrations/`), diwarnai
  ulang per tema lewat `ColorMapper`
- `flutter_riverpod` — state management, gaya `StateNotifier`, tanpa codegen
- `mobile_scanner` — pemindai kamera barcode/QR
- `dio` — HTTP client dengan interceptor auth
- `shared_preferences` — sesi, pengaturan, antrean scan offline, dan cache sampel
- `connectivity_plus` — memicu pengiriman antrean saat koneksi kembali
- `intl` + `flutter_localizations` — dua bahasa (id, en), template ARB `app_id.arb`

## Prasyarat

- Flutter SDK 3.44+ (`flutter doctor` tanpa error blocking)
- Android Studio (SDK + emulator) dan/atau perangkat fisik dengan USB debugging
- Backend web (`../web`) sudah berjalan di `http://localhost:3000` (lihat `../web/README.md`)

## Setup

```bash
flutter pub get
```

### Konfigurasi alamat API

Alamat server **tidak lagi dikompilasi ke dalam aplikasi**. Cara termudah
mengubahnya adalah lewat layar **Pengaturan** di aplikasi — alamat yang tersimpan
di perangkat selalu menang atas nilai bawaan di bawah, dan berlaku tanpa memasang
ulang. Bila server tidak terjangkau, layar error menyebutkan alamat yang dicoba
dan menyediakan pintasan ke layar itu.

Nilai bawaan ada di `lib/services/settings_service.dart`, dipakai hanya ketika
perangkat belum pernah menyimpan alamat sendiri:

```dart
static String get defaultServerUrl {
  final host = Platform.isAndroid ? '172.25.192.1' : 'localhost';
  return 'http://$host:3000/atara/api';
}
```

Ganti dengan mis. `http://192.168.1.10:3000/api`. Port harus cocok dengan yang
dipakai backend — `npm run dev` dan `npm start` di `web/` sama-sama memakai 3000.
Pastikan juga perangkat dan komputer berada di jaringan Wi-Fi yang sama, dan
firewall mengizinkan port 3000: Windows Firewall biasanya **membuang** koneksi
masuk secara diam-diam alih-alih menolaknya, sehingga tampak sebagai timeout
sepuluh detik, bukan penolakan cepat.

### Menjalankan aplikasi

```bash
flutter run
```

Akun hasil seed backend (`../web/prisma/seed.ts`):

| Peran | Email | Kata sandi |
|---|---|---|
| Preparator | `preparator@atara.local` | lihat catatan |
| Administrator | `admin@atara.local` | lihat catatan |

> **Catatan kata sandi.** Akun ini dibuat oleh `npm run db:seed`. Di lingkungan pengembangan kata sandinya ada di `prisma/seed.ts`. Di produksi seed **menolak** membuat akun kecuali `SEED_ADMIN_PASSWORD` (minimal 12 karakter) diberikan, dan akun preparator contoh tidak dibuat sama sekali. Ganti kata sandi admin setelah masuk pertama kali.

Keduanya masuk lewat endpoint yang sama. **Tidak ada pembatasan peran pada
autentikasi** — admin bukan pintu terpisah.

Yang berbeda setelah masuk hanya satu hal: di layar Perbarui Status, seorang
administrator yang memilih tahap **bukan urutan berikutnya** mendapat panel
override dengan alasan wajib, dan scan-nya dikirim sebagai koreksi. Preparator
tidak melihat apa pun yang baru. Sisa kemampuan admin di web — buat sampel, cetak
label, entri assay, master data, aktivitas lintas-preparator, manajemen pengguna —
tidak punya permukaan di aplikasi ini.

### Verifikasi dua langkah

`POST /api/auth/login` punya **dua bentuk sukses**, keduanya HTTP 200:

- Akun tanpa faktor kedua → berisi `token` dan langsung masuk.
- Akun dengan faktor kedua → berisi `mfaRequired: true`, `methods`, `challenge`,
  dan `expiresIn`, **tanpa token**. Aplikasi mendorong layar Verifikasi Identitas.

Yang didukung aplikasi ini: **kode authenticator (TOTP)** dan **pendaftaran
authenticator**. **Verifikasi wajah belum ada di mobile** — akun yang hanya punya
wajah terdaftar diberi tahu untuk menyelesaikannya lewat situs web.

Hal yang paling menghemat waktu saat mencoba: **akun hasil seed tidak punya faktor
kedua sama sekali**, jadi keduanya masuk langsung. Untuk melihat alurnya,
seorang administrator harus lebih dulu meminta authenticator untuk sebuah akun
dari web (Pengguna → kelola authenticator, yaitu `POST /api/users/{id}/totp`).
Sesudah itu login berikutnya akan menawarkan `totp-setup`.

Yang perlu diketahui tentang perilakunya:

- `challenge` berlaku **120 detik** dan sekali pakai. Habis waktu berarti kembali
  ke kata sandi.
- Kode yang **salah tidak menghabiskan** challenge — boleh dicoba lagi tanpa
  mengulang kata sandi. Wajah yang tidak cocok **menghabiskannya**.
- Kunci diambil **manual**, bukan QR. Di satu HP, authenticator ada di HP yang
  sama dan layar sendiri tidak bisa difoto, jadi QR justru tak berguna di kasus
  normalnya.
- Batas gagal **5 percobaan / 15 menit** dan **dibagi bersama** antara kata sandi,
  wajah, dan kode.

Sisi server perlu dua variabel lingkungan atau alurnya gagal dengan 500:
`MFA_ENCRYPTION_KEY` (32 bita, base64) dan `JWT_SECRET`.

## Alur Penggunaan

1. **Home** — menampilkan info preparator yang login, tombol besar "SCAN BARCODE SAMPEL", dan 5 riwayat scan terakhir di perangkat.
2. **Scanner** — kamera pemindai dengan overlay kotak bidik, kontrol flash & switch kamera; saat barcode terbaca, muncul haptic feedback + bunyi klik, lalu otomatis membuka halaman Update Status.
3. **Update Status** — mengambil detail sampel dari `GET /api/samples/:code`. Jika kode tidak terdaftar, tampil alert "Sampel Tidak Terdaftar" dengan tombol scan ulang. Jika ditemukan, preparator memilih tahapan berikutnya, menambahkan catatan opsional, lalu menekan "Simpan & Update Tahapan" (`POST /api/samples/scan`), lalu kembali ke Home.

   Bagi administrator, memilih tahap yang **bukan** urutan berikutnya memunculkan
   panel override dengan alasan wajib (minimal 5 karakter). Pada koreksi, server
   mencatat alasan itu sebagai catatan, jadi kolom Catatan Lapangan menjadi
   hanya-baca dan tidak dikirim — kalau tidak, apa yang diketik di sana akan
   hilang tanpa pemberitahuan.
4. **Tanpa sinyal** — scan tersimpan di antrean di HP dan terkirim sendiri saat
   koneksi kembali; antreannya bisa dilihat dan dicoba ulang dari Beranda.
   Override yang diantre tetap membawa `force` dan alasannya.
5. **Riwayat Scan** — scan milik preparator itu sendiri, dikelompokkan per hari
   shift, dimuat bertahap 20 baris dan berhenti otomatis setelah ~200 baris
   sampai diminta lagi. Endpoint-nya sengaja hanya mengembalikan baris milik
   pemanggil; rekap lintas-preparator ada di situs web.

## Build

```bash
flutter build apk --debug      # APK debug untuk pengujian cepat
flutter build apk --release    # APK release (perlu signing config sendiri untuk produksi)
```

## Struktur Kode

```
lib/
  l10n/          # ARB (app_id.arb adalah template) + berkas tergenerasi
  models/        # SampleModel, StageModel, UserModel, WorkSummary,
                 # SampleLogEntry, PendingScan, LoginResult
  services/      # ApiService (Dio + interceptor), SessionService,
                 # PendingScanService + ScanSyncService (antrean offline),
                 # cache sampel/stage/ringkasan, dan keputusan murni yang
                 # diangkat keluar dari layar: scan_gate, scan_request,
                 # api_error_text, second_factor_error_text, time_text
  providers/     # session, stages, my_work, pending_scans, scan_history,
                 # settings, theme, onboarding
  screens/       # Splash, Onboarding, Login, SecondFactor, HomeShell, Home,
                 # Scanner, UpdateStatus, SampleDetail, ScanHistory, Queue,
                 # Settings
  widgets/       # ios/ (AppPage, InsetSection, AppButton, AppToast),
                 # brand/ (Illustration, Wordmark, GreenHeader),
                 # motion/ (Reveal, EnterReveal, StaggeredColumn,
                 # GateTransition, Pressable), home/ (header, chip tahap),
                 # PillField, dan bagian layar: MyWorkSection,
                 # PendingScanSection, TodoSection, SampleHistory,
                 # StagePicker, StatusView, skeletons
  theme/         # AppTheme, AppColors (palet olive/lime, light + dark),
                 # AppText, AppMotion (durasi, kurva, stagger)
```

Pola yang berulang dan layak diketahui sebelum menyunting: **keputusan yang
layak dites diangkat keluar dari layar menjadi fungsi murni** di `services/` —
`scan_gate.dart`, `scan_request.dart`, `second_factor_error_text.dart` — supaya
bisa diuji tanpa memompa widget, dan supaya aturannya tidak diterapkan di satu
jalur lalu terlupa di jalur lain.
