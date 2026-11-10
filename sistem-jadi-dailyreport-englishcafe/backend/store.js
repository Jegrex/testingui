'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const IS_VERCEL = Boolean(process.env.VERCEL);
const ROOT_DIR = path.resolve(__dirname, '..');
const LOCAL_DATA_DIR = path.join(ROOT_DIR, 'data');
const DATA_DIR = IS_VERCEL ? '/tmp/ec-dailyreport-data' : LOCAL_DATA_DIR;
const DB_FILE = path.join(DATA_DIR, 'database.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const HAS_KV = Boolean(KV_URL && KV_TOKEN);
const KV_KEY = 'ec_dailyreport_db_v1';

const SESSION_SECRET = process.env.SESSION_SECRET || 'ec-dailyreport-englishcafe-2026-prod-secret';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function hashPassword(password, existingSalt = null) {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  try {
    const derived = crypto.scryptSync(String(password), salt, 64);
    const keyBuf = Buffer.from(keyHex, 'hex');
    if (derived.length !== keyBuf.length) return false;
    return crypto.timingSafeEqual(derived, keyBuf);
  } catch {
    return false;
  }
}

function formatDateIndo(dateIso) {
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return { main: dateIso || '-', day: '', full: dateIso || '-', timestamp: 0 };
  }
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = DAYS_ID[dt.getUTCDay()];
  const month = MONTHS_ID[m - 1];
  const main = `${d} ${month} ${y}`;
  return {
    main,
    day,
    full: `${day}, ${main}`,
    timestamp: dt.getTime()
  };
}

function formatPeriodeIndo(startIso, endIso) {
  const s = formatDateIndo(startIso);
  const e = formatDateIndo(endIso);
  if (s.main === '-' || e.main === '-') return `${startIso || ''} - ${endIso || ''}`.trim();
  return `${s.main} - ${e.main}`;
}

function buildSeedDatabase() {
  const defaultInternHash = hashPassword('password123', 'ec_seed_salt_intern');
  const defaultAdminHash = hashPassword('admin123', 'ec_seed_salt_admin');

  const admins = [
    {
      id: 'adm-1',
      username: 'admin',
      email: 'admin@gmail.com',
      nama: 'Admin Mentor English Cafe',
      role: 'admin',
      passwordHash: defaultAdminHash,
      createdAt: '2026-08-01T08:00:00.000Z'
    }
  ];

  const interns = [
    {
      id: 'int-angeline',
      nama: 'Angeline Martcella',
      namaPanggilan: 'Angel',
      email: 'angeline@gmail.com',
      telepon: '089637491877',
      alamat: 'Jl. Teknologi No. 123, Kota Surakarta, Jawa Tengah',
      universitas: 'Universitas Duta Bangsa Surakarta',
      jurusan: 'Teknik Informatika',
      jenis: 'MBKM',
      divisi: 'IT',
      tglMulai: '2026-08-19',
      tglAkhir: '2026-12-27',
      status: 'aktif',
      avatarUrl: '',
      passwordHash: defaultInternHash,
      createdAt: '2026-08-19T08:00:00.000Z'
    },
    {
      id: 'int-mathias',
      nama: 'Mathias Rekyan',
      namaPanggilan: 'Mathias',
      email: 'mathias@gmail.com',
      telepon: '081234567801',
      alamat: 'Jl. Slamet Riyadi No. 45, Laweyan, Surakarta',
      universitas: 'Universitas Duta Bangsa Surakarta',
      jurusan: 'Sistem Informasi',
      jenis: 'MBKM',
      divisi: 'IT',
      tglMulai: '2026-08-19',
      tglAkhir: '2026-12-27',
      status: 'aktif',
      avatarUrl: '',
      passwordHash: defaultInternHash,
      createdAt: '2026-08-19T08:10:00.000Z'
    },
    {
      id: 'int-adnan',
      nama: 'Adnan Hanafi',
      namaPanggilan: 'Adnan',
      email: 'adnan@gmail.com',
      telepon: '081234567802',
      alamat: 'Jl. Bhayangkara No. 18, Serengan, Surakarta',
      universitas: 'Universitas Duta Bangsa Surakarta',
      jurusan: 'Teknik Informatika',
      jenis: 'Reguler',
      divisi: 'IT',
      tglMulai: '2026-08-19',
      tglAkhir: '2026-12-27',
      status: 'aktif',
      avatarUrl: '',
      passwordHash: defaultInternHash,
      createdAt: '2026-08-19T08:20:00.000Z'
    },
    {
      id: 'int-dewi',
      nama: 'Dewi Lesmani',
      namaPanggilan: 'Dewi',
      email: 'dewi@gmail.com',
      telepon: '081234567803',
      alamat: 'Jl. Ir. Sutami No. 36A, Kentingan, Surakarta',
      universitas: 'Universitas Sebelas Maret',
      jurusan: 'Manajemen SDM',
      jenis: 'MBKM',
      divisi: 'HRD',
      tglMulai: '2026-08-15',
      tglAkhir: '2026-12-20',
      status: 'aktif',
      avatarUrl: '',
      passwordHash: defaultInternHash,
      createdAt: '2026-08-15T08:00:00.000Z'
    },
    {
      id: 'int-auranethia',
      nama: 'Auranethia Indy',
      namaPanggilan: 'Indy',
      email: 'auranethia@gmail.com',
      telepon: '081234567804',
      alamat: 'Jl. Adi Sucipto No. 102, Manahan, Surakarta',
      universitas: 'Universitas Sebelas Maret',
      jurusan: 'Ilmu Komunikasi',
      jenis: 'MBKM',
      divisi: 'Public Relation',
      tglMulai: '2026-08-15',
      tglAkhir: '2026-12-20',
      status: 'aktif',
      avatarUrl: '',
      passwordHash: defaultInternHash,
      createdAt: '2026-08-15T08:30:00.000Z'
    },
    {
      id: 'int-regan',
      nama: 'Regan Xeimoraga',
      namaPanggilan: 'Regan',
      email: 'regan@gmail.com',
      telepon: '081234567805',
      alamat: 'Jl. Ahmad Yani No. 78, Pabelan, Sukoharjo',
      universitas: 'Universitas Sebelas Maret',
      jurusan: 'Bisnis Digital',
      jenis: 'Mandiri',
      divisi: 'Marketing',
      tglMulai: '2026-09-01',
      tglAkhir: '2026-12-30',
      status: 'aktif',
      avatarUrl: '',
      passwordHash: defaultInternHash,
      createdAt: '2026-09-01T08:00:00.000Z'
    },
    {
      id: 'int-bobby',
      nama: 'Bobby Maulana',
      namaPanggilan: 'Bobby',
      email: 'bobby@gmail.com',
      telepon: '081234567806',
      alamat: 'Jl. LU Adisucipto No. 33, Kerten, Surakarta',
      universitas: 'SMK Negeri 2 Surakarta',
      jurusan: 'Rekayasa Perangkat Lunak',
      jenis: 'PKL',
      divisi: 'IT',
      tglMulai: '2026-07-15',
      tglAkhir: '2026-12-20',
      status: 'aktif',
      avatarUrl: '',
      passwordHash: defaultInternHash,
      createdAt: '2026-07-15T08:00:00.000Z'
    },
    {
      id: 'int-nathanael',
      nama: 'Nathanael Juan',
      namaPanggilan: 'Juan',
      email: 'nathanael@gmail.com',
      telepon: '081234567807',
      alamat: 'Jl. Veteran No. 114, Pasar Kliwon, Surakarta',
      universitas: 'SMK Negeri 2 Surakarta',
      jurusan: 'Multimedia',
      jenis: 'PKL',
      divisi: 'Marketing',
      tglMulai: '2026-07-15',
      tglAkhir: '2026-12-20',
      status: 'aktif',
      avatarUrl: '',
      passwordHash: defaultInternHash,
      createdAt: '2026-07-15T08:15:00.000Z'
    },
    {
      id: 'int-ahmad',
      nama: 'Ahmad Hidayat',
      namaPanggilan: 'Ahmad',
      email: 'ahmad@gmail.com',
      telepon: '081234567808',
      alamat: 'Jl. Soekarno Hatta No. 9, Lowokwaru, Malang',
      universitas: 'Universitas Brawijaya',
      jurusan: 'Akuntansi',
      jenis: 'Reguler',
      divisi: 'Finance',
      tglMulai: '2026-02-01',
      tglAkhir: '2026-06-30',
      status: 'selesai',
      avatarUrl: '',
      passwordHash: defaultInternHash,
      createdAt: '2026-02-01T08:00:00.000Z'
    },
    {
      id: 'int-budi',
      nama: 'Budi Santoso',
      namaPanggilan: 'Budi',
      email: 'budi@gmail.com',
      telepon: '081234567809',
      alamat: 'Jl. MT Haryono No. 167, Dinoyo, Malang',
      universitas: 'Universitas Brawijaya',
      jurusan: 'Administrasi Bisnis',
      jenis: 'Reguler',
      divisi: 'HRD',
      tglMulai: '2026-02-01',
      tglAkhir: '2026-06-30',
      status: 'selesai',
      avatarUrl: '',
      passwordHash: defaultInternHash,
      createdAt: '2026-02-01T08:10:00.000Z'
    }
  ];

  const reports = [
    // Angeline (8 seeded reports matching the exact UI dataset)
    {
      id: 'rep-1',
      internId: 'int-angeline',
      dateIso: '2026-12-10',
      hasilKerja: 'Mengikuti rapat kerja sama kemitraan magang English Cafe dengan UMS',
      kendala: 'Tidak ada',
      proofName: 'Rapat_Kerja_Sama_EnglishCafe.svg',
      proofUrl: '/assets/img/samples/rapat.svg',
      status: 'menunggu',
      mentorNote: '',
      validatedBy: '',
      validatedAt: '',
      createdAt: '2026-12-10T16:30:00.000Z',
      updatedAt: '2026-12-10T16:30:00.000Z'
    },
    {
      id: 'rep-2',
      internId: 'int-angeline',
      dateIso: '2026-12-09',
      hasilKerja: 'Evaluasi Website DailyReport English Cafe bersama Mentor',
      kendala: 'Masih ada beberapa tampilan yang belum jadi',
      proofName: 'Evaluasi_Website_DailyReport.svg',
      proofUrl: '/assets/img/samples/website.svg',
      status: 'menunggu',
      mentorNote: '',
      validatedBy: '',
      validatedAt: '',
      createdAt: '2026-12-09T17:00:00.000Z',
      updatedAt: '2026-12-09T17:00:00.000Z'
    },
    {
      id: 'rep-3',
      internId: 'int-angeline',
      dateIso: '2026-12-08',
      hasilKerja: 'Mengerjakan desain untuk background pada tampilan demo aplikasi pembelajaran pada website English Cafe',
      kendala: 'Tidak ada',
      proofName: 'Desain_Background_Aplikasi_EC.svg',
      proofUrl: '/assets/img/samples/desain.svg',
      status: 'menunggu',
      mentorNote: '',
      validatedBy: '',
      validatedAt: '',
      createdAt: '2026-12-08T16:45:00.000Z',
      updatedAt: '2026-12-08T16:45:00.000Z'
    },
    {
      id: 'rep-4',
      internId: 'int-angeline',
      dateIso: '2026-12-05',
      hasilKerja: 'Mengikuti senam bersama & Morning Speaking Session English Cafe',
      kendala: 'Tidak ada',
      proofName: 'Morning_Speaking_Session.svg',
      proofUrl: '/assets/img/samples/speaking.svg',
      status: 'revisi',
      mentorNote: 'Lampirkan foto saat sesi Morning Speaking berlangsung & lengkapi ringkasan materi.',
      validatedBy: 'Admin Mentor English Cafe',
      validatedAt: '2026-12-06T09:15:00.000Z',
      createdAt: '2026-12-05T15:30:00.000Z',
      updatedAt: '2026-12-06T09:15:00.000Z'
    },
    {
      id: 'rep-5',
      internId: 'int-angeline',
      dateIso: '2026-12-04',
      hasilKerja: 'Menjadi peserta pelatihan Web Security & Front-End English Cafe',
      kendala: 'Acara dimulai tidak tepat waktu',
      proofName: 'Pelatihan_Web_Security.svg',
      proofUrl: '/assets/img/samples/pelatihan.svg',
      status: 'ditolak',
      mentorNote: 'Bukti dokumentasi buram dan deskripsi tidak sesuai dengan tugas divisi IT.',
      validatedBy: 'Admin Mentor English Cafe',
      validatedAt: '2026-12-05T08:40:00.000Z',
      createdAt: '2026-12-04T17:10:00.000Z',
      updatedAt: '2026-12-05T08:40:00.000Z'
    },
    {
      id: 'rep-6',
      internId: 'int-angeline',
      dateIso: '2026-12-03',
      hasilKerja: 'Menjadi panitia pelatihan kelas industri berdampak 2026',
      kendala: 'Tidak ada, acara berjalan lancar',
      proofName: 'Panitia_Kelas_Industri_2026.svg',
      proofUrl: '/assets/img/samples/pelatihan.svg',
      status: 'valid',
      mentorNote: '',
      validatedBy: 'Admin Mentor English Cafe',
      validatedAt: '2026-12-04T09:00:00.000Z',
      createdAt: '2026-12-03T16:50:00.000Z',
      updatedAt: '2026-12-04T09:00:00.000Z'
    },
    {
      id: 'rep-7',
      internId: 'int-angeline',
      dateIso: '2026-12-02',
      hasilKerja: 'Melanjutkan coding website English Cafe bagian opsi paket kursus',
      kendala: 'Tidak ada',
      proofName: 'Coding_Paket_Kursus_EC.svg',
      proofUrl: '/assets/img/samples/website.svg',
      status: 'valid',
      mentorNote: '',
      validatedBy: 'Admin Mentor English Cafe',
      validatedAt: '2026-12-03T08:30:00.000Z',
      createdAt: '2026-12-02T17:05:00.000Z',
      updatedAt: '2026-12-03T08:30:00.000Z'
    },
    {
      id: 'rep-8',
      internId: 'int-angeline',
      dateIso: '2026-12-01',
      hasilKerja: 'Menjadi panitia pelatihan kelas industri berdampak 2026',
      kendala: 'Konsumsi datang terlambat',
      proofName: 'Hari_Pertama_Kelas_Industri.svg',
      proofUrl: '/assets/img/samples/pelatihan.svg',
      status: 'valid',
      mentorNote: '',
      validatedBy: 'Admin Mentor English Cafe',
      validatedAt: '2026-12-02T09:20:00.000Z',
      createdAt: '2026-12-01T16:40:00.000Z',
      updatedAt: '2026-12-02T09:20:00.000Z'
    },

    // Mathias Rekyan
    {
      id: 'rep-m1',
      internId: 'int-mathias',
      dateIso: '2026-12-10',
      hasilKerja: 'Integrasi endpoint REST API autentikasi peserta dan manajemen sesi token',
      kendala: 'Penyesuaian validasi CORS lokal dan Vercel',
      proofName: 'API_Auth_Integration.svg',
      proofUrl: '/assets/img/samples/website.svg',
      status: 'menunggu',
      mentorNote: '',
      validatedBy: '',
      validatedAt: '',
      createdAt: '2026-12-10T16:20:00.000Z',
      updatedAt: '2026-12-10T16:20:00.000Z'
    },
    {
      id: 'rep-m2',
      internId: 'int-mathias',
      dateIso: '2026-12-09',
      hasilKerja: 'Testing endpoint upload bukti pekerjaan & kompresi ukuran gambar',
      kendala: 'Tidak ada',
      proofName: 'Testing_Upload_Bukti.svg',
      proofUrl: '/assets/img/samples/website.svg',
      status: 'valid',
      mentorNote: '',
      validatedBy: 'Admin Mentor English Cafe',
      validatedAt: '2026-12-10T08:15:00.000Z',
      createdAt: '2026-12-09T16:10:00.000Z',
      updatedAt: '2026-12-10T08:15:00.000Z'
    },
    {
      id: 'rep-m3',
      internId: 'int-mathias',
      dateIso: '2026-12-08',
      hasilKerja: 'Menyusun skema struktur database JSON untuk laporan harian magang',
      kendala: 'Tidak ada',
      proofName: 'Skema_Database_Logbook.svg',
      proofUrl: '/assets/img/samples/rapat.svg',
      status: 'valid',
      mentorNote: '',
      validatedBy: 'Admin Mentor English Cafe',
      validatedAt: '2026-12-09T09:00:00.000Z',
      createdAt: '2026-12-08T16:00:00.000Z',
      updatedAt: '2026-12-09T09:00:00.000Z'
    },

    // Adnan Hanafi
    {
      id: 'rep-ad1',
      internId: 'int-adnan',
      dateIso: '2026-12-10',
      hasilKerja: 'Optimasi tampilan responsif tabel logbook harian pada layar smartphone 390px',
      kendala: 'Tidak ada',
      proofName: 'Responsive_Table_Mobile.svg',
      proofUrl: '/assets/img/samples/desain.svg',
      status: 'menunggu',
      mentorNote: '',
      validatedBy: '',
      validatedAt: '',
      createdAt: '2026-12-10T16:00:00.000Z',
      updatedAt: '2026-12-10T16:00:00.000Z'
    },
    {
      id: 'rep-ad2',
      internId: 'int-adnan',
      dateIso: '2026-12-09',
      hasilKerja: 'Membuat halaman login dan validasi input email serta password mentor',
      kendala: 'Penyesuaian pesan error inline',
      proofName: 'Login_Mentor_UI.svg',
      proofUrl: '/assets/img/samples/website.svg',
      status: 'revisi',
      mentorNote: 'Pastikan fokus keyboard langsung diarahkan ke field yang error saat submit gagal.',
      validatedBy: 'Admin Mentor English Cafe',
      validatedAt: '2026-12-09T18:00:00.000Z',
      createdAt: '2026-12-09T15:40:00.000Z',
      updatedAt: '2026-12-09T18:00:00.000Z'
    },
    {
      id: 'rep-ad3',
      internId: 'int-adnan',
      dateIso: '2026-12-08',
      hasilKerja: 'Daily standup & pembagian modul antarmuka aplikasi English Cafe',
      kendala: 'Tidak ada',
      proofName: 'Daily_Standup_Tim_IT.svg',
      proofUrl: '/assets/img/samples/rapat.svg',
      status: 'valid',
      mentorNote: '',
      validatedBy: 'Admin Mentor English Cafe',
      validatedAt: '2026-12-09T08:30:00.000Z',
      createdAt: '2026-12-08T15:00:00.000Z',
      updatedAt: '2026-12-09T08:30:00.000Z'
    },

    // Dewi Lesmani
    {
      id: 'rep-dw1',
      internId: 'int-dewi',
      dateIso: '2026-12-10',
      hasilKerja: 'Rekapitulasi absensi peserta magang gelombang Agustus-Desember 2026',
      kendala: 'Menunggu konfirmasi dua peserta izin akademik',
      proofName: 'Rekap_Absensi_HRD.svg',
      proofUrl: '/assets/img/samples/rapat.svg',
      status: 'menunggu',
      mentorNote: '',
      validatedBy: '',
      validatedAt: '',
      createdAt: '2026-12-10T16:15:00.000Z',
      updatedAt: '2026-12-10T16:15:00.000Z'
    },
    {
      id: 'rep-dw2',
      internId: 'int-dewi',
      dateIso: '2026-12-09',
      hasilKerja: 'Menyiapkan draft jadwal evaluasi akhir & sertifikat kelulusan magang',
      kendala: 'Tidak ada',
      proofName: 'Draft_Sertifikat_Magang.svg',
      proofUrl: '/assets/img/samples/pelatihan.svg',
      status: 'valid',
      mentorNote: '',
      validatedBy: 'Admin Mentor English Cafe',
      validatedAt: '2026-12-09T17:30:00.000Z',
      createdAt: '2026-12-09T15:30:00.000Z',
      updatedAt: '2026-12-09T17:30:00.000Z'
    },

    // Auranethia Indy
    {
      id: 'rep-au1',
      internId: 'int-auranethia',
      dateIso: '2026-12-10',
      hasilKerja: 'Menyusun rilis pers & publikasi kegiatan English Cafe Speaking Club dengan kampus mitra',
      kendala: 'Tidak ada',
      proofName: 'Publikasi_Speaking_Club.svg',
      proofUrl: '/assets/img/samples/speaking.svg',
      status: 'menunggu',
      mentorNote: '',
      validatedBy: '',
      validatedAt: '',
      createdAt: '2026-12-10T16:05:00.000Z',
      updatedAt: '2026-12-10T16:05:00.000Z'
    },
    {
      id: 'rep-au2',
      internId: 'int-auranethia',
      dateIso: '2026-12-08',
      hasilKerja: 'Koordinasi audiensi kunjungan mahasiswa dari Universitas Sebelas Maret',
      kendala: 'Penyesuaian jadwal ruang rapat cabang pusat',
      proofName: 'Audiensi_Kampus_Mitra.svg',
      proofUrl: '/assets/img/samples/rapat.svg',
      status: 'valid',
      mentorNote: '',
      validatedBy: 'Admin Mentor English Cafe',
      validatedAt: '2026-12-09T08:50:00.000Z',
      createdAt: '2026-12-08T16:20:00.000Z',
      updatedAt: '2026-12-09T08:50:00.000Z'
    },

    // Regan Xeimoraga
    {
      id: 'rep-rg1',
      internId: 'int-regan',
      dateIso: '2026-12-10',
      hasilKerja: 'Membuat konten visual promosi paket kursus akhir tahun untuk Instagram English Cafe',
      kendala: 'Tidak ada',
      proofName: 'Konten_Promosi_IG.svg',
      proofUrl: '/assets/img/samples/desain.svg',
      status: 'menunggu',
      mentorNote: '',
      validatedBy: '',
      validatedAt: '',
      createdAt: '2026-12-10T15:50:00.000Z',
      updatedAt: '2026-12-10T15:50:00.000Z'
    },
    {
      id: 'rep-rg2',
      internId: 'int-regan',
      dateIso: '2026-12-09',
      hasilKerja: 'Audit kata kunci SEO halaman landing page program kelas reguler English Cafe',
      kendala: 'Tidak ada',
      proofName: 'Audit_SEO_Landing.svg',
      proofUrl: '/assets/img/samples/website.svg',
      status: 'valid',
      mentorNote: '',
      validatedBy: 'Admin Mentor English Cafe',
      validatedAt: '2026-12-10T08:00:00.000Z',
      createdAt: '2026-12-09T15:20:00.000Z',
      updatedAt: '2026-12-10T08:00:00.000Z'
    },

    // Bobby Maulana
    {
      id: 'rep-bb1',
      internId: 'int-bobby',
      dateIso: '2026-12-10',
      hasilKerja: 'Memperbaiki bug tata letak navbar & sidebar pada viewport tablet 768px',
      kendala: 'Tidak ada',
      proofName: 'Bugfix_Navbar_Tablet.svg',
      proofUrl: '/assets/img/samples/website.svg',
      status: 'valid',
      mentorNote: '',
      validatedBy: 'Admin Mentor English Cafe',
      validatedAt: '2026-12-10T17:10:00.000Z',
      createdAt: '2026-12-10T14:50:00.000Z',
      updatedAt: '2026-12-10T17:10:00.000Z'
    },

    // Nathanael Juan
    {
      id: 'rep-nj1',
      internId: 'int-nathanael',
      dateIso: '2026-12-09',
      hasilKerja: 'Desain banner event Morning Speaking Challenge & editing video reels dokumentasi',
      kendala: 'Rendering video memakan waktu lebih lama',
      proofName: 'Banner_Speaking_Challenge.svg',
      proofUrl: '/assets/img/samples/desain.svg',
      status: 'valid',
      mentorNote: '',
      validatedBy: 'Admin Mentor English Cafe',
      validatedAt: '2026-12-10T09:10:00.000Z',
      createdAt: '2026-12-09T16:40:00.000Z',
      updatedAt: '2026-12-10T09:10:00.000Z'
    },

    // Ahmad Hidayat (Selesai)
    {
      id: 'rep-ah1',
      internId: 'int-ahmad',
      dateIso: '2026-06-30',
      hasilKerja: 'Penyusunan laporan rekonsiliasi keuangan akhir periode magang semester genap',
      kendala: 'Tidak ada',
      proofName: 'Laporan_Akhir_Finance.svg',
      proofUrl: '/assets/img/samples/pelatihan.svg',
      status: 'valid',
      mentorNote: '',
      validatedBy: 'Admin Mentor English Cafe',
      validatedAt: '2026-06-30T17:00:00.000Z',
      createdAt: '2026-06-30T15:30:00.000Z',
      updatedAt: '2026-06-30T17:00:00.000Z'
    },
    {
      id: 'rep-ah2',
      internId: 'int-ahmad',
      dateIso: '2026-06-29',
      hasilKerja: 'Verifikasi bukti kas keluar operasional kegiatan pelatihan cabang Surakarta',
      kendala: 'Tidak ada',
      proofName: 'Verifikasi_Kas_Cabang.svg',
      proofUrl: '/assets/img/samples/rapat.svg',
      status: 'valid',
      mentorNote: '',
      validatedBy: 'Admin Mentor English Cafe',
      validatedAt: '2026-06-29T17:20:00.000Z',
      createdAt: '2026-06-29T16:00:00.000Z',
      updatedAt: '2026-06-29T17:20:00.000Z'
    },

    // Budi Santoso (Selesai)
    {
      id: 'rep-bd1',
      internId: 'int-budi',
      dateIso: '2026-06-30',
      hasilKerja: 'Serah terima arsip administrasi penilaian magang kepada tim HRD English Cafe',
      kendala: 'Tidak ada',
      proofName: 'Serah_Terima_HRD.svg',
      proofUrl: '/assets/img/samples/pelatihan.svg',
      status: 'valid',
      mentorNote: '',
      validatedBy: 'Admin Mentor English Cafe',
      validatedAt: '2026-06-30T16:45:00.000Z',
      createdAt: '2026-06-30T15:10:00.000Z',
      updatedAt: '2026-06-30T16:45:00.000Z'
    }
  ];

  return {
    version: 1,
    admins,
    interns,
    reports
  };
}

let memoryCache = null;

async function kvGet() {
  if (!HAS_KV) return null;
  try {
    const res = await fetch(`${KV_URL.replace(/\/$/, '')}/get/${encodeURIComponent(KV_KEY)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || typeof json.result !== 'string') return null;
    return JSON.parse(json.result);
  } catch {
    return null;
  }
}

async function kvSet(db) {
  if (!HAS_KV) return false;
  try {
    const res = await fetch(`${KV_URL.replace(/\/$/, '')}/set/${encodeURIComponent(KV_KEY)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(JSON.stringify(db))
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function loadDb() {
  ensureDirs();
  if (HAS_KV) {
    const fromKv = await kvGet();
    if (fromKv && Array.isArray(fromKv.interns) && Array.isArray(fromKv.reports)) {
      memoryCache = fromKv;
      return memoryCache;
    }
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.interns) && Array.isArray(parsed.reports)) {
        memoryCache = parsed;
        return memoryCache;
      }
    } catch {
      // Fallback to seed if corrupted
    }
  }

  const seeded = memoryCache || buildSeedDatabase();
  memoryCache = seeded;
  await saveDb(seeded);
  return seeded;
}

async function saveDb(db) {
  ensureDirs();
  memoryCache = db;
  const serialized = JSON.stringify(db, null, 2);
  const tmpPath = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, serialized, 'utf8');
  fs.renameSync(tmpPath, DB_FILE);
  if (HAS_KV) {
    await kvSet(db);
  }
  return db;
}

function saveUploadedImage(originalName, dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') {
    throw new Error('Data gambar tidak valid.');
  }
  const match = dataUrl.match(/^data:(image\/(png|jpeg|jpg|webp|gif|svg\+xml));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) {
    throw new Error('Format file harus berupa gambar PNG, JPG, WEBP, atau SVG yang valid.');
  }
  const mime = match[1].toLowerCase();
  const base64Data = match[3];
  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length > 2.5 * 1024 * 1024) {
    throw new Error('Ukuran gambar melebihi batas maksimal 2,5 MB.');
  }

  const cleanBaseName = String(originalName || 'bukti-kegiatan')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 48);

  // On Vercel without persistent shared disk across instances, return dataUrl directly when reasonable
  // so uploaded images always render seamlessly on every device.
  if (IS_VERCEL) {
    return {
      fileName: cleanBaseName,
      url: dataUrl
    };
  }

  ensureDirs();
  const extMap = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg'
  };
  const ext = extMap[mime] || '.png';
  const storedName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${path.parse(cleanBaseName).name}${ext}`;
  const fullPath = path.join(UPLOADS_DIR, storedName);
  fs.writeFileSync(fullPath, buffer);
  return {
    fileName: cleanBaseName.includes('.') ? cleanBaseName : `${cleanBaseName}${ext}`,
    url: `/uploads/${storedName}`
  };
}

function signSessionToken(payloadObj) {
  const data = {
    ...payloadObj,
    exp: Date.now() + TOKEN_TTL_MS
  };
  const encoded = Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!parsed || !parsed.id || !parsed.role || !parsed.exp || Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function sanitizeIntern(intern, reports = null) {
  const safe = {
    id: intern.id,
    role: 'peserta',
    nama: intern.nama,
    namaPanggilan: intern.namaPanggilan || intern.nama.split(' ')[0] || intern.nama,
    email: intern.email,
    telepon: intern.telepon,
    alamat: intern.alamat,
    universitas: intern.universitas,
    jurusan: intern.jurusan,
    jenis: intern.jenis,
    divisi: intern.divisi,
    tglMulai: intern.tglMulai,
    tglAkhir: intern.tglAkhir,
    periode: formatPeriodeIndo(intern.tglMulai, intern.tglAkhir),
    status: intern.status || 'aktif',
    avatarUrl: intern.avatarUrl || '',
    createdAt: intern.createdAt
  };
  if (Array.isArray(reports)) {
    const own = reports.filter((r) => r.internId === intern.id);
    safe.stats = {
      total: own.length,
      menunggu: own.filter((r) => r.status === 'menunggu').length,
      revisi: own.filter((r) => r.status === 'revisi').length,
      ditolak: own.filter((r) => r.status === 'ditolak').length,
      valid: own.filter((r) => r.status === 'valid').length
    };
  }
  return safe;
}

function sanitizeAdmin(admin, db = null) {
  const safe = {
    id: admin.id,
    role: 'admin',
    username: admin.username,
    email: admin.email,
    nama: admin.nama,
    createdAt: admin.createdAt
  };
  if (db && Array.isArray(db.reports)) {
    safe.pendingTotal = db.reports.filter((r) => r.status === 'menunggu').length;
  }
  return safe;
}

function enrichReport(report) {
  const d = formatDateIndo(report.dateIso);
  return {
    ...report,
    dateMain: d.main,
    dateDay: d.day,
    dateFull: d.full,
    timestamp: d.timestamp
  };
}

module.exports = {
  IS_VERCEL,
  HAS_KV,
  DATA_DIR,
  UPLOADS_DIR,
  hashPassword,
  verifyPassword,
  formatDateIndo,
  formatPeriodeIndo,
  loadDb,
  saveDb,
  saveUploadedImage,
  signSessionToken,
  verifySessionToken,
  sanitizeIntern,
  sanitizeAdmin,
  enrichReport
};
