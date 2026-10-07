# Atara — Sistem Tracking & Monitoring Sampel

Sistem end-to-end untuk melacak pergerakan sampel dari penerimaan hingga laporan: generate & cetak label barcode/QR di web, pindai & update tahapan via aplikasi mobile operator, input hasil uji laboratorium, dan pantau seluruh pergerakan secara real-time di dashboard.

## Struktur Repo

```
Atara/
  web/      # Next.js — backend REST API + dashboard (TypeScript, Prisma, MySQL, Tailwind, shadcn/ui)
  mobile/   # Flutter — aplikasi operator lapangan (scan barcode, update tahapan, antrean offline)
  face/     # Python — layanan pengenalan wajah dlib untuk faktor kedua saat masuk (hanya loopback)
```

Setiap folder punya README sendiri dengan detail setup: [`web/README.md`](web/README.md), [`mobile/README.md`](mobile/README.md), [`face/README.md`](face/README.md).

## Alur Kerja

1. **Generate & Print** — Pengguna peran DATABASE membuat sampel di `/samples/generate` (satu atau massal). Sistem menghasilkan kode sampel unik (`SMPL-YYYY-NNNNN`) beserta QR code dan kode lab per hari shift (`SPR.QLAB.YYYYMMDD.NNN`), lalu label dicetak dan ditempel ke wadah fisik sampel.
2. **Scan** — Operator membuka aplikasi mobile dan memindai barcode pada sampel.
3. **Update Tahapan** — Operator memilih tahapan berikutnya (Diterima → Prep Basah → Prep Kering → Analisa → Report), menambahkan catatan opsional, lalu submit. Koreksi (mundur/lompat tahap) diperbolehkan dengan alasan. Scan yang dilakukan saat offline diantrekan dan dikirim begitu koneksi kembali.
4. **Input Hasil Uji** — Pengguna peran ANALISIS memasukkan hasil analisa per sampel, termasuk sub-sampel (mis. fraksi `(-20)`).
5. **Monitoring Real-Time** — Seluruh sampel, tahapan saat ini, riwayat log, waktu proses, dan sampel yang melewati SLA dapat dipantau melalui dashboard, analitik, dan tampilan TV.

## Peran

| Peran    | Website                                                                                 | Aplikasi Mobile               |
| -------- | --------------------------------------------------------------------------------------- | ----------------------------- |
| ADMIN    | Dashboard, Database Sampel (lihat & export), Aktivitas, Pengguna, Master Data           | —                             |
| DATABASE | Dashboard, Buat Barcode, Cetak Ulang Label, Database Sampel (edit, hapus/pulihkan, export) | —                          |
| ANALISIS | Dashboard, Input Hasil Uji                                                              | —                             |
| OPERATOR | Dashboard                                                                               | Scan & perbarui tahapan       |

Aturan lengkapnya ada di satu tempat, `web/src/lib/permissions.ts`.

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

| Peran    | Email                  | Password      | Digunakan di                |
| -------- | ---------------------- | ------------- | --------------------------- |
| ADMIN    | admin@atara.local      | lihat catatan | Web                         |
| DATABASE | database@atara.local   | lihat catatan | Web                         |
| ANALISIS | analisis@atara.local   | lihat catatan | Web                         |
| OPERATOR | operator@atara.local   | lihat catatan | Web & Aplikasi Mobile       |

> **Catatan kata sandi.** Akun ini dibuat oleh `npm run db:seed`. Di lingkungan pengembangan kata sandinya ada di `web/prisma/seed-policy.ts`. Di produksi seed **menolak** membuat akun kecuali `SEED_ADMIN_PASSWORD` (minimal 12 karakter) diberikan, dan hanya akun admin yang dibuat. Ganti kata sandi admin setelah masuk pertama kali.

## Skema Data Inti

- **User** — akun beserta perannya, dan pengaturan TOTP bila ada.
- **Stage** — master data tahapan laboratorium beserta urutannya (`sequence_order`).
- **Sample** — satu record per sampel fisik: kode unik, batch, tahapan & status saat ini. Dihapus secara *soft delete* sehingga dapat dipulihkan.
- **SampleLog** — histori setiap perpindahan tahapan (sampel, tahapan, operator, catatan, waktu).
- **LabRecord** — hasil uji per sampel: kode lab, Sample ID (mis. `MOL/LIM/TP/S3/PA4/B42/919.3/12`), dan angka hasil analisa. Sub-sampel menunjuk ke record induknya.
- **MasterOption** — kosakata penyusun Sample ID (tempat, jenis batuan, non-produksi, pit, SIR).
- **FaceEnrollment** — descriptor wajah terdaftar per akun (128 float, bukan foto).
- **UserSession** / **SignInAudit** — sesi aktif dan jejak setiap upaya masuk.

Lihat `web/prisma/schema.prisma` untuk definisi lengkap.
