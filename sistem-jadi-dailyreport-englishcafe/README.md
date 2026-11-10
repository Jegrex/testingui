# English Cafe DailyReport — Sistem Jadi (Full-Stack Production)

Versi **sistem jadi (produksi full-stack)** dari aplikasi pelaporan aktivitas harian magang **English Cafe**, dibangun dengan mempertahankan desain UI/UX asli 100% (`#E84C22`, `#512D23`, `#F39C12`, `#FDF8F5`, `Plus Jakarta Sans`, tata letak kartu, sidebar, modal bukti, dan tabel responsif), sambil mengganti seluruh simulasi statis menjadi sistem nyata berbasis **REST API + Database Persisten + Autentikasi Token/Cookie**.

---

## Perbandingan Prototipe vs Sistem Jadi

| Aspek | Folder Prototipe (`vercel-kuisioner-dailyreport-englishcafe`) | Folder Sistem Jadi (`sistem-jadi-dailyreport-englishcafe`) |
| :--- | :--- | :--- |
| **Tujuan** | Simulasi UI/UX interaktif untuk evaluasi tampilan | Sistem kerja penuh multi-pengguna & siap operasional |
| **Autentikasi** | Simulasi tombol auto-fill & uji error statis | Login & registrasi nyata, password di-hash (`scrypt` + salt), sesi `HttpOnly` cookie + `Bearer` token |
| **Proteksi Rute** | Bebas lompat halaman tanpa login | Rute `03`–`11` otomatis memeriksa peran (`peserta` / `admin`) & mengalihkan jika belum masuk |
| **Penyimpanan Data** | `localStorage` per browser (terisolasi per perangkat) | Backend Node.js (`data/database.json` & `data/uploads/`) + dukungan Vercel Upstash Redis KV |
| **Registrasi Peserta Baru** | Tersimpan sementara di browser pengisi saja | Akun langsung tersimpan di server dan **muncul otomatis di Portal Mentor/Admin lintas perangkat** |
| **Upload Bukti Foto** | Preview lokal sementara | Kompresi otomatis (`<canvas>`) lalu tersimpan ke server & tampil nyata di modal "Lihat" baik Peserta maupun Mentor |
| **Validasi & Catatan Mentor** | Simulasi lokal pada 1 akun demo | Mentor memvalidasi (`Setujui`, `Revisi`, `Tolak`, `Setujui Semua`) per peserta (`?id=`), perubahan **langsung diterima Peserta** |
| **Produktivitas Tambahan** | Data tabel statis | Pencarian real-time, filter kategori, pengurutan kolom (`aria-sort`), **Ekspor CSV (Excel)**, dan **Cetak / Simpan PDF** |
| **Antarmuka Layar** | Dilengkapi toolbar `Halaman X/Y`, `Isi Otomatis`, & banner kuning | **100% bersih** tanpa elemen pembantu prototipe — siap dipakai user nyata |

---

## Cara Menjalankan di Komputer Lokal (Zero Dependency)

Tidak perlu `npm install` dan tidak perlu instalasi database eksternal — cukup pastikan **Node.js v18+** sudah terpasang.

### Opsi 1 — Paling Mudah (Windows)
Klik dua kali file **`MULAI-SISTEM.bat`**. Server akan menyala di `http://localhost:3000` dan membuka browser secara otomatis.

### Opsi 2 — Terminal / Command Prompt
```bash
npm start
# atau langsung:
node server.js
```

Setelah server aktif, terminal akan menampilkan:
- **Alamat Lokal**: `http://localhost:3000`
- **Alamat Jaringan (LAN / Wi-Fi)**: `http://<IP-Komputer>:3000` — Mentor (laptop) dan Peserta (HP) di jaringan Wi-Fi yang sama bisa mengakses **satu database server yang sama secara real-time**!

---

## Akun Bawaan Sistem (Siap Pakai)

Database awal otomatis ter-seed berisi **1 akun Mentor/Admin** dan **10 akun Peserta Magang** beserta riwayat laporannya:

| Peran | Kredensial Login |
| :--- | :--- |
| **Mentor / Admin** | Username: `admin` &bull; Password: `admin123` |
| **Peserta Utama (Sample lengkap 8 laporan)** | Email: `angeline@gmail.com` &bull; Telepon: `089637491877` &bull; Password: `password123` |
| **Peserta Lainnya** | Email: `mathias@gmail.com`, `adnan@gmail.com`, `dewi@gmail.com`, `auranethia@gmail.com`, `regan@gmail.com`, `bobby@gmail.com`, `nathanael@gmail.com`, `ahmad@gmail.com`, `budi@gmail.com` (Password semua peserta awal: `password123`) |

> Catatan: Anda juga dapat langsung mendaftarkan akun peserta magang baru melalui halaman `01-register-peserta.html`.

---

## Struktur File & Endpoint REST API

### Struktur Direktori
- `index.html` & `01`–`11` `.html`: 12 halaman antarmuka bersih (Portal, Auth Peserta, Profil/Logbook/Upload/Edit Peserta, Auth & Dashboard/Rekap/Validasi Mentor).
- `assets/css/style.css` & `assets/js/app.js`: Desain visual English Cafe + client engine API, validasi interaktif, modal `<dialog closedby="any">`, pengurutan kolom tabel, ekspor CSV, dan cetak PDF.
- `server.js`: HTTP server lokal (static file server + `/api/*` & `/uploads/*` router).
- `api/index.js`: Serverless entrypoint untuk deployment **Vercel**.
- `backend/store.js` & `backend/handler.js`: Autentikasi HMAC + `scrypt`, penyimpanan file gambar, logika bisnis peserta/laporan/validasi.
- `data/database.json` & `data/uploads/`: Dibuat otomatis saat server dijalankan secara lokal.

### Ringkasan Endpoint API
- `GET /api/health` — Status server, runtime, mode penyimpanan, jumlah peserta & laporan.
- `POST /api/auth/register-peserta` — Pendaftaran akun peserta baru.
- `POST /api/auth/login-peserta` & `POST /api/auth/login-admin` — Autentikasi & pembuatan sesi.
- `POST /api/auth/logout` & `GET /api/auth/me` — Penutupan & verifikasi sesi aktif.
- `PUT /api/me`, `PUT /api/me/password`, `POST /api/me/avatar` — Pembaruan profil, password, & foto profil peserta.
- `GET /api/reports`, `POST /api/reports` — Daftar laporan (milik sendiri / `?internId=` untuk admin) & kirim laporan baru beserta foto bukti.
- `GET/PUT/DELETE /api/reports/:id` — Lihat, perbaiki/kirim ulang revisi, atau hapus laporan.
- `GET /api/admin/interns`, `GET/DELETE /api/admin/interns/:id`, `PATCH /api/admin/interns/:id/status` — Kelola daftar & status peserta (`aktif` / `selesai`).
- `POST /api/admin/interns/:id/approve-all-pending` — Setujui seluruh laporan berstatus *Menunggu* sekaligus.
- `PATCH /api/admin/reports/:id/validate` — Validasi laporan (`valid`, `revisi`, `ditolak`, `menunggu`) beserta catatan arahan mentor.

---

## Deployment ke Vercel (Opsional Cloud Hosting)

1. Push folder ini ke repository GitHub, lalu hubungkan ke **Vercel** (root directory mengarah ke `sistem-jadi-dailyreport-englishcafe`).
2. `vercel.json` sudah mengarahkan `/api/*` dan `/uploads/*` ke `api/index.js` secara otomatis tanpa konfigurasi build tambahan (`Framework Preset: Other`).
3. **Untuk database cloud permanen di Vercel** *(agar registrasi peserta dari HP tetap tersimpan permanen di server Vercel dan langsung terbaca dari laptop Mentor)*:
   - Hubungkan integrasi **Upstash Redis / Vercel KV** di Project Settings &rarr; Environment Variables (`KV_REST_API_URL` & `KV_REST_API_TOKEN`, atau `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`), serta disarankan menambahkan `SESSION_SECRET`.
   - Tanpa Redis KV, Vercel tetap berjalan memakai penyimpanan sementara `/tmp` per instance (cocok untuk uji cepat, namun data reset jika serverless cold-start).
