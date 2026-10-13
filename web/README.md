# Atara — Web & Backend API

Backend REST API dan web untuk **Atara Super App**. Atara adalah satu aplikasi dengan beberapa modul, satu modul untuk setiap departemen. Dibangun dengan Next.js 16 (App Router), TypeScript, Prisma ORM, MySQL, Tailwind CSS, dan shadcn/ui. Antarmuka tersedia dalam dua bahasa (id, en); teksnya ada di `src/core/messages/` dan `src/modules/<modul>/messages/`.

## Konsep Super App

| Modul | Path | Untuk siapa | Isi |
| ----- | ---- | ----------- | --- |
| **Lab · Monitoring Sampel** | `/lab/*` | Departemen **LAB** | Seluruh fitur tracking sampel: barcode, database sampel, hasil uji, kesimpulan, dashboard, Mode TV, master data, aktivitas. |
| **Eksplorasi** | `/eksplorasi/*` | Departemen **EKSPLORASI** | Manage Data Drilling: CRUD lubang bor, serta import/export Excel & CSV (import ±34.000 baris dalam hitungan detik). Fitur detail menyusul. |
| **Pengaturan** | `/users`, `/admin/*` | **Super Admin**, **Admin Lab** (hanya Pengguna) | Akun admin setiap departemen (super admin) atau staf lab (admin lab), pengumuman, audit login, backup. |

Tampilannya dibagi dua, seperti Odoo:

- **Pemilih aplikasi (`/home`).** Semua orang mendarat di sini setelah masuk. Layarnya tanpa sidebar dan berisi kartu untuk setiap modul yang boleh dibuka. Setiap kartu memuat deskripsi singkat dan pintasan yang bisa diklik langsung ke halaman-halaman modul yang boleh dibuka akun tersebut.
- **Tampilan modul.** Setelah sebuah kartu dibuka, sidebar hanya berisi menu modul itu.
  - Nama modul di puncak sidebar adalah **app switcher** untuk pindah ke modul lain atau kembali ke semua aplikasi.
  - Header desktop menampilkan **breadcrumb** (misalnya Lab › Database Sampel).
  - Sidebar bisa **diciutkan** menjadi ikon saja agar tabel lebar punya ruang.

Halaman Panduan (`/help`) bukan milik modul mana pun, jadi tampil seperti pemilih, tanpa sidebar.

Aturan akses:

- `src/core/lib/auth/permissions.ts` menyimpan peran (`UserRole`), departemen (`Department`), dan *persona*, yaitu pasangan keduanya (misalnya `ADMIN` + `LAB` = `LAB_ADMIN`). Setiap pemeriksaan memanggil `can(session, capability)`.
- Setiap modul menulis tabel capability → persona miliknya sendiri di `src/modules/<modul>/capabilities.ts`. Semua tabel digabung di `src/modules/capabilities.ts`.
- `src/modules/system/lib/user-scope.ts` menentukan akun mana yang boleh dikelola oleh siapa (lihat [Peran](#peran)).

## Arsitektur Modul

Kode dibagi per modul agar modul baru bisa ditambahkan tanpa menyentuh modul lain:

```
src/
  app/            Routing saja: halaman dan route handler tipis.
    (app)/lab/…  (app)/eksplorasi/…  (app)/{home,help,users,admin}
    api/(core)/  api/(lab)/  api/(eksplorasi)/  api/(system)/    ← route group, URL tetap /api/...
  core/           Infrastruktur bersama: auth, sesi, HTTP helper, i18n, UI kit, layout.
  modules/
    registry.ts  capabilities.ts  messages.ts  backup.ts            ← satu baris per modul
    lab/  eksplorasi/  system/
      module.ts         manifest: path, ikon, persona, menu, panduan, tour
      capabilities.ts   capability → persona
      types.ts  validation.ts  lib/  components/  messages/{id,en}.json
prisma/schema/    core.prisma  lab.prisma  eksplorasi.prisma  system.prisma
prisma.config.ts  lokasi schema, migrasi, dan seed
```

Aturan impor:

- `core` tidak mengimpor modul, kecuali lewat empat file registry.
- Sebuah modul hanya mengimpor `core` dan dirinya sendiri.
- Route `api/(<modul>)` hanya mengimpor modulnya sendiri.
- Tidak ada barrel `index.ts`.
- Setiap file maksimal 300 baris kode, tidak termasuk komentar dan baris kosong.

Semua aturan ini ditegakkan oleh `npm run lint` dan test arsitektur (`src/core/lib/__tests__/architecture.test.ts`).

Browser hanya menerima teks UI milik core dan milik modul yang dipegang persona. Admin Eksplorasi, misalnya, tidak mengunduh teks modul Lab.

**Menambah modul baru:** jalankan `npm run module:new -- <key>`, lalu ikuti baris registrasi yang dicetaknya. Panduan lengkap untuk developer ada di **[`docs/MODULES.md`](docs/MODULES.md)**: konvensi, resep (halaman, API, list, import/export), aturan performa, pola pemecahan file, testing, dan checklist PR.

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

5. Isi data awal (super admin, satu akun per peran di setiap departemen, dan 5 tahapan standar):

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
| `APP_HTTPS`          | `1` bila situs dilayani lewat HTTPS, `0` untuk server HTTP biasa (mis. server lokal `http://192.168.x.x`). Kosong = HTTPS diasumsikan di production. Mengatur flag `Secure` cookie sesi, HSTS, dan `upgrade-insecure-requests`. Dibaca saat `next build` — build ulang setelah mengubahnya. Catatan: kamera (login/enrol wajah) tetap hanya jalan di HTTPS atau `localhost`; untuk uji coba di HTTP bisa pakai `chrome://flags/#unsafely-treat-insecure-origin-as-secure` dengan origin server. |
| `NEXT_PUBLIC_BASE_PATH` | Sub-path bila aplikasi disajikan di bawah reverse proxy, mis. `/atara` untuk `http://host/atara`. Kosong = aplikasi memegang seluruh origin. Dibaca saat `next build` — build ulang setelah mengubahnya. Proxy harus meneruskan path **dengan** prefix-nya (Caddy: `handle /atara* { reverse_proxy 127.0.0.1:3010 }`, bukan `handle_path`). Di kode, setiap `fetch`/`location.href`/`<a href>` ke path internal wajib lewat `withBasePath()` dari `@/core/lib/http/base-path`; `<Link>`, router, dan `redirect()` sudah otomatis. App mobile: isi alamat server dengan sub-path-nya. |
| `FACE_SERVICE_URL`   | Alamat layanan wajah, default `http://127.0.0.1:8001`. Harus loopback. |
| `FACE_SERVICE_TOKEN` | Rahasia bersama dengan layanan wajah — **harus sama** dengan `FACE_SERVICE_TOKEN` di `face/.env`. Browser tidak pernah melihatnya: frame mengalir browser → Next.js → layanan wajah. |
| `MFA_ENCRYPTION_KEY` | Kunci untuk mengenkripsi rahasia TOTP sebelum disimpan, sehingga salinan tabel `users` saja tidak cukup untuk membuat kode. 32 byte acak dalam base64: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Mengubahnya membatalkan semua authenticator yang sudah disiapkan; admin harus meresetnya dari halaman Pengguna. |

## Akun Default (hasil seed)

| Peran       | Departemen | Email                    | Password      |
| ----------- | ---------- | ------------------------ | ------------- |
| SUPER_ADMIN | —          | superadmin@atara.local   | lihat catatan |
| ADMIN       | LAB        | admin@atara.local        | lihat catatan |
| DATABASE    | LAB        | database@atara.local     | lihat catatan |
| ANALISIS    | LAB        | analisis@atara.local     | lihat catatan |
| OPERATOR    | LAB        | operator@atara.local     | lihat catatan |
| ADMIN       | EKSPLORASI | eksplorasi@atara.local   | lihat catatan |

> **Catatan kata sandi.** Akun ini dibuat oleh `npm run db:seed`. Di lingkungan pengembangan kata sandinya ada di `prisma/seed-policy.ts`. Di produksi seed **menolak** membuat akun kecuali `SEED_ADMIN_PASSWORD` (minimal 12 karakter) diberikan, dan yang dibuat hanya akun **super admin**; akun contoh lainnya tidak dibuat sama sekali. Super admin lalu membuat admin setiap departemen dari halaman Akun Admin. Ganti kata sandi super admin setelah masuk pertama kali.

## Peran

Setiap akun punya **peran** dan **departemen** (kolom `users.department`; null hanya untuk super admin). Siapa boleh melakukan apa ditentukan di `src/core/lib/auth/permissions.ts` dan tabel `capabilities.ts` tiap modul. Halaman, API, dan menu samping semuanya membaca tabel yang sama. Pasangan peran–departemen yang tidak valid, misalnya `OPERATOR` di `EKSPLORASI`, ditolak saat validasi dan tidak mendapat hak apa pun.

| Persona (peran + departemen) | Website | Aplikasi mobile |
| ---------------------------- | ------- | --------------- |
| **SUPER_ADMIN** (tanpa departemen) | Pemilih aplikasi, Pengaturan: Pengguna (kelola admin Lab & Eksplorasi + password default role ADMIN), Administrasi (pengumuman, backup), Audit Login. Tidak masuk ke fitur modul. | — |
| **Admin Lab** (ADMIN + LAB) | Dashboard lab (termasuk pengaturan SLA & export), Database Sampel (hanya lihat, export, data terhapus), Kualitas Data, Kesimpulan, Aktivitas, Master Data, Pengguna di tile Pengaturan (staf lab + password default-nya), koreksi tahap dari halaman sampel | — |
| DATABASE (LAB) | Dashboard, Buat Barcode, Cetak Ulang Label, Database Sampel (edit, hapus/pulihkan, export), Kualitas Data, Kesimpulan | — |
| ANALISIS (LAB) | Dashboard, Input Hasil Uji, Kesimpulan | — |
| OPERATOR (LAB) | Dashboard | Scan & perbarui tahap, termasuk koreksi (mundur/lompat tahap) dengan alasan |
| **Admin Eksplorasi** (ADMIN + EKSPLORASI) | Data Drilling (tambah, ubah, cari, hapus) | — |

**Siapa mengelola akun siapa** (`src/modules/system/lib/user-scope.ts`):

- **Super admin** hanya mengelola akun `ADMIN` milik setiap departemen. Hanya ada satu super admin. Akun ini dibuat oleh seed dan tidak bisa dibuat lewat UI.
- **Admin Lab** hanya mengelola staf departemennya sendiri, yaitu `DATABASE`, `ANALISIS`, dan `OPERATOR` di LAB.
- **Admin Eksplorasi** belum punya staf untuk dikelola.

Akun di luar cakupan tidak muncul di daftar, dan setiap route `/api/users/[id]/*` menjawab `404` untuk akun tersebut.

## Autentikasi

Masuk dengan email + kata sandi; sesi disimpan sebagai JWT di cookie httpOnly. Satu akun hanya punya satu sesi aktif per jenis klien — browser dan aplikasi menanyakan `/api/auth/session` setiap beberapa detik, sehingga perangkat yang sesinya diambil alih oleh login lain segera tahu.

Akun yang punya faktor kedua tidak menerima cookie apa pun setelah langkah kata sandi; cookie baru diberikan setelah faktor kedua lolos:

- **Wajah** — admin mendaftarkan wajah pengguna dari halaman Pengguna (lima pose, dengan persetujuan eksplisit karena biometrik adalah *data pribadi spesifik* menurut UU PDP No. 27/2022). Saat masuk, frame dikirim ke `/api/auth/face`, diteruskan ke layanan wajah, lalu dicocokkan dan diperiksa kedipannya di sini (`src/core/lib/face/`). Jika layanan wajah mati, jawabannya `503` tanpa sesi — faktor kedua tidak pernah dilewati.
- **TOTP** — kode 6 digit dari aplikasi authenticator. Admin meminta pengguna menyiapkannya dari halaman Pengguna; permintaan berlaku 24 jam dan disiapkan oleh pengguna sendiri saat masuk berikutnya.

Akun baru dan akun yang kata sandinya direset memakai kata sandi default per peran dan wajib menggantinya di `/change-password` saat masuk pertama. Kata sandi default diatur di bagian bawah halaman Pengguna. Setiap pengelola hanya mengatur default untuk peran yang ia kelola.

## Struktur Halaman

| Halaman                             | Isi |
| ----------------------------------- | --- |
| `/login`                            | Masuk dengan kata sandi, lalu wajah atau TOTP bila akun memilikinya. |
| `/change-password`                  | Ganti kata sandi (wajib setelah kata sandi default). |
| `/home`                             | Pemilih aplikasi (tanpa sidebar): kartu modul yang boleh dibuka akun ini, dengan menu yang tersedia di dalamnya. Tujuan setelah login. |
| **Modul Lab**                       | |
| `/lab/dashboard`                    | KPI, progres per tahap, waktu siklus, sampel yang lewat SLA, tabel monitoring, export laporan. |
| `/lab/samples/generate`             | Generate sampel (satu/massal) + preview & cetak label QR grid A4. |
| `/lab/samples/labels`               | Cetak ulang label. |
| `/lab/samples/[code]`               | Detail sampel, hasil uji, timeline perpindahan tahapan, koreksi tahap (admin lab). |
| `/lab/samples/[code]/sub/[subCode]` | Detail sub-sampel. |
| `/lab/database`                     | Database Sampel: cari, edit identitas, hapus/pulihkan, export. |
| `/lab/data-quality`                 | Sampel dengan identitas belum lengkap atau belum ada hasil setelah sekian hari. |
| `/lab/assay`                        | Input Hasil Uji: grid, tempel dari spreadsheet, atau impor workbook. |
| `/lab/assay/history`                | Riwayat perubahan hasil uji. |
| `/lab/grade`                        | Kesimpulan: rata-rata kadar per pit, SIR, lokasi, jenis batuan, kode non-prod, atau barging run. |
| `/lab/activity`                     | Jejak perpindahan tahap per operator. |
| `/lab/master-data`                  | Kosakata penyusun Sample ID (tempat, jenis batuan, non-prod, pit, SIR). |
| `/lab/tv`                           | Tampilan monitoring layar penuh untuk TV di lab. |
| **Modul Eksplorasi**                | |
| `/eksplorasi/drilling`              | Data Drilling: daftar lubang bor, cari (Hole ID/area), filter status, tambah/ubah/hapus, import & export Excel/CSV. |
| **Modul Pengaturan & bersama**      | |
| `/users`                            | Super admin: akun admin setiap departemen. Admin Lab: staf lab. Termasuk sesi aktif, wajah, TOTP, dan password default per peran. |
| `/admin`                            | Super admin: pengumuman di atas semua halaman dan backup lengkap. |
| `/admin/sign-ins`                   | Super admin: audit percobaan masuk semua departemen. |
| `/help`                             | Panduan pemakaian sesuai halaman yang bisa dibuka pengguna. |

URL lama sebelum super app (`/dashboard`, `/samples/...`, `/database`, `/assay/...`, `/tv`, dll.) dialihkan otomatis ke `/lab/...` lewat `redirects()` di `next.config.ts`, sehingga bookmark dan layar TV tetap jalan. QR di label hanya berisi kode sampel, jadi label yang sudah tercetak tidak terpengaruh. **Semua endpoint API lama tidak berubah**, sehingga app mobile tidak perlu diubah selain penambahan enum `SUPER_ADMIN`.

## REST API

Semua endpoint berada di bawah `/api` dan mengembalikan bentuk `{ success, data }` atau `{ success: false, error }`. Hak akses per endpoint mengikuti tabel capability modulnya (`src/modules/<modul>/capabilities.ts`).

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

### Eksplorasi: drilling

Semua endpoint di bawah ini membutuhkan capability `manageDrilling` (Admin Eksplorasi).

| Method               | Endpoint                | Deskripsi |
| -------------------- | ----------------------- | --------- |
| GET / POST           | `/api/drill-holes`      | Daftar lubang bor (`search`, `status`, `page`, `pageSize`) / tambah lubang bor. Hole ID yang sudah dipakai → `409`. |
| GET / PATCH / DELETE | `/api/drill-holes/[id]` | Detail / ubah sebagian kolom / hapus permanen. |
| GET                  | `/api/drill-holes/export` | Unduh daftar sebagai `format=xlsx` (default) atau `csv`, dengan filter `search`/`status` yang sama seperti di layar. Di-stream baris per baris; maksimal 50.000 baris. |
| GET                  | `/api/drill-holes/template` | Template kosong (`format=xlsx`/`csv`) berisi header kolom. |
| POST                 | `/api/drill-holes/import` | Multipart `file` (.xlsx/.csv, ≤ 20 MB, ≤ 50.000 baris), `apply` (`0` pratinjau / `1` simpan), `updateExisting` (`0`/`1`). Pratinjau menjawab JSON (jumlah baru/sudah ada/error + daftar error per baris). Simpan menjawab NDJSON berisi progres per batch lalu total. |

Field: `holeId` (wajib, unik), `area`, `easting`, `northing`, `elevation`, `azimuth` (0–360), `dip` (−90–90), `totalDepth`, `status` (`PLANNED`/`ONGOING`/`COMPLETED`/`ABANDONED`), `startDate`, `endDate` (`YYYY-MM-DD`, selesai ≥ mulai), `remarks`.

#### Import & export Excel/CSV

Format file export, template, dan import sama persis (`src/modules/eksplorasi/lib/drill-hole-columns.ts`). File hasil export bisa diedit di Excel lalu di-import kembali.

Baris 1 berisi header. Kolomnya: `Hole ID`, `Area`, `Status`, `Easting`, `Northing`, `Elevation (m)`, `Azimuth (°)`, `Dip (°)`, `Total Depth (m)`, `Start Date`, `End Date`, `Remarks`.

Aturan pembacaan file saat import:

- **Header**
  - Hanya `Hole ID` yang wajib; urutan kolom bebas.
  - Header tidak peka huruf besar/kecil, dan satuan dalam kurung diabaikan.
  - Alias Indonesia juga diterima, misalnya `Elevasi`, `Kedalaman Total`, `Tanggal Mulai`, `Catatan`.
  - Kolom yang tidak dikenal diabaikan dan dilaporkan.
- **Format nilai**
  - CSV boleh dipisah koma, titik koma (Excel berlokal Indonesia), atau tab.
  - Angka boleh pakai koma atau titik desimal.
  - Tanggal: `YYYY-MM-DD`, `DD/MM/YYYY`, atau sel tanggal Excel.
  - Status: kode (`COMPLETED`) atau label (`Selesai`/`Completed`).
- **Pencocokan baris**
  - Baris dicocokkan lewat Hole ID. Hole ID baru dibuat.
  - Hole ID yang sudah ada dilewati, kecuali "Perbarui data yang sudah ada" dicentang.
  - Saat update, sel kosong **tidak** menghapus nilai yang tersimpan.
- **Baris error**
  - Termasuk Hole ID ganda di dalam file.
  - Baris error dilewati; baris lain tetap masuk.
  - Semua error bisa diunduh sebagai CSV dari dialog import.

Penulisan dibuat batch: `createMany` per 1.000 baris untuk data baru, dan satu `UPDATE … JOIN` per 500 baris untuk data lama. Tiap batch commit sendiri, jadi kalau proses terputus, meng-import ulang file yang sama aman. Hanya satu import yang berjalan per proses.

Hasil uji di MySQL 8 lokal untuk 34.000 baris:

| Langkah | Waktu |
| ------- | ----- |
| Pratinjau CSV | ±1,7 detik |
| Simpan baris baru | ±10 detik |
| Update semua dari .xlsx | ±14 detik |

Lihat `src/modules/eksplorasi/lib/__tests__/drill-hole-import-db.test.ts`.

### Dashboard & laporan

| Method | Endpoint                    | Deskripsi |
| ------ | --------------------------- | --------- |
| GET    | `/api/analytics`            | Angka dan grafik dashboard. |
| GET    | `/api/analytics/report`     | Angka dashboard sebagai workbook, sama persis dengan layar. |
| GET    | `/api/data-quality`         | Daftar Kualitas Data (+ `/export`). |

### Administrasi

| Method              | Endpoint                                  | Deskripsi |
| ------------------- | ----------------------------------------- | --------- |
| GET / POST          | `/api/users`                              | Daftar / buat pengguna, hanya dalam cakupan pemanggil (`user-scope.ts`). Body: `{ name, email, role, department? }`. |
| PATCH               | `/api/users/[id]`                         | Ubah pengguna (nama, peran, departemen, aktif, buka kunci). |
| POST                | `/api/users/[id]/reset-password`          | Reset ke kata sandi default peran. |
| POST / DELETE       | `/api/users/[id]/face`                    | Daftarkan / hapus wajah pengguna. |
| POST / DELETE       | `/api/users/[id]/totp`                    | Minta penyiapan / reset authenticator. |
| GET / DELETE        | `/api/users/[id]/sessions`, `/[sessionId]` | Lihat / akhiri sesi aktif pengguna. |
| GET                 | `/api/sign-in-audit`                      | Audit percobaan masuk (+ `/export`). Super admin. |
| GET / POST, PATCH / DELETE | `/api/master-options`, `/[id]`     | Kelola master data. |
| GET / POST, PATCH / DELETE | `/api/announcements`, `/[id]`      | Kelola pengumuman. |
| GET / PUT           | `/api/admin/role-passwords`               | Kata sandi default per peran yang dikelola pemanggil (kata sandinya sendiri tidak pernah dikembalikan). |
| GET                 | `/api/admin/backup`                       | Backup seluruh database (termasuk departemen akun dan data drilling) sebagai satu workbook. Super admin. |
| GET                 | `/api/health`                             | Cek kesehatan untuk load balancer/monitor, tanpa autentikasi. |

## Perintah Berguna

```bash
npm run dev               # development server
npm run build             # production build
npm start                 # jalankan hasil build
npm run lint              # ESLint (termasuk batas modul & ukuran file)
npm run module:new -- <key>  # kerangka modul baru (lihat docs/MODULES.md)
npm test                  # vitest (sekali jalan); npm run test:watch untuk mode watch
npm run db:migrate        # jalankan migrasi Prisma
npm run db:seed           # isi akun & tahapan awal
npm run db:seed-master    # isi master data Sample ID
npm run db:seed-dummy     # isi sampel dummy untuk pengembangan
npm run db:reset-samples  # hapus SEMUA sampel, log, dan hasil uji (akun & tahapan tetap)
npm run db:studio         # buka Prisma Studio (GUI database)
```

Tes end-to-end wajah (`src/core/lib/__tests__/face-e2e.test.ts`) dilewati kecuali server web dan layanan wajah sama-sama berjalan; lihat [`../face/README.md`](../face/README.md#tes-end-to-end).

## Upgrade dari versi sebelum Super App

1. `npm run db:migrate` menerapkan migrasi `20261011090000_super_app_departments`. Migrasi ini:
   - menambah peran `SUPER_ADMIN`, kolom `users.department`, dan tabel `drill_holes`;
   - mengisi `department = 'LAB'` untuk semua akun lama, sehingga `ADMIN` lama otomatis menjadi **Admin Lab** dan tetap memegang semua fitur lab.
2. `npm run db:seed` membuat akun super admin. Di produksi, wajib dengan `SEED_ADMIN_PASSWORD`.
3. Masuk sebagai super admin. Buat Admin Eksplorasi dari halaman **Akun Admin**, setelah mengatur password default role ADMIN di bawah tabel.
4. Hal-hal yang pindah tempat:
   - Pengumuman, backup, dan audit login sekarang milik super admin.
   - Password default staf lab diatur Admin Lab di halaman Pengguna.
5. Sesi yang sudah berjalan tetap berlaku. Peran dan departemen dibaca ulang dari database di setiap request.

## Roadmap

- **Komunikasi antar-admin.** Super admin dan admin setiap departemen akan bisa saling berkirim pesan. Admin bisa dikenali lewat persona `SUPER_ADMIN`, `LAB_ADMIN`, dan `EKSPLORASI_ADMIN` (`personaOf` di `permissions.ts`).
- **Detail modul Eksplorasi.** Interval/logging, survey downhole, dan assay per lubang bor. Model `DrillHole` saat ini sengaja dibuat minimal.

## Catatan Konfigurasi Perangkat Mobile

Aplikasi Flutter di folder `../mobile` mengakses API ini di `http://<alamat-server>:3000/api`. Alamatnya diatur dari layar **Pengaturan** di aplikasi, tanpa perlu build ulang; nilai bawaannya ada di `mobile/lib/services/settings_service.dart`.

- Android emulator: `http://10.0.2.2:3000/api`.
- Perangkat fisik: gunakan alamat IP LAN komputer yang menjalankan server ini (mis. `http://192.168.1.10:3000/api`), pastikan perangkat berada di jaringan Wi-Fi yang sama, dan izinkan port 3000 di Windows Firewall.
