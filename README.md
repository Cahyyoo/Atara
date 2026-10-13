# Atara — Super App

Satu aplikasi dengan beberapa modul, satu modul untuk setiap departemen:

- **Lab · Monitoring Sampel** (departemen LAB). Lacak sampel dari penerimaan hingga laporan:
  - generate & cetak label barcode/QR di web;
  - pindai & update tahapan via aplikasi mobile operator;
  - input hasil uji laboratorium;
  - pantau seluruh pergerakan secara real-time di dashboard.
- **Eksplorasi** (departemen EKSPLORASI). Manage Data Drilling: daftar lubang bor beserta koordinat, orientasi, kedalaman, dan statusnya.
- **Sistem**. Satu **Super Admin** mengelola akun admin setiap departemen, pengumuman, audit login, dan backup. Setiap admin departemen hanya mengelola fitur dan staf di modulnya sendiri.

Setelah masuk, pengguna mendarat di pemilih aplikasi `/home` (seperti Odoo) yang hanya menampilkan modul miliknya; di dalam modul, navbar hanya berisi menu modul itu. Detail arsitekturnya ada di [`web/README.md`](web/README.md#konsep-super-app).

## Struktur Repo

```
Atara/
  web/      # Next.js — backend REST API + dashboard (TypeScript, Prisma, MySQL, Tailwind, shadcn/ui)
  mobile/   # Flutter — aplikasi operator lapangan (scan barcode, update tahapan, antrean offline)
  face/     # Python — layanan pengenalan wajah dlib untuk faktor kedua saat masuk (hanya loopback)
```

Setiap folder punya README sendiri dengan detail setup: [`web/README.md`](web/README.md), [`mobile/README.md`](mobile/README.md), [`face/README.md`](face/README.md).

## Alur Kerja Modul Lab

1. **Generate & Print** — Pengguna peran DATABASE membuat sampel di `/lab/samples/generate` (satu atau massal). Sistem menghasilkan kode sampel unik (`SMPL-YYYY-NNNNN`) beserta QR code dan kode lab per hari shift (`SPR.QLAB.YYYYMMDD.NNN`), lalu label dicetak dan ditempel ke wadah fisik sampel.
2. **Scan** — Operator membuka aplikasi mobile dan memindai barcode pada sampel.
3. **Update Tahapan** — Operator memilih tahapan berikutnya (Diterima → Prep Basah → Prep Kering → Analisa → Report), menambahkan catatan opsional, lalu submit. Koreksi (mundur/lompat tahap) diperbolehkan dengan alasan. Scan yang dilakukan saat offline diantrekan dan dikirim begitu koneksi kembali.
4. **Input Hasil Uji** — Pengguna peran ANALISIS memasukkan hasil analisa per sampel, termasuk sub-sampel (mis. fraksi `(-20)`).
5. **Monitoring Real-Time** — Seluruh sampel, tahapan saat ini, riwayat log, waktu proses, dan sampel yang melewati SLA dapat dipantau melalui dashboard, analitik, dan tampilan TV.

## Peran

Setiap akun adalah sebuah **peran di dalam departemen**.

| Peran       | Departemen | Website                                                                                 | Aplikasi Mobile               |
| ----------- | ---------- | --------------------------------------------------------------------------------------- | ----------------------------- |
| SUPER_ADMIN | —          | Akun admin setiap departemen, pengumuman, audit login, backup                           | —                             |
| ADMIN       | LAB        | Dashboard lab, Database Sampel (lihat & export), Aktivitas, Pengguna (staf lab), Master Data | —                        |
| DATABASE    | LAB        | Dashboard, Buat Barcode, Cetak Ulang Label, Database Sampel (edit, hapus/pulihkan, export) | —                          |
| ANALISIS    | LAB        | Dashboard, Input Hasil Uji                                                              | —                             |
| OPERATOR    | LAB        | Dashboard                                                                               | Scan & perbarui tahapan       |
| ADMIN       | EKSPLORASI | Data Drilling                                                                           | —                             |

Aturan lengkapnya ada di `web/src/core/lib/auth/permissions.ts` + `web/src/modules/<modul>/capabilities.ts` (siapa boleh apa) dan `web/src/modules/system/lib/user-scope.ts` (siapa mengelola akun siapa).

## Autentikasi

Masuk dengan email + kata sandi (JWT + cookie httpOnly). Akun yang sudah mendaftarkan wajah atau aplikasi authenticator diminta **faktor kedua** setelah kata sandi:

- **Wajah** — frame kamera dikirim ke server Next.js, yang meneruskannya ke layanan `face/`. Jika layanan itu mati, masuk dengan wajah ditolak (`503`), bukan dilewati.
- **TOTP** — kode 6 digit dari aplikasi authenticator. Admin dapat meminta pengguna menyiapkannya; permintaan berlaku 24 jam.

## Menjalankan Sistem Secara Lokal

Urutan startup: **database → layanan face → backend web → aplikasi mobile**.

1. Siapkan MySQL, lalu ikuti [`web/README.md`](web/README.md) untuk migrasi, seed, dan konfigurasi `.env`.
2. Ikuti [`face/README.md`](face/README.md) untuk menyiapkan dan menjalankan layanan wajah di `http://127.0.0.1:8001`. `FACE_SERVICE_TOKEN` di `face/.env` dan `web/.env` harus bernilai sama. Langkah ini hanya diperlukan bila ada akun yang masuk dengan wajah.
3. Jalankan `npm run dev` di `web/` — server berjalan di `http://localhost:3000`.
4. Ikuti [`mobile/README.md`](mobile/README.md) untuk menjalankan aplikasi Flutter. Alamat server dapat diubah dari layar **Pengaturan** di aplikasi.

## Akun Default (dari seed database)

| Peran       | Departemen | Email                    | Password      | Digunakan di                |
| ----------- | ---------- | ------------------------ | ------------- | --------------------------- |
| SUPER_ADMIN | —          | superadmin@atara.local   | lihat catatan | Web                         |
| ADMIN       | LAB        | admin@atara.local        | lihat catatan | Web                         |
| DATABASE    | LAB        | database@atara.local     | lihat catatan | Web                         |
| ANALISIS    | LAB        | analisis@atara.local     | lihat catatan | Web                         |
| OPERATOR    | LAB        | operator@atara.local     | lihat catatan | Web & Aplikasi Mobile       |
| ADMIN       | EKSPLORASI | eksplorasi@atara.local   | lihat catatan | Web                         |

> **Catatan kata sandi.** Akun ini dibuat oleh `npm run db:seed`. Di lingkungan pengembangan kata sandinya ada di `web/prisma/seed-policy.ts`. Di produksi seed **menolak** membuat akun kecuali `SEED_ADMIN_PASSWORD` (minimal 12 karakter) diberikan, dan yang dibuat hanya akun super admin. Ganti kata sandi super admin setelah masuk pertama kali.

## Skema Data Inti

- **User** — akun beserta peran dan departemennya (`LAB` / `EKSPLORASI`, kosong untuk super admin), dan pengaturan TOTP bila ada.
- **Stage** — master data tahapan laboratorium beserta urutannya (`sequence_order`).
- **Sample** — satu record per sampel fisik: kode unik, batch, tahapan & status saat ini. Dihapus secara *soft delete* sehingga dapat dipulihkan.
- **SampleLog** — histori setiap perpindahan tahapan (sampel, tahapan, operator, catatan, waktu).
- **LabRecord** — hasil uji per sampel: kode lab, Sample ID (mis. `MOL/LIM/TP/S3/PA4/B42/919.3/12`), dan angka hasil analisa. Sub-sampel menunjuk ke record induknya.
- **MasterOption** — kosakata penyusun Sample ID (tempat, jenis batuan, non-produksi, pit, SIR).
- **FaceEnrollment** — descriptor wajah terdaftar per akun (128 float, bukan foto).
- **UserSession** / **SignInAudit** — sesi aktif dan jejak setiap upaya masuk.
- **DrillHole** — modul Eksplorasi: satu record per lubang bor (Hole ID unik, area, koordinat collar, azimuth/dip, kedalaman, status, tanggal).

Lihat `web/prisma/schema/` (satu file per modul) untuk definisi lengkap.
