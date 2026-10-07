# Atara — Web & Backend API

Backend REST API dan dashboard web untuk Atara — sistem tracking & monitoring sampel — dibangun dengan Next.js (App Router), TypeScript, Prisma ORM, MySQL, Tailwind CSS, dan shadcn/ui. Antarmuka tersedia dalam dua bahasa (id, en); teksnya ada di `messages/`.

## Prasyarat

- Node.js 20+
- MySQL/MariaDB berjalan secara lokal (mis. via XAMPP) atau dapat diakses dari jaringan
- Layanan wajah di `../face` — hanya diperlukan bila ada akun yang masuk dengan wajah (lihat [`../face/README.md`](../face/README.md))

## Setup

1. Install dependencies (sekaligus menjalankan `prisma generate`):

   ```bash
   npm install
   ```

2. Salin `.env.example` menjadi `.env`, lalu isi variabelnya (lihat [Variabel Lingkungan](#variabel-lingkungan)):

   ```bash
   cp .env.example .env
   ```

3. Buat database MySQL kosong (nama bebas, sesuaikan dengan `DATABASE_URL`):

   ```sql
   CREATE DATABASE atara_tracking CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

4. Jalankan migrasi Prisma untuk membuat seluruh tabel:

   ```bash
   npm run db:migrate
   ```

5. Isi data awal (satu akun per peran + 5 tahapan standar):

   ```bash
   npm run db:seed
   npm run db:seed-master   # opsional: master data penyusun Sample ID
   ```

6. Jalankan development server:

   ```bash
   npm run dev
   ```

   Buka [http://localhost:3000](http://localhost:3000) — akan diarahkan ke halaman `/login`.

## Variabel Lingkungan

| Variabel             | Keterangan |
| -------------------- | ---------- |
| `DATABASE_URL`       | Koneksi MySQL. Contoh di `.env.example` sudah menyertakan `connection_limit=25&pool_timeout=5`: satu render dashboard memakai belasan query, dan permintaan yang tidak kebagian koneksi langsung gagal menjadi `503` dengan `Retry-After` alih-alih menggantung. |
| `JWT_SECRET`         | Rahasia penanda tangan token sesi. Wajib diganti di produksi. |
| `TRUST_PROXY`        | Isi `1` **hanya** bila ada reverse proxy di depan aplikasi yang menambahkan `x-forwarded-for` sendiri. Jika tidak, pembatas percobaan masuk akan mempercayai header yang bisa diatur klien. |
| `FACE_SERVICE_URL`   | Alamat layanan wajah, default `http://127.0.0.1:8001`. Harus loopback. |
| `FACE_SERVICE_TOKEN` | Rahasia bersama dengan layanan wajah — **harus sama** dengan `FACE_SERVICE_TOKEN` di `face/.env`. Browser tidak pernah melihatnya: frame mengalir browser → Next.js → layanan wajah. |
| `MFA_ENCRYPTION_KEY` | Kunci untuk mengenkripsi rahasia TOTP sebelum disimpan, sehingga salinan tabel `users` saja tidak cukup untuk membuat kode. 32 byte acak dalam base64: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Mengubahnya membatalkan semua authenticator yang sudah disiapkan; admin harus meresetnya dari halaman Pengguna. |

## Akun Default (hasil seed)

| Peran    | Email                  | Password      |
| -------- | ---------------------- | ------------- |
| ADMIN    | admin@atara.local      | lihat catatan |
| DATABASE | database@atara.local   | lihat catatan |
| ANALISIS | analisis@atara.local   | lihat catatan |
| OPERATOR | operator@atara.local   | lihat catatan |

> **Catatan kata sandi.** Akun ini dibuat oleh `npm run db:seed`. Di lingkungan pengembangan kata sandinya ada di `prisma/seed-policy.ts`. Di produksi seed **menolak** membuat akun kecuali `SEED_ADMIN_PASSWORD` (minimal 12 karakter) diberikan, dan hanya akun admin yang dibuat; akun contoh peran lain tidak dibuat sama sekali. Ganti kata sandi admin setelah masuk pertama kali.

## Peran

Siapa boleh melakukan apa ditentukan di satu tempat, `src/lib/permissions.ts`. Halaman, API, dan menu samping semuanya membaca tabel yang sama.

| Peran    | Website                                                                                                  | Aplikasi mobile                                   |
| -------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| ADMIN    | Dashboard (termasuk pengaturan SLA & export), Database Sampel (hanya lihat, export, data terhapus), Kualitas Data, Kesimpulan, Aktivitas, Pengguna, Master Data, Administrasi, koreksi tahap dari halaman sampel | —                                                 |
| DATABASE | Dashboard, Buat Barcode, Cetak Ulang Label, Database Sampel (edit, hapus/pulihkan, export), Kualitas Data, Kesimpulan | —                                                 |
| ANALISIS | Dashboard, Input Hasil Uji, Kesimpulan                                                                    | —                                                 |
| OPERATOR | Dashboard                                                                                                  | Scan & perbarui tahap, termasuk koreksi (mundur/lompat tahap) dengan alasan |

## Autentikasi

Masuk dengan email + kata sandi; sesi disimpan sebagai JWT di cookie httpOnly. Satu akun hanya punya satu sesi aktif per jenis klien — browser dan aplikasi menanyakan `/api/auth/session` setiap beberapa detik, sehingga perangkat yang sesinya diambil alih oleh login lain segera tahu.

Akun yang punya faktor kedua tidak menerima cookie apa pun setelah langkah kata sandi; cookie baru diberikan setelah faktor kedua lolos:

- **Wajah** — admin mendaftarkan wajah pengguna dari halaman Pengguna (lima pose, dengan persetujuan eksplisit karena biometrik adalah *data pribadi spesifik* menurut UU PDP No. 27/2022). Saat masuk, frame dikirim ke `/api/auth/face`, diteruskan ke layanan wajah, lalu dicocokkan dan diperiksa kedipannya di sini (`src/lib/face-*.ts`). Jika layanan wajah mati, jawabannya `503` tanpa sesi — faktor kedua tidak pernah dilewati.
- **TOTP** — kode 6 digit dari aplikasi authenticator. Admin meminta pengguna menyiapkannya dari halaman Pengguna; permintaan berlaku 24 jam dan disiapkan oleh pengguna sendiri saat masuk berikutnya.

Akun baru dan akun yang kata sandinya direset memakai kata sandi default per peran (diatur di Administrasi) dan wajib menggantinya di `/change-password` saat masuk pertama.

## Struktur Halaman

| Halaman                         | Isi |
| ------------------------------- | --- |
| `/login`                        | Masuk dengan kata sandi, lalu wajah atau TOTP bila akun memilikinya. |
| `/change-password`              | Ganti kata sandi (wajib setelah kata sandi default). |
| `/dashboard`                    | KPI, progres per tahap, waktu siklus, sampel yang lewat SLA, tabel monitoring, export laporan. |
| `/samples/generate`             | Generate sampel (satu/massal) + preview & cetak label QR grid A4. |
| `/samples/labels`               | Cetak ulang label. |
| `/samples/[code]`               | Detail sampel, hasil uji, timeline perpindahan tahapan, koreksi tahap (admin). |
| `/samples/[code]/sub/[subCode]` | Detail sub-sampel. |
| `/database`                     | Database Sampel: cari, edit identitas, hapus/pulihkan, export. |
| `/data-quality`                 | Sampel dengan identitas belum lengkap atau belum ada hasil setelah sekian hari. |
| `/assay`                        | Input Hasil Uji: grid, tempel dari spreadsheet, atau impor workbook. |
| `/assay/history`                | Riwayat perubahan hasil uji. |
| `/grade`                        | Kesimpulan: rata-rata kadar per pit, SIR, lokasi, jenis batuan, kode non-prod, atau barging run. |
| `/activity`                     | Jejak perpindahan tahap per operator dan audit percobaan masuk. |
| `/users`                        | Kelola pengguna, sesi aktif, pendaftaran wajah, dan TOTP. |
| `/master-data`                  | Kosakata penyusun Sample ID (tempat, jenis batuan, non-prod, pit, SIR). |
| `/admin`                        | Pengumuman di atas semua halaman, kata sandi default per peran, dan backup lengkap. |
| `/help`                         | Panduan pemakaian sesuai halaman yang bisa dibuka peran pengguna. |
| `/tv`                           | Tampilan monitoring layar penuh untuk TV di lab. |

## REST API

Semua endpoint berada di bawah `/api` dan mengembalikan bentuk `{ success, data }` atau `{ success: false, error }`. Hak akses per endpoint mengikuti `src/lib/permissions.ts`.

### Autentikasi & sesi

| Method | Endpoint                  | Deskripsi |
| ------ | ------------------------- | --------- |
| POST   | `/api/auth/login`         | Langkah kata sandi. Tanpa faktor kedua → set cookie sesi; dengan faktor kedua → challenge untuk langkah berikutnya. |
| POST   | `/api/auth/face`          | Langkah wajah: burst frame → sesi. |
| POST   | `/api/auth/totp`          | Langkah TOTP: kode authenticator → sesi. |
| POST   | `/api/auth/totp/setup`    | Menyiapkan authenticator yang diminta admin. |
| POST   | `/api/auth/logout`        | Akhiri sesi dan hapus cookie. |
| GET    | `/api/auth/me`            | Info user dari token/cookie aktif. |
| GET    | `/api/auth/session`       | Apakah sesi ini masih berlaku (ditanyakan berkala oleh web & mobile). |
| POST   | `/api/auth/password`      | Ganti kata sandi sendiri. |
| POST   | `/api/auth/guide-seen`    | Tandai panduan sambutan sudah dilihat. |
| POST   | `/api/face/preview`       | Umpan balik kamera langsung (posisi, cahaya) selama pengambilan wajah. |
| POST   | `/api/face/reading`       | Satu pembacaan untuk pendaftaran wajah (admin). |

### Sampel & tahapan

| Method      | Endpoint                     | Deskripsi |
| ----------- | ---------------------------- | --------- |
| GET / POST  | `/api/samples`               | Daftar sampel (filter, pagination) / buat 1 sampel baru. |
| POST        | `/api/samples/generate`      | Generate sampel massal. |
| GET         | `/api/samples/[code]`        | Detail sampel + seluruh riwayat log (timeline). |
| POST        | `/api/samples/[code]/stage`  | Koreksi tahap dari web oleh admin, selalu dengan alasan. |
| POST        | `/api/samples/scan`          | Endpoint utama mobile: `{ sample_code, stage_id, notes?, force?, reason? }`. Operator diambil dari sesi; `force` + `reason` untuk koreksi mundur/lompat tahap. |
| GET         | `/api/samples/scan/mine`     | Riwayat scan operator yang sedang masuk. |
| POST        | `/api/samples/delete`        | Hapus (soft) atau pulihkan sampel. |
| GET         | `/api/samples/export`        | Unduh daftar sampel. |
| GET         | `/api/samples/lookup`        | Pencarian cepat (Ctrl+K). |
| GET         | `/api/samples/board`         | Data tampilan TV: posisi setiap sampel aktif per tahap. |
| GET         | `/api/stages`                | Daftar tahapan (untuk dropdown mobile & web). |
| PATCH       | `/api/stages/[id]`           | Ubah deskripsi tahapan. |
| GET         | `/api/stage-activity`        | Jejak siapa memindahkan sampel ke tahap mana (+ `/export`). |

### Hasil uji

| Method | Endpoint                              | Deskripsi |
| ------ | ------------------------------------- | --------- |
| GET    | `/api/lab-records`                    | Daftar record hasil uji. |
| PATCH  | `/api/lab-records/[id]`               | Ubah satu record. |
| PATCH  | `/api/lab-records/bulk`               | Simpan banyak baris sekaligus dari grid, termasuk sub-sampel baru. |
| PATCH  | `/api/lab-records/identity`           | Isi identitas (Sample ID) banyak record sekaligus; mendukung `dryRun`. |
| POST   | `/api/lab-records/resolve`            | Cocokkan Sample ID dari sheet yang ditempel ke record yang ada. |
| POST   | `/api/lab-records/import`             | Impor hasil dari teks yang ditempel. |
| POST   | `/api/lab-records/import/sheet`       | Ubah workbook yang diunggah menjadi teks untuk kotak tempel. |
| GET    | `/api/lab-records/template`           | Unduh template sheet kosong. |
| GET    | `/api/lab-records/export`             | Unduh hasil uji. |
| DELETE | `/api/lab-records/subs`               | Hapus sub-sampel yang salah input. |
| GET    | `/api/lab-records/history`, `/[id]/history` | Riwayat perubahan hasil uji (semua / per record). |
| GET    | `/api/grade-control`                  | Rata-rata kadar per dimensi untuk halaman Kesimpulan. |

### Dashboard & laporan

| Method | Endpoint                    | Deskripsi |
| ------ | --------------------------- | --------- |
| GET    | `/api/analytics`            | Angka dan grafik dashboard. |
| GET    | `/api/analytics/report`     | Angka dashboard sebagai workbook, sama persis dengan layar. |
| GET    | `/api/data-quality`         | Daftar Kualitas Data (+ `/export`). |

### Administrasi

| Method              | Endpoint                                  | Deskripsi |
| ------------------- | ----------------------------------------- | --------- |
| GET / POST          | `/api/users`                              | Daftar / buat pengguna. |
| PATCH               | `/api/users/[id]`                         | Ubah pengguna. |
| POST                | `/api/users/[id]/reset-password`          | Reset ke kata sandi default peran. |
| POST / DELETE       | `/api/users/[id]/face`                    | Daftarkan / hapus wajah pengguna. |
| POST / DELETE       | `/api/users/[id]/totp`                    | Minta penyiapan / reset authenticator. |
| GET / DELETE        | `/api/users/[id]/sessions`, `/[sessionId]` | Lihat / akhiri sesi aktif pengguna. |
| GET                 | `/api/sign-in-audit`                      | Audit percobaan masuk (+ `/export`). |
| GET / POST, PATCH / DELETE | `/api/master-options`, `/[id]`     | Kelola master data. |
| GET / POST, PATCH / DELETE | `/api/announcements`, `/[id]`      | Kelola pengumuman. |
| GET / PUT           | `/api/admin/role-passwords`               | Kata sandi default per peran (kata sandinya sendiri tidak pernah dikembalikan). |
| GET                 | `/api/admin/backup`                       | Backup seluruh database sebagai satu workbook. |
| GET                 | `/api/health`                             | Cek kesehatan untuk load balancer/monitor, tanpa autentikasi. |

## Perintah Berguna

```bash
npm run dev               # development server
npm run build             # production build
npm start                 # jalankan hasil build
npm run lint              # ESLint
npm test                  # vitest (sekali jalan); npm run test:watch untuk mode watch
npm run db:migrate        # jalankan migrasi Prisma
npm run db:seed           # isi akun & tahapan awal
npm run db:seed-master    # isi master data Sample ID
npm run db:seed-dummy     # isi sampel dummy untuk pengembangan
npm run db:reset-samples  # hapus SEMUA sampel, log, dan hasil uji (akun & tahapan tetap)
npm run db:studio         # buka Prisma Studio (GUI database)
```

Tes end-to-end wajah (`src/lib/__tests__/face-e2e.test.ts`) dilewati kecuali server web dan layanan wajah sama-sama berjalan; lihat [`../face/README.md`](../face/README.md#tes-end-to-end).

## Catatan Konfigurasi Perangkat Mobile

Aplikasi Flutter di folder `../mobile` mengakses API ini di `http://<alamat-server>:3000/api`. Alamatnya diatur dari layar **Pengaturan** di aplikasi, tanpa perlu build ulang; nilai bawaannya ada di `mobile/lib/services/settings_service.dart`.

- Android emulator: `http://10.0.2.2:3000/api`.
- Perangkat fisik: gunakan alamat IP LAN komputer yang menjalankan server ini (mis. `http://192.168.1.10:3000/api`), pastikan perangkat berada di jaringan Wi-Fi yang sama, dan izinkan port 3000 di Windows Firewall.
