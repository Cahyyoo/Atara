# Layanan face Atara

Deteksi dan pengenalan wajah dlib, dibungkus dalam layanan HTTP kecil.

Layanan ini ada karena browser tidak sanggup mengerjakannya dengan baik. Aplikasi
web dulu menjalankan jaringan pengenalan yang sama — face-api.js membawa salinan
ResNet milik dlib yang sudah dikonversi dan dikuantisasi ke uint8 — tetapi
memasangkannya dengan detektor 188KB yang terus-menerus gagal menemukan wajah
sama sekali, dan backend tfjs yang belum tentu memakai GPU. Layanan ini
menjalankan detektor dlib yang asli secara native.

## Apa yang dikerjakan dan tidak dikerjakan

Layanan ini menjalankan model dan melaporkan angka. Ia **tidak memegang kebijakan
apa pun**: ia tidak tahu skor berapa yang cukup baik, selebar apa wajah
seharusnya, apa yang terhitung kedipan, atau siapa yang sedang masuk. Aturan-aturan
itu tinggal di aplikasi web — `src/lib/face-quality.ts`, `src/lib/face-liveness.ts`,
`src/lib/face-match.ts` — tempat aturan itu memang sudah berada dan sudah diuji.

Pemisahan itulah intinya. Aturan kedipan yang ditulis juga di sini akan menjadi
salinan kedua dari aturan yang harus selalu sama dengan yang pertama, dan
keduanya akan bergeser tanpa ada yang gagal. Landmark mata diteruskan apa adanya
sebagai enam titik per mata, persis seperti yang diharapkan `eyeAspectRatio()`,
sehingga fungsi itu tetap menjadi satu-satunya implementasi.

Layanan ini juga tidak pernah menulis frame ke disk, tidak pernah mengembalikannya,
dan tidak pernah mencantumkannya di baris log.

## Setup

```bash
cd face
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # Windows
# .venv/bin/python -m pip install -r requirements.txt     # macOS / Linux

python scripts/fetch_models.py      # ~122MB, sekali saja
cp .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(32))"   # isikan ke FACE_SERVICE_TOKEN
```

`dlib-bin` adalah wheel siap pakai, jadi tidak perlu CMake maupun Visual Studio
Build Tools. Membangun `dlib` biasa dari source membutuhkan toolchain C++ dan
sekitar dua puluh menit.

## Menjalankan

```bash
.venv/Scripts/python -m app.main
```

Dua proses selama pengembangan: ini, dan `npm run dev` di `web/`.

Layanan ini menolak berjalan — bukan sekadar memberi peringatan — jika `FACE_HOST`
bukan alamat loopback, atau `FACE_SERVICE_TOKEN` kosong, terlalu pendek, atau masih
berupa placeholder. Port yang terbuka dan kata sandi bawaan bukan salah konfigurasi
yang cukup dicatat di log ketika yang ada di baliknya adalah data biometrik.

## API

```
GET  /health      -> { ok, detector, dlib, blas, descriptorLength, modelDir }

POST /descriptor  X-Face-Token: <token>
     { "frames": ["<base64 jpeg>", ...], "jitters": 1 }
  -> { "frames": [ { detected, score, box{x,y,width,height},
                     leftEye[6][2], rightEye[6][2], luminance } ],
       "descriptor": [128 floats] | null,
       "bestFrameIndex": int | null,
       "engine": { detector, elapsedMs } }
```

Geometri selalu dinyatakan sebagai **pecahan dari frame**, tidak pernah dalam piksel,
karena itulah yang dibandingkan oleh `face-quality.ts`. `score` dipetakan ke 0–1
agar `MIN_DETECTION_SCORE` yang sudah ada tetap bermakna sama; lihat
`HOG_SCORE_FLOOR` di `app/engine.py` untuk cara kedua skala itu disambungkan dan
apa yang diukur.

Setiap frame yang dikirim dilaporkan kembali, termasuk yang tidak berisi wajah.
"Saya sudah melihat dan tidak ada siapa-siapa" adalah sebuah jawaban, dan pemanggil
membutuhkan jumlahnya untuk membedakannya dari kamera yang tidak mengirim apa-apa.

## Hasil pengukuran di mesin ini

Satu kali pengambilan, frame 640×480, lewat HTTP:

| frame | upload | waktu total | terdeteksi |
|---|---|---|---|
| 4 | 190KB | 645ms | 4/4 |
| 8 | 381KB | 812ms | 8/8 |
| 12 | 571KB | 954ms | 12/12 |

Proses descriptor memakan ~380ms dari angka itu dan hanya dijalankan sekali. Deteksi
memakan ~45ms per frame.

Sejak itu, frame setelah yang pertama hanya dicari di sekitar wajah terakhir
(`ROI_MARGIN` dan `ROI_FACE_WIDTH` di `app/engine.py`), dengan frame penuh sebagai
cadangan. Di dalam proses, dua belas frame 640×480 dari `headshot-a.jpg`:

| | hanya deteksi | dengan descriptor |
|---|---|---|
| frame penuh setiap kali | 525ms | 904ms |
| dicari di dekat wajah terakhir | 179ms | 568ms |

### Descriptor lebih cepat: dlib dengan OpenBLAS

`dlib-bin` dibangun tanpa BLAS, sehingga ResNet di balik descriptor mengalikan
matriksnya dengan loop milik dlib sendiri. Jika dibangun dengan OpenBLAS — foto
yang sama, mesin yang sama, masing-masing dua kali percobaan:

| | `dlib-bin` | dengan OpenBLAS |
|---|---|---|
| descriptor | ~400ms | ~29ms |
| burst dua belas frame, termasuk descriptor | ~600ms | ~210ms |
| deteksi HOG, 640px | ~41ms | ~41ms (tidak memakai BLAS) |

Descriptor dari keduanya sama hingga 1e-6, sehingga pendaftaran wajah yang dibuat
di salah satu build tetap cocok di build lainnya dan tidak ada yang perlu mendaftar
ulang. Semua tes engine lolos di kedua build.

Ini opsional karena membangunnya tidak gratis: perlu Visual Studio Build Tools
dengan workload C++, dan sekitar lima belas menit.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_dlib_blas.ps1            # menulis wheels\dlib-*.whl
powershell -ExecutionPolicy Bypass -File scripts\build_dlib_blas.ps1 -Install   # sekaligus memasangnya ke .venv
```

Jika wheel sudah ada di `wheels\`, menggantinya tidak perlu membangun ulang.
Hentikan layanan terlebih dahulu: Windows tidak mau mengganti `.pyd` yang sedang
dimuat oleh worker yang berjalan.

```powershell
.venv\Scripts\python -m pip uninstall -y dlib-bin
.venv\Scripts\python -m pip install --no-deps wheels\dlib-20.0.1-cp310-cp310-win_amd64.whl
```

Engine memanaskan setiap model di lifespan masing-masing worker
(`FaceEngine.warm_up`), sehingga biaya OpenBLAS menyalakan thread-nya dibayar saat
startup, bukan oleh proses masuk pertama yang dilayani tiap worker.

Wheel tersebut membawa `libopenblas.dll` di dalamnya, sehingga bisa dipasang di
mesin lain dengan versi Python yang sama tanpa membutuhkan apa pun lagi di sana.
Tanpa DLL itu `import dlib` gagal dan layanan menolak berjalan — itulah sebabnya
skrip membundelnya alih-alih membiarkannya di `PATH`. `GET /health` melaporkan
`"blas": true` setelah layanan berjalan di atasnya. Menjalankan
`pip install -r requirements.txt` setelahnya akan mengembalikan `dlib-bin`.

### Dua hal yang sudah diukur lalu dibuang

**Upsampling.** `upsample=1` memakan 158ms per frame dibanding 41ms pada
`upsample=0`, dan menemukan wajah yang sama. Fitur itu ada untuk menjangkau wajah
yang lebih kecil dari jendela pelatihan 80×80 milik dlib, dan wajah sekecil itu
di frame 640px sudah ditolak oleh `MIN_FACE_WIDTH`. Empat kali biayanya untuk
membuktikan hal yang sama.

**Detektor CNN.** `mmod_human_face_detector.dat` tadinya akan menjadi cadangan HOG
setiap kali HOG tidak menemukan apa-apa. Diukur pada foto yang sama:

| lebar | CNN | wajah | HOG | wajah |
|---|---|---|---|---|
| 240 | 954ms | 0 | 7ms | 1 |
| 320 | 1620ms | 1 | 11ms | 3 |
| 480 | 3691ms | 3 | 24ms | 3 |
| 640 | 6409ms | 3 | 41ms | 3 |

Bukan cadangan namanya jika lebih lambat dan menemukan lebih sedikit. Dibuang,
bersama bobotnya yang 0,7MB. Dicatat di sini dan di `app/engine.py` agar tidak
ditambahkan kembali dengan anggapan bahwa model yang lebih besar pasti lebih baik.

## Tes

```bash
.venv/Scripts/python -m pytest
```

Tes yang paling penting adalah yang bisa membuat seseorang masuk ke akun yang
salah — bahwa wajah yang sama tetap cocok dengan dirinya sendiri, bahwa dua orang
tetap tidak cocok, dan bahwa mengubah ukuran frame tidak mengubah siapa orangnya.
Model yang diganti dengan model lain yang bisa dimuat tetapi mendeskripsikan wajah
secara berbeda akan lolos semua tes lainnya.

Foto contoh berasal dari contoh resmi dlib dan diunduh, bukan di-commit — itu
wajah seseorang. Tes yang membutuhkannya akan dilewati jika foto tidak ada:

```bash
python scripts/make_fixtures.py
```

Skrip itu mengunduh foto asli dan juga menulis `headshot-a.jpg` dan
`headshot-b.jpg`: dua wajah yang sama dipotong ulang ke framing yang dihasilkan
webcam laptop. Foto asli adalah bidikan lebar dengan wajah hanya 21% dari lebar
frame, yang memang sudah benar ditolak aplikasi sebagai "terlalu jauh" — menguji
produk dengan frame yang akan ditolak produk itu sendiri tidak membuktikan apa-apa.
Hasil potongan berada di 34%, nyaman di antara `MIN_FACE_WIDTH` dan
`MAX_FACE_WIDTH`, dan itulah yang dikirim oleh
`web/src/lib/__tests__/face-e2e.test.ts`.

### Tes end-to-end

`web/src/lib/__tests__/face-e2e.test.ts` mengirim frame ke aplikasi web dan
mengikutinya sampai ke sini. Tes ini dilewati — dengan pemberitahuan yang jelas —
kecuali layanan ini dan aplikasi web sama-sama merespons. Tes integrasi yang
dilewati diam-diam terlihat persis seperti tes yang lolos di baris ringkasan.

Triknya: burst foto diam yang kembali dengan `not-alive` sudah membuktikan deteksi,
gerbang kualitas, descriptor, dan kebijakan — semuanya kecuali satu hal yang tidak
bisa dilakukan sebuah foto. Jika yang kembali `no-face`, itu menunjukkan di mana
rantainya putus.

### Satu hal yang diuji manual

Pemanggil tidak boleh pernah menerima sesi ketika layanan ini mati. Tidak ada tes
otomatis untuk ini, karena `face-service.ts` mengimpor `server-only`, yang melempar
error di luar konteks server sehingga tidak bisa dimuat oleh vitest. Diverifikasi
dengan menghentikan layanan ini lalu mengirim burst:

```
HTTP/1.1 503 Service Unavailable
{"success":false,"error":"Face recognition is temporarily unavailable…","code":"service-down"}
```

Tidak ada `set-cookie`. Jika suatu saat ini menjawab 200, faktor kedua diam-diam
menjadi opsional setiap kali sebuah proses Python mati.

## Seberapa besar nilainya

Pemeriksaan kedipan menghentikan rekan kerja yang mengangkat ponsel atau foto
cetak, yang merupakan upaya realistis di laboratorium bersama. Pemeriksaan ini
tidak menghentikan siapa pun yang mengirim langsung ke endpoint ini, dan memindahkan
pekerjaan ke sini tidak mengubah hal itu — frame tetap berasal dari browser yang
dikendalikan penyerang. Kata sandi di depannyalah yang sebenarnya menjadi penopang
utama.

Memindahkan inferensi ke sini juga berarti gambar wajah kini melintasi jaringan,
padahal sebelumnya tidak pernah meninggalkan laptop. Menurut UU PDP No. 27/2022,
biometrik adalah *data pribadi spesifik*, dan itulah sebabnya layanan ini hanya
mendengarkan di loopback, memegang token, dan tidak menuliskan apa pun.
