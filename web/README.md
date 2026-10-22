# Atara — Web & Backend API

Backend REST API dan web untuk **Atara Super App**. Atara adalah satu aplikasi dengan beberapa modul, satu modul untuk setiap departemen. Dibangun dengan Next.js 16 (App Router), TypeScript, Prisma ORM, MySQL, Tailwind CSS, dan shadcn/ui. Antarmuka tersedia dalam dua bahasa (id, en); teksnya ada di `src/core/messages/` dan `src/modules/<modul>/messages/`.

## Konsep Super App

| Modul | Path | Untuk siapa | Isi |
| ----- | ---- | ----------- | --- |
| **Lab · Monitoring Sampel** | `/lab/*` | Departemen **LAB** | Seluruh fitur tracking sampel: barcode, database sampel, hasil uji, kesimpulan, dashboard, Mode TV, master data, aktivitas. |
| **Eksplorasi** | `/eksplorasi/*` | Departemen **EKSPLORASI** | Data source hasil analisis dan sampel QC-nya (Standard/CRM, Blank, Duplicate): dashboard scatterplot QC, CRUD lewat lembar seperti Excel, serta import/export Excel & CSV (import ±34.000 baris dalam hitungan detik). |
| **Pengaturan** | `/users`, `/admin/*` | **Super Admin**, **Admin Lab** (hanya Pengguna) | Akun admin setiap departemen (super admin) atau staf lab (admin lab), pengumuman, audit login, backup. |

Tampilannya dibagi dua, seperti Odoo:

- **Pemilih aplikasi (`/home`).** Semua orang mendarat di sini setelah masuk. Layarnya berisi kartu untuk setiap modul yang boleh dibuka. Setiap kartu memuat deskripsi singkat dan pintasan yang bisa diklik langsung ke halaman-halaman modul yang boleh dibuka akun tersebut.
- **Tampilan modul.** Setelah sebuah kartu dibuka, navbar menampilkan menu modul itu saja, dan konten memakai lebar penuh.
  - **Bilah atas:** logo Atara / nama modul. Nama modul adalah **app switcher** untuk pindah ke modul lain atau kembali ke semua aplikasi.
  - **Baris tab** di bawahnya berisi semua halaman modul. Tab halaman yang terbuka bergaris bawah.
  - **Di HP,** tombol ☰ membuka menu modul.

Halaman Panduan (`/help`) bukan milik modul mana pun, jadi tampil seperti pemilih, tanpa baris tab.

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
   CREATE DATABASE atara CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
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
| `APP_HTTPS`          | `1` bila situs dilayani lewat HTTPS, `0` untuk server HTTP biasa (mis. server lokal `http://192.168.x.x`). Kosong = flag `Secure` cookie sesi mengikuti protokol tiap request (`https`, atau `x-forwarded-proto: https` bila `TRUST_PROXY=1`), sementara HSTS dan `upgrade-insecure-requests` tetap diasumsikan aktif di production. Untuk header, nilai ini dibaca saat `next build`, jadi build ulang setelah mengubahnya. Catatan: kamera (login/enrol wajah) tetap hanya jalan di HTTPS atau `localhost`; untuk uji coba di HTTP bisa pakai `chrome://flags/#unsafely-treat-insecure-origin-as-secure` dengan origin server. |
| `NEXT_PUBLIC_BASE_PATH` | Sub-path bila aplikasi disajikan di bawah reverse proxy, mis. `/atara` untuk `http://host/atara`. Kosong = aplikasi memegang seluruh origin. Dibaca saat `next build` — build ulang setelah mengubahnya. Proxy harus meneruskan path **dengan** prefix-nya (Caddy: `handle /atara* { reverse_proxy 127.0.0.1:3010 }`, bukan `handle_path`). Di kode, setiap `fetch`/`location.href`/`<a href>` ke path internal wajib lewat `withBasePath()` dari `@/core/lib/http/base-path`; `<Link>`, router, dan `redirect()` sudah otomatis. App mobile: isi alamat server dengan sub-path-nya. |
| `FACE_SERVICE_URL`   | Alamat layanan wajah, default `http://127.0.0.1:8001`. Harus loopback. |
| `FACE_SERVICE_TOKEN` | Rahasia bersama dengan layanan wajah — **harus sama** dengan `FACE_SERVICE_TOKEN` di `face/.env`. Browser tidak pernah melihatnya: frame mengalir browser → Next.js → layanan wajah. |
| `MFA_ENCRYPTION_KEY` | Kunci untuk mengenkripsi rahasia TOTP sebelum disimpan, sehingga salinan tabel `core_users` saja tidak cukup untuk membuat kode. 32 byte acak dalam base64: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Mengubahnya membatalkan semua authenticator yang sudah disiapkan; admin harus meresetnya dari halaman Pengguna. |

## Akun Default (hasil seed)

| Peran       | Departemen | Email                    | Password      |
| ----------- | ---------- | ------------------------ | ------------- |
| SUPER_ADMIN | —          | superadmin@atara.local   | lihat catatan |
| ADMIN       | LAB        | admin@atara.local        | lihat catatan |
| DATABASE    | LAB        | database@atara.local     | lihat catatan |
| ANALISIS    | LAB        | analisis@atara.local     | lihat catatan |
| PREPARATOR    | LAB        | preparator@atara.local     | lihat catatan |
| ADMIN       | EKSPLORASI | eksplorasi@atara.local   | lihat catatan |

> **Catatan kata sandi.** Akun ini dibuat oleh `npm run db:seed`. Di lingkungan pengembangan kata sandinya ada di `prisma/seed-policy.ts`. Di produksi seed **menolak** membuat akun kecuali `SEED_ADMIN_PASSWORD` (minimal 12 karakter) diberikan, dan yang dibuat hanya akun **super admin**; akun contoh lainnya tidak dibuat sama sekali. Super admin lalu membuat admin setiap departemen dari halaman Akun Admin. Ganti kata sandi super admin setelah masuk pertama kali.

## Peran

Setiap akun punya **peran** dan **departemen** (kolom `users.department`; null hanya untuk super admin). Siapa boleh melakukan apa ditentukan di `src/core/lib/auth/permissions.ts` dan tabel `capabilities.ts` tiap modul. Halaman, API, dan menu samping semuanya membaca tabel yang sama. Pasangan peran–departemen yang tidak valid, misalnya `PREPARATOR` di `EKSPLORASI`, ditolak saat validasi dan tidak mendapat hak apa pun.

| Persona (peran + departemen) | Website | Aplikasi mobile |
| ---------------------------- | ------- | --------------- |
| **SUPER_ADMIN** (tanpa departemen) | Pemilih aplikasi, Pengaturan: Pengguna (kelola admin Lab & Eksplorasi + password default role ADMIN), Administrasi (pengumuman, backup), Audit Login. Tidak masuk ke fitur modul. | — |
| **Admin Lab** (ADMIN + LAB) | Dashboard lab (termasuk pengaturan SLA & export), Database Sampel (hanya lihat, export, data terhapus), Kesimpulan, Aktivitas, Master Data, Pengguna di tile Pengaturan (staf lab + password default-nya), koreksi tahap dari halaman sampel | — |
| DATABASE (LAB) | Dashboard, Buat Barcode, Cetak Ulang Label, Database Sampel (edit, hapus/pulihkan, export), Kesimpulan | — |
| ANALISIS (LAB) | Dashboard, Input Hasil Uji, Kesimpulan | — |
| PREPARATOR (LAB) | Dashboard | Scan & perbarui tahap, termasuk koreksi (mundur/lompat tahap) dengan alasan |
| **Admin Eksplorasi** (ADMIN + EKSPLORASI) | Dashboard QC, Data Source, Standard, Blank, Duplicate (tambah, ubah, cari, hapus, import, export) | — |

**Siapa mengelola akun siapa** (`src/modules/system/lib/user-scope.ts`):

- **Super admin** hanya mengelola akun `ADMIN` milik setiap departemen. Hanya ada satu super admin. Akun ini dibuat oleh seed dan tidak bisa dibuat lewat UI.
- **Admin Lab** hanya mengelola staf departemennya sendiri, yaitu `DATABASE`, `ANALISIS`, dan `PREPARATOR` di LAB.
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
| `/home`                             | Pemilih aplikasi: kartu modul yang boleh dibuka akun ini, dengan menu yang tersedia di dalamnya. Tujuan setelah login. |
| **Modul Lab**                       | |
| `/lab/dashboard`                    | KPI, progres per tahap, waktu siklus, sampel yang lewat SLA, tabel monitoring, export laporan. |
| `/lab/samples/generate`             | Generate sampel (satu/massal) + preview & cetak label QR grid A4. |
| `/lab/samples/labels`               | Cetak ulang label. |
| `/lab/samples/[code]`               | Detail sampel, hasil uji, timeline perpindahan tahapan, koreksi tahap (admin lab). |
| `/lab/samples/[code]/sub/[subCode]` | Detail sub-sampel. |
| `/lab/database`                     | Database Sampel: cari, edit identitas, hapus/pulihkan, export. |
| `/lab/assay`                        | Input Hasil Uji dengan grid seperti Excel: blok dari Excel ditempel langsung ke sel (Ctrl+V), sel bisa diseleksi lalu di-copy ke Excel (Ctrl+C) atau dikosongkan (Delete). Sampel tercentang diisi di grid; tanpa centang, "Tempel per Sample ID" membuka lembar hingga 5.000 baris berkolom persis seperti ekspor instrumen (Sample ID, Measurement Finished seperti `9/1/2026 8:54`, Ni (%) … Sum (%), Measurement Method, Solution ID), dicek server hanya untuk baris yang berubah, dengan progres pengecekan dan penyimpanan yang terlihat. Impor file CSV/XLSX tetap tersedia. |
| `/lab/assay/history`                | Riwayat perubahan hasil uji. |
| `/lab/grade`                        | Kesimpulan: rata-rata kadar per pit, SIR, lokasi, jenis batuan, kode non-prod, atau barging run. |
| `/lab/activity`                     | Jejak perpindahan tahap per preparator. |
| `/lab/master-data`                  | Kosakata penyusun Sample ID (tempat, jenis batuan, non-prod, pit, SIR). |
| `/lab/tv`                           | Tampilan monitoring layar penuh untuk TV di lab. |
| **Modul Eksplorasi**                | |
| `/eksplorasi/dashboard`             | Dashboard QC: scatterplot Standard (CRM) per tanggal, satu warna per Control, dan scatterplot Duplicate (sampel asli vs duplikat, dengan garis 1:1). Pilih unsur dan rentang tanggal. |
| `/eksplorasi/data-source`           | Data Source: semua baris, semua tipe sampel. Cari (Sample ID/Hole ID/Control/Campaign), filter campaign dan tipe, import & export Excel/CSV. Semua kolom muat tanpa scroll horizontal (di layar laptop ke atas). |
| `/eksplorasi/standard`, `/blank`, `/duplicate` | Daftar yang sama untuk satu tipe QC, dengan kolom masing-masing sheet lab. |
| `/eksplorasi/<daftar>/new`          | Tambah baris lewat lembar seperti Excel dengan kolom daftar itu: ketik/tempel blok dari Excel; 50 data terakhir tampil terkunci dan bisa dibuka kuncinya. Di daftar QC, tipe sampel terisi otomatis. |
| `/eksplorasi/<daftar>/[id]/edit`    | Lembar yang sama dengan baris itu sudah terbuka kuncinya (ikon pensil). |
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
| POST        | `/api/samples/scan`          | Endpoint utama mobile: `{ sample_code, stage_id, notes?, force?, reason? }`. Preparator diambil dari sesi; `force` + `reason` untuk koreksi mundur/lompat tahap. |
| GET         | `/api/samples/scan/mine`     | Riwayat scan preparator yang sedang masuk. |
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

### Eksplorasi: data source

Semua endpoint di bawah ini membutuhkan capability `manageExplorationData` (Admin Eksplorasi). `view` adalah daftar yang dipakai: `dataSource` (semua tipe, default), `standard`, `blank`, atau `duplicate`. Daftar QC selalu dibatasi pada tipenya sendiri.

| Method               | Endpoint                     | Deskripsi |
| -------------------- | ---------------------------- | --------- |
| GET / POST           | `/api/data-sources`          | Daftar baris (`view`, `search`, `campaign`, `sampleType`, `page`, `pageSize`) / tambah baris. Sample ID yang sudah dipakai → `409`. |
| GET / PATCH / DELETE | `/api/data-sources/[id]`     | Detail / ubah sebagian kolom / hapus permanen. |
| GET                  | `/api/data-sources/campaigns` | Daftar campaign untuk filter. |
| GET                  | `/api/data-sources/qc`       | Data dashboard untuk satu unsur (`element`, default `ni`; opsional `from`/`to`): titik Standard per tanggal dan pasangan Duplicate–asli. |
| POST                 | `/api/data-sources/sheet`    | Lembar tambah/ubah: `{ dryRun, view, rows: [{ line, id?, cells }] }`, maks. 500 baris. Baris tanpa `id` = baris baru (Sample ID yang sudah ada ditolak), baris dengan `id` = baris yang dibuka kuncinya (sel kosong menghapus isinya; kolom yang tidak ada di daftar itu tidak disentuh). Menjawab status per baris; tidak ada yang disimpan selama masih ada baris invalid. |
| GET                  | `/api/data-sources/export`   | Unduh daftar sebagai `format=xlsx` (default) atau `csv` dengan kolom dan filter daftar itu. Di-stream; maksimal 50.000 baris. |
| GET                  | `/api/data-sources/template` | Template kosong (`view`, `format=xlsx`/`csv`) berisi header kolom daftar itu. |
| POST                 | `/api/data-sources/import`   | Multipart `file` (.xlsx/.csv, ≤ 20 MB, ≤ 50.000 baris), `view`, `apply` (`0` pratinjau / `1` simpan), `updateExisting` (`0`/`1`). Pratinjau menjawab JSON; simpan menjawab NDJSON berisi progres per batch lalu total. |

Field (tabel `eksplorasi_data_source`): `sampleId` (wajib, unik), `sampleType` (wajib: `ORIGINAL`/`STANDARD`/`BLANK`/`DUPLICATE`), `controlDate`, `control`, `campaign`, `no`, `holeId`, `from`, `to`, `remarks`, `date` (`YYYY-MM-DD`), `weight`, dan 16 unsur: `ni`, `fe`, `fe2o3`, `co`, `na2o`, `mgo`, `al2o3`, `sio2`, `p2o5`, `so3`, `k2o`, `cao`, `tio2`, `cr2o3`, `mno`, `mc`. Nilai disimpan sebagai teks apa adanya (misalnya `<0.01`); nilai yang bukan angka tidak digambar di grafik.

Pada baris `DUPLICATE`, kolom `control` berisi Sample ID sampel aslinya; dari situ dashboard memasangkan duplikat dengan aslinya. Pada baris `STANDARD`, `control` berisi nama CRM.

#### Import & export Excel/CSV

Kolom tiap daftar, header file, template, dan import diambil dari satu tempat (`src/modules/eksplorasi/lib/data-source-columns.ts`). File hasil export sebuah daftar bisa diedit di Excel lalu di-import kembali ke daftar yang sama.

| Daftar | Kolom (lalu 16 unsur: Ni, Fe, Fe2O3, Co, Na2O, MgO, Al2O3, SiO2, P2O5, SO3, K2O, CaO, TiO2, Cr2O3, MnO, MC) |
| ------ | ------ |
| Data Source | Campaign, Hole ID, Sample ID, Sample Type, From, To, Date, Weight |
| Standard (CRM) | Control, Campaign, Hole ID, Sample ID, Remarks, Date, Weight |
| Blank | Control, Campaign, Hole ID, Sample ID, Sample Type, Remarks, Date, Weight |
| Duplicate | Control Date, Control, Campaign, No, Hole ID, Sample ID, Sample Type, Remarks, Date, Weight |

Aturan pembacaan file saat import:

- **Header**
  - `Sample ID` wajib. Di Data Source, `Sample Type` juga wajib; di daftar QC kolom itu boleh tidak ada (semua baris menjadi tipe daftar itu, baris bertipe lain ditolak).
  - Urutan kolom bebas; header tidak peka huruf besar/kecil, dan satuan dalam kurung diabaikan (`Ni (%)`).
  - Alias juga diterima, misalnya `BHID`, `CRM`, `Tanggal`, `Tipe Sampel`.
  - Kolom yang tidak dikenal diabaikan dan dilaporkan.
- **Format nilai**
  - CSV boleh dipisah koma, titik koma (Excel berlokal Indonesia), atau tab.
  - Tanggal: `YYYY-MM-DD`, `DD/MM/YYYY`, atau sel tanggal Excel.
  - Sample type: kode (`STANDARD`) atau kata yang biasa dipakai (`Standart`, `CRM`, `Blk`, `Dup`, `Sampel biasa`).
- **Pencocokan baris**
  - Baris dicocokkan lewat Sample ID. Sample ID baru dibuat.
  - Sample ID yang sudah ada dilewati, kecuali "Perbarui data yang sudah ada" dicentang.
  - Saat update, sel kosong **tidak** menghapus nilai yang tersimpan.
- **Baris error**
  - Termasuk Sample ID ganda di dalam file.
  - Baris error dilewati; baris lain tetap masuk.
  - Semua error bisa diunduh sebagai CSV dari dialog import.

Penulisan dibuat batch: `createMany` per 1.000 baris untuk data baru, dan satu `UPDATE … JOIN` per 500 baris untuk data lama. Tiap batch commit sendiri, jadi kalau proses terputus, meng-import ulang file yang sama aman. Hanya satu import yang berjalan per proses.

Hasil uji di MySQL 8 lokal untuk 34.000 baris:

| Langkah | Waktu |
| ------- | ----- |
| Pratinjau CSV | ±2 detik |
| Simpan baris baru | ±25 detik |
| Update semua dari .xlsx | ±22 detik |

Lihat `src/modules/eksplorasi/lib/__tests__/data-source-import-db.test.ts`.

### Dashboard & laporan

| Method | Endpoint                    | Deskripsi |
| ------ | --------------------------- | --------- |
| GET    | `/api/analytics`            | Angka dan grafik dashboard. |
| GET    | `/api/analytics/report`     | Angka dashboard sebagai workbook, sama persis dengan layar. |

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
| GET                 | `/api/admin/backup`                       | Backup seluruh database (termasuk departemen akun dan data source eksplorasi) sebagai satu workbook. Super admin. |
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

## Catatan Konfigurasi Perangkat Mobile

Aplikasi Flutter di folder `../mobile` mengakses API ini di `http://<alamat-server>:3000/api`. Alamatnya diatur dari layar **Pengaturan** di aplikasi, tanpa perlu build ulang; nilai bawaannya ada di `mobile/lib/services/settings_service.dart`.

- Android emulator: `http://10.0.2.2:3000/api`.
- Perangkat fisik: gunakan alamat IP LAN komputer yang menjalankan server ini (mis. `http://192.168.1.10:3000/api`), pastikan perangkat berada di jaringan Wi-Fi yang sama, dan izinkan port 3000 di Windows Firewall.
