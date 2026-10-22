# Panduan Pengembangan Modul — Atara Super App

Panduan ini untuk developer yang membuat modul baru atau menambah fitur di modul yang sudah ada. Tujuannya agar setiap modul punya struktur yang sama, mudah dirawat, dan tidak membuat aplikasi lebih lambat.

Aturan di sini **ditegakkan otomatis**:

- **ESLint** (`npm run lint`) menolak impor lintas modul dan file yang terlalu besar.
- **Test arsitektur** (`src/core/lib/__tests__/architecture.test.ts`) memeriksa registrasi modul, guard halaman dan API, serta larangan barrel.
- **Test namespace** (`src/core/i18n/__tests__/client-namespaces.test.ts`) memastikan komponen client hanya memakai teks yang memang dikirim ke browser.

---

## 1. Konsep

**Super app.** Satu aplikasi dengan beberapa **modul**. Satu modul biasanya untuk satu **departemen**:

| Modul | Path | Departemen / persona |
| ----- | ---- | -------------------- |
| `lab` | `/lab/*` | LAB: Admin Lab, DATABASE, ANALISIS, PREPARATOR |
| `eksplorasi` | `/eksplorasi/*` | EKSPLORASI: Admin Eksplorasi |
| `system` (Pengaturan) | `/admin/*`, `/users` | Super Admin; Admin Lab untuk Pengguna saja |

**Persona** adalah gabungan peran dan departemen, misalnya `ADMIN` + `LAB` = `LAB_ADMIN`. Semua hak akses ditulis per persona dalam bentuk **capability** (`viewDashboard`, `manageExplorationData`, …). Setiap pemeriksaan memanggil `can(session, "capability")`.

**Dua tampilan, seperti Odoo:**

- **Pemilih aplikasi (`/home`).** Layar dengan bilah atas satu baris yang berisi satu kartu per modul milik persona.
- **Tampilan modul.** Navbar dua baris, seperti Vercel dan GitHub. Konten mendapat lebar penuh karena tidak ada sidebar.
  - **Baris atas:** logo Atara (kembali ke pemilih) / **app switcher**, yaitu nama modul dengan panah untuk pindah langsung ke modul lain atau ke "Semua aplikasi". Di sisi kanan ada bantuan, kotak cari modul (`shell.header`), dan akun.
  - **Baris kedua:** setiap item `nav` modul menjadi **tab**. Tab halaman yang terbuka bergaris bawah. Bila tab tidak muat, baris ini bisa digeser.
  - **Di bawah `lg` (HP/tablet):** tab disembunyikan, dan tombol ☰ membuka drawer berisi menu modul.

Satu `AppShell` yang sama memilih tampilannya dari URL lewat `moduleForPath()` di `core/lib/app/modules.ts`. Sebuah halaman milik sebuah modul bila berada di bawah `basePath`-nya **atau** tercantum di `nav`-nya (contoh: `/users` milik modul Pengaturan). Halaman yang bukan milik modul mana pun, seperti `/home` dan `/help`, tampil tanpa baris tab.

**Tiga lapisan kode:**

```
src/app/       Perakitan route saja: halaman dan route handler tipis. Boleh mengimpor core dan modul.
src/core/      Infrastruktur bersama: auth, sesi, HTTP, i18n, UI kit, layout, helper.
               TIDAK mengenal modul, kecuali lewat file registry di src/modules/*.ts.
src/modules/   Fitur, satu folder per modul. Modul hanya mengimpor core dan dirinya sendiri.
```

**Alur sebuah request API:**

```
app/api/(modul)/…/route.ts
  └─ route({ capability, body, query }, handler)    ← core/lib/http/api-route.ts: guard + validasi + error
       └─ modules/<m>/lib/<x>-service.ts             ← aturan bisnis
            └─ prisma (core/lib/prisma.ts)            ← database
            └─ toXxxDTO(row)                          ← bentuk data untuk browser (modules/<m>/types.ts)
```

---

## 2. Anatomi folder modul

```
src/modules/<m>/
  module.ts           Manifest: key, path, ikon, persona, menu, bagian panduan, tour, shell extras.
  capabilities.ts     Tabel capability → persona milik modul (pure, tanpa ikon).
  types.ts            DTO yang dikirim ke browser.
  validation.ts       Skema zod untuk input API (atau folder validation/ bila besar, mis. modul lab).
  guide.ts            (opsional) Bagian panduan dan tour bila panjang.
  backup-sheets.ts    (opsional) Sheet modul di backup lengkap.
  lib/                Logika domain. File yang menyentuh DB diawali `import "server-only";`.
  components/         Komponen React. "use client" hanya bila butuh state/efek/event.
  hooks/              Hook React khusus modul.
  messages/id.json    Teks UI bahasa Indonesia.
  messages/en.json    Teks UI bahasa Inggris (kunci harus sama dengan id.json).
  **/__tests__/       Test di samping kode yang diuji.

src/app/(app)/<m>/           Halaman modul (layout.tsx menjaga capability modul).
src/app/api/(<m>)/           Route API modul. Route group: URL tetap /api/..., tanpa nama grup.
prisma/schema/<m>.prisma     Tabel modul.
```

**File registry**, satu baris per modul. Hanya file-file ini yang boleh diimpor core:

| File | Isi |
| ---- | --- |
| `src/modules/registry.ts` | Daftar manifest: menu, kartu pemilih aplikasi, panduan, tour, shell extras |
| `src/modules/capabilities.ts` | Gabungan tabel capability (dibaca `can()`) |
| `src/modules/messages.ts` | Katalog pesan per modul |
| `src/modules/backup.ts` | Gabungan sheet backup |

---

## 3. Konvensi penamaan

| Hal | Aturan | Contoh |
| --- | ------ | ------ |
| File | `kebab-case` | `data-source-service.ts`, `data-source-table.tsx` |
| Komponen | `PascalCase` | `DataSourceTable` |
| Hook | `useXxx`, file `use-xxx.ts` | `useDataSourceImport` |
| Capability | `verbNoun`, camelCase | `manageExplorationData`, `viewSignInAudit` |
| Tabel capability | `<MODUL>_CAPABILITIES` | `EKSPLORASI_CAPABILITIES` |
| Manifest | `<modul>Module` | `eksplorasiModule` |
| Namespace i18n | nama fitur, camelCase | `dataSource`, `dataSource.import` |
| Route API | kata benda jamak, kebab-case | `/api/data-sources`, `/api/data-sources/[id]` |
| Tabel DB | `<modul>_` + `snake_case` jamak lewat `@@map` (dicek test) | `model DataSource { … @@map("eksplorasi_data_source") }` |
| DTO | `XxxDTO` | `DataSourceDTO` |
| Skema zod | `createXxxSchema`, `updateXxxSchema`, `listXxxQuerySchema` | `listDataSourceQuerySchema` |

---

## 4. Aturan impor

| Dari \ ke | `core` | modul sendiri | modul lain | file registry |
| --------- | ------ | ------------- | ---------- | ------------- |
| `src/core/**` | ✅ | — | ❌ | ✅ |
| `src/modules/<m>/**` | ✅ | ✅ | ❌ | ✅ |
| `src/app/api/(<m>)/**` | ✅ | ✅ (`<m>`) | ❌ | ✅ |
| `src/app/(app)/**` | ✅ | ✅ | ✅ (lapisan perakitan) | ✅ |

Jika dua modul butuh hal yang sama, **pindahkan ke `src/core`**. Jangan mengimpor dari modul lain. Contoh nyata:
- `parseNumber` dipakai lab dan eksplorasi, jadi tinggal di `core/lib/number-parse.ts`.
- Hari kerja 07:00 WITA dipakai lab dan audit login, jadi tinggal di `core/lib/wita-time.ts`.

Pesan ESLint bila melanggar:

```
Unexpected path "@/modules/lab/…" imported in restricted zone.
The eksplorasi module must not import the lab module; move what both need into src/core
```

**Tanpa barrel `index.ts`.** Selalu impor file yang dibutuhkan secara langsung, misalnya `@/modules/eksplorasi/lib/data-source`. Barrel memperlambat build dan bisa ikut menyeret kode server ke bundle browser.

---

## 5. Resep standar

Semua contoh di bawah diambil dari modul **eksplorasi**, yang sudah mengikuti semua pola.

### 5.1 Halaman

```tsx
// src/app/(app)/eksplorasi/data-source/page.tsx
export const dynamic = "force-dynamic";

export default async function DataSourcePage() {
  await requireCapabilityPage("manageExplorationData");   // guard di server, selalu
  const t = await getTranslations("dataSource");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />   {/* core/components/layout/page-header */}
      <DataSourceTable view="dataSource" />                {/* komponen client modul */}
    </div>
  );
}
```

- Setiap halaman wajib punya `loading.tsx` di foldernya atau di atasnya. Ini dicek oleh `loading-shape.test.ts`.
- `layout.tsx` di root modul menjaga capability modul untuk semua halamannya, misalnya `src/app/(app)/eksplorasi/layout.tsx`.

### 5.2 Route API

```ts
// src/app/api/(eksplorasi)/data-sources/route.ts
export const GET = route({ capability: "manageExplorationData", query: listDataSourceQuerySchema }, async ({ query }) =>
  jsonSuccess(await listDataSource(query))
);

export const POST = route({ capability: "manageExplorationData", body: createDataSourceSchema }, async ({ body, session }) =>
  jsonSuccess(await createDataSource(body, session.userId), 201)
);
```

`route()` (`core/lib/http/api-route.ts`) mengurus guard, parse body/query dengan zod (422 bila tidak valid), dan `handleApiError` (409 untuk unique, 404 untuk tidak ditemukan, 503 untuk DB sibuk).

- Kesalahan yang disengaja dilempar dengan `throw new ApiError("pesan", status, "kode")`.
- Logika bisnis ditaruh di `modules/<m>/lib/*-service.ts`, bukan di route. Contoh: `data-source-service.ts`.
- Route dengan parameter memakai `route<{ id: string }>({ … }, async ({ params }) => …)`.

### 5.3 Daftar dengan paging (CRUD list)

```ts
// validation.ts
export const listDataSourceQuerySchema = z.object({ view: …, search: …, campaign: …, ...paginationQuery() });

// service
const [total, rows] = await Promise.all([prisma.x.count({ where }), prisma.x.findMany({ where, select, ...pageArgs(query) })]);
return { rows: rows.map(toDTO), pagination: paginationOf(total, query) };
```

```tsx
// komponen client
const list = useApiList<DataSourceDTO, { rows: DataSourceDTO[]; pagination: PaginationDTO }>(
  "/api/data-sources", { view, search, campaign, page, pageSize }, (r) => r.rows, { errorMessage: tCommon("loadError") }
);
// list.items, list.loading, list.error, list.pagination, list.reload(), list.setItems(...)
```

`useApiList` (`core/hooks/use-api-list.ts`) sudah menangani debounce pencarian, pembatalan request lama, dan status loading. Jangan tulis ulang `fetch` + `AbortController` sendiri.

Komponen siap pakai:

| Komponen | Lokasi |
| -------- | ------ |
| `SearchInput` | `core/components/form` |
| `TablePagination`, `ExportMenu` | `core/components/table/table-toolbar` |
| `FilterChips` (ringkasan yang sekaligus filter) | `core/components/table` |
| `ConfirmDialog` (hapus/aksi permanen) | `core/components/feedback` |
| `StatTile` | `core/components/feedback` |
| `PageHeader` | `core/components/layout` |

### 5.4 Memanggil API dari browser

```ts
const outcome = await apiFetch<DataSourceDTO>(`/api/data-sources/${id}`, {
  ...jsonBody("PATCH", body),
  networkError: tCommon("networkError"),
});
if (!outcome.ok) return setError(outcome.error);   // outcome.status juga tersedia (mis. 409)
```

`apiFetch` (`core/lib/http/api-client.ts`) sudah menambahkan base path dan membaca format `{ success, data | error }`. Unduhan file memakai `downloadFromApi` (`core/lib/http/download.ts`) atau `downloadBlob`.

### 5.5 Export Excel/CSV

```ts
export const GET = route({ capability: "manageExplorationData", query: exportQuery }, async ({ query }) => {
  assertExportSize(await prisma.dataSource.count({ where }));         // 413 di atas 50.000 baris
  return exportResponse({ format, sheetName, baseFilename, columns, plain: true,
    rows: () => cursorRows(fetchPage, (row) => row.sampleId, toRow, PAGE_SIZE) });   // streaming
});
```

Selalu di-*stream* dengan paging cursor. Jangan mengumpulkan semua baris di memori.

### 5.6 Import besar (puluhan ribu baris)

Polanya mengikuti `modules/eksplorasi`:

1. `readUpload(request, maxBytes)` (`core/lib/http/upload.ts`) menolak file kebesaran sebelum dibaca.
2. Baca CSV/XLSX secara streaming (`data-source-file.ts`), lalu validasi per baris dengan zod. Semua error dikumpulkan, bukan hanya error pertama.
3. Dua langkah:
   - `apply=0` untuk pratinjau (tidak menulis apa pun);
   - `apply=1` untuk menulis, dengan progres `ndjsonResponse` (`core/lib/http/ndjson.ts`) yang dibaca client lewat `readNdjson`.
4. Tulis per batch dengan `chunks()` (`core/lib/batch.ts`): `createMany` untuk data baru, `UPDATE … JOIN` untuk data lama. **Jangan** loop `update` per baris di dalam satu transaksi raksasa.
5. Batasi konkurensi dengan `HeavyGate` (`core/lib/heavy-gate.ts`). Instance-nya ditaruh di `modules/<m>/lib/gates.ts`.

Hasil uji: 34.000 baris tersimpan dalam ±10 detik.

### 5.7 Menambah capability

1. Tambahkan ke `modules/<m>/capabilities.ts`, dengan komentar singkat tentang apa yang dijaganya.
2. Guard halaman dengan `requireCapabilityPage("x")`, API dengan `route({ capability: "x" })`, dan item menu di `module.ts`.
3. Test arsitektur otomatis memeriksa bahwa menu dan halaman memakai capability yang sama, dan bahwa route di `api/(<m>)` hanya memakai capability modul `<m>`.

### 5.8 Teks UI (i18n)

- Semua teks lewat `messages/<locale>.json`. Tidak boleh ada string yang di-*hardcode* di JSX.
- Kunci `id.json` dan `en.json` harus sama; ini dicek test.
- Namespace utama adalah nama fitur, misalnya `dataSource`.
- Modul boleh menambah bagian ke namespace bersama. Contoh:
  - `nav.<itemKey>` untuk item menu, dan `nav.groups.<modul>` untuk nama modul di app switcher;
  - `home.modules.<modul>` (`name`, `description`) untuk kartu di pemilih aplikasi. Kartu juga menautkan langsung ke setiap halaman `nav` yang boleh dibuka persona (maksimal 6, sisanya "+n"). Kartu membuka `homePath`; bila persona tidak boleh membukanya, kartu membuka menu pertama yang boleh (`moduleEntryPath`);
  - `help.sections.<key>`, `tours.<key>`, dan `help.welcome.<PERSONA>`.

  Semuanya digabung otomatis (`core/i18n/merge.ts`).
- Browser hanya menerima teks core + modul yang dipegang persona (`core/i18n/catalogue.ts`). Karena itu, **komponen client sebuah modul hanya boleh memakai namespace core atau modulnya sendiri**. Aturan ini dicek `client-namespaces.test.ts`.

### 5.9 Skema database

1. Tambah model di `prisma/schema/<m>.prisma`. Relasi ke `User` ditulis di `core.prisma` (field relasi balik).
   Nama tabelnya wajib diawali nama modul: `@@map("<m>_…")`; tanda hubung di key menjadi `_` (modul `geo-tech` → `geo_tech_`). Tabel bersama di `core.prisma` memakai `core_` (misalnya `core_users`). Aturan ini dicek `architecture.test.ts`, supaya di phpMyAdmin tabel milik satu modul selalu berkumpul.
2. Jalankan `npx prisma migrate dev --create-only --name <nama>`, lalu baca SQL-nya.
3. Jalankan `npx prisma migrate deploy` dan `npx prisma generate`.
4. Pastikan `npx prisma migrate diff --from-schema-datasource prisma/schema --to-schema-datamodel prisma/schema` menghasilkan "No difference".

---

## 6. Ukuran file dan pola pemecahan

- **Batas keras: 300 baris kode per file.** Komentar dan baris kosong tidak dihitung, jadi tetap tulis komentar penjelas. Ditegakkan ESLint `max-lines`.
- Fungsi di atas 200 baris kode memunculkan peringatan.
- Target sehat: ≤ 250 baris.

Bila sebuah komponen membesar, pecah menjadi folder bernama fitur, **tanpa `index.ts`**. Contoh nyata `modules/eksplorasi/components/import/`:

```
import/
  data-source-import-dialog.tsx  Komponen perakit: menyusun langkah-langkah, tanpa logika berat.
  use-data-source-import.ts      Hook: state, fetch, alur pratinjau → simpan.
  import-file-picker.tsx         Tampilan langkah 1.
  import-preview.tsx             Tampilan langkah 2.
  import-status.tsx              Tampilan langkah 3 dan 4.
```

Prinsipnya:

1. **Perakit**: menyusun bagian, menerima props, tanpa query atau aturan bisnis.
2. **Hook** `use-*.ts`: state, efek, fetch.
3. **Komponen tampilan**: menerima data dan callback lewat props.
4. **Logika murni** `.ts` (tanpa React): perhitungan, format, validasi. Mudah dites tanpa render.

Batas `"use client"` tidak boleh berubah karena pemecahan. Komponen server tetap server.

**Kapan membuat helper di core?** Bila dipakai ≥ 2 modul, atau menggantikan ≥ 3 salinan kode yang sama. Bila belum, biarkan di modulnya.

---

## 7. Aturan performa (wajib)

- Komponen **server** sebagai default; `"use client"` hanya untuk interaksi.
- Tanpa barrel `index.ts`. Impor langsung ke file.
- Kode yang menyentuh DB diawali `import "server-only";`. Tipe dan konstanta yang dipakai browser ditaruh di file murni terpisah (contoh `analytics-types.ts`), agar Prisma tidak ikut ke bundle.
- Query memakai `select` seperlunya. Data besar memakai paging **cursor**.
- Tulis per batch (`createMany`, `UPDATE … JOIN`). Jangan loop `update` per baris.
- Export di-*stream*. Import besar memakai pratinjau, batch, dan NDJSON.
- Operasi berat dibatasi dengan `HeavyGate`.
- Teks modul lain tidak dikirim ke browser (lihat 5.8).
- Jangan menambah context provider global. State tinggal di komponen atau hook yang membutuhkannya.

---

## 8. Testing

| Jenis | Pola | Contoh |
| ----- | ---- | ------ |
| Unit (logika murni) | `describe/it`, tanpa DB | `modules/eksplorasi/lib/__tests__/data-source-import.test.ts` |
| Route + DB | mock `@/core/lib/http/api-auth`, panggil handler route langsung, `describe.skipIf(!reachable)`, bersihkan data di `afterAll` | `modules/eksplorasi/lib/__tests__/data-source-import-db.test.ts` |
| Komponen | `// @vitest-environment jsdom`, `NextIntlClientProvider` + `@/core/i18n/test-messages`, `vi.stubGlobal("fetch", …)` | `modules/eksplorasi/components/import/__tests__/…` |
| Guard API (cek sumber) | `guard("capability")` dari `@/core/testing/guards` | `core/lib/auth/__tests__/permissions.test.ts` |

**Di mana test ditaruh:**

| Test tentang… | Lokasi |
| --- | --- |
| Kode core | `src/core/**/__tests__/` (tidak boleh mengimpor modul) |
| Kode sebuah modul, termasuk interaksinya dengan core | `src/modules/<m>/**/__tests__/` |
| Seluruh aplikasi atau beberapa modul sekaligus (mis. pemindai kunci i18n, akses lintas modul) | `src/app/__tests__/` |

Batas impor berlaku juga untuk file test.

Perintah:

```bash
npx tsc --noEmit        # tipe
npm run lint            # batas modul + ukuran file
npm test                # semua test (vitest)
npx next build          # build produksi
```

---

## 9. Checklist

### Menambah modul baru

Jalankan generator:

```bash
npm run module:new -- <key> [--persona <PERSONA>]
```

Generator membuat kerangka standar, lalu mencetak baris-baris registrasi. Setelah itu:

- [ ] Tambah satu baris di `src/modules/registry.ts`, `capabilities.ts`, dan `messages.ts` (termasuk tipe `ModuleCatalogue`).
- [ ] Tambah `"<key>"` di `MODULES` pada `eslint.config.mjs`.
- [ ] Bila departemen baru:
  - [ ] nilai `Department` di `prisma/schema/core.prisma` + migrasi;
  - [ ] `DEPARTMENTS`, `ROLE_DEPARTMENTS`, `PERSONAS`, dan `personaOf()` di `core/lib/auth/permissions.ts`;
  - [ ] siapa yang boleh membuat admin-nya di `modules/system/lib/user-scope.ts`;
  - [ ] akun contoh di `prisma/seed-policy.ts`.
- [ ] Perbarui test yang mematok hak akses tiap persona. Keduanya sengaja gagal sampai akses baru disetujui:
  - `src/core/lib/auth/__tests__/permissions.test.ts` ("gives <PERSONA> exactly what was agreed");
  - `src/app/__tests__/super-app.test.ts` ("opens each module to its own people only").
- [ ] (Opsional) `backup-sheets.ts` + satu baris di `src/modules/backup.ts`.
- [ ] `npx tsc --noEmit && npm run lint && npm test` hijau.

### Menambah fitur di modul yang ada

- [ ] Halaman di `src/app/(app)/<m>/…` dengan `requireCapabilityPage` + `loading.tsx`.
- [ ] Route di `src/app/api/(<m>)/…` memakai `route({ capability, body/query })`; logika di `lib/*-service.ts`.
- [ ] Skema zod di `validation.ts`, DTO di `types.ts`.
- [ ] Teks di `messages/id.json` **dan** `messages/en.json`.
- [ ] Item menu/bagian panduan/tour di `module.ts` (bila perlu).
- [ ] Test untuk logika baru.

### Review PR modul

- [ ] Halaman dan API dijaga capability yang benar (server-side, bukan hanya menyembunyikan tombol).
- [ ] Semua input API divalidasi zod.
- [ ] Teks di id + en, tanpa string hard-coded.
- [ ] Tidak ada impor lintas modul; tidak ada barrel; semua file ≤ 300 baris kode.
- [ ] Query memakai `select`; data besar memakai cursor/batch; tidak ada N+1.
- [ ] `loading.tsx` ada; `"use client"` hanya di tempat yang perlu.
- [ ] Test ditambahkan; `tsc`, `lint`, dan `test` hijau.
