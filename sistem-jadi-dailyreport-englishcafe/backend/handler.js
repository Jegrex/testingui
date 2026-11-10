'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const store = require('./store');

const MAX_BODY_BYTES = 4 * 1024 * 1024; // 4 MB

function getCorsHeaders(req) {
  const origin = req && req.headers ? req.headers.origin : '';
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin'
  };
  if (origin && origin !== 'null') {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  } else {
    headers['Access-Control-Allow-Origin'] = '*';
  }
  return headers;
}

function sendJson(res, statusCode, data, extraHeaders = {}) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    ...(res.__ecCorsHeaders || {}),
    ...extraHeaders
  });
  res.end(payload);
}

function parseCookies(req) {
  const header = (req && req.headers && req.headers.cookie) || '';
  const result = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    if (key) result[key] = val;
  });
  return result;
}

function buildCookieHeader(name, value, maxAgeSeconds, isHttps = false) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (typeof maxAgeSeconds === 'number') {
    parts.push(`Max-Age=${maxAgeSeconds}`);
  }
  if (isHttps) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Ukuran permintaan terlalu besar (maks. 4 MB).'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        const str = Buffer.concat(chunks).toString('utf8');
        resolve(str ? JSON.parse(str) : {});
      } catch {
        reject(Object.assign(new Error('Format JSON tidak valid.'), { statusCode: 400 }));
      }
    });
    req.on('error', (err) => reject(err));
  });
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '').trim();
  if (digits.startsWith('+62')) return `0${digits.slice(3)}`;
  if (digits.startsWith('62') && digits.length >= 10) return `0${digits.slice(2)}`;
  return digits.replace(/[^\d]/g, '');
}

function extractAuthToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    const tok = auth.slice(7).trim();
    if (tok) return tok;
  }
  const cookies = parseCookies(req);
  return cookies.ec_sid || '';
}

function resolveCurrentUser(req, db) {
  const token = extractAuthToken(req);
  if (!token) return null;
  const decoded = store.verifySessionToken(token);
  if (!decoded) return null;
  if (decoded.role === 'admin') {
    const admin = db.admins.find((a) => a.id === decoded.id);
    if (!admin) return null;
    return { role: 'admin', record: admin };
  }
  if (decoded.role === 'peserta') {
    const intern = db.interns.find((i) => i.id === decoded.id);
    if (!intern) return null;
    return { role: 'peserta', record: intern };
  }
  return null;
}

function handleUploadServe(res, fileNameParam) {
  const safeName = path.basename(decodeURIComponent(fileNameParam || ''));
  if (!safeName || safeName === '.' || safeName === '..') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const targetPath = path.join(store.UPLOADS_DIR, safeName);
  if (!fs.existsSync(targetPath)) {
    res.writeHead(404);
    res.end('Image not found');
    return;
  }
  const ext = path.extname(safeName).toLowerCase();
  const mimeMap = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
  };
  res.writeHead(200, {
    'Content-Type': mimeMap[ext] || 'application/octet-stream',
    'Cache-Control': 'public, max-age=86400',
    ...(res.__ecCorsHeaders || {})
  });
  fs.createReadStream(targetPath).pipe(res);
}

async function handleApi(req, res) {
  const reqUrl = new URL(req.url, 'http://localhost');
  const rawRoute = reqUrl.searchParams.get('__ec_path') || reqUrl.pathname;
  const pathname = rawRoute.replace(/\/{2,}/g, '/');
  const method = (req.method || 'GET').toUpperCase();

  res.__ecCorsHeaders = getCorsHeaders(req);
  const isHttps = Boolean(
    process.env.VERCEL ||
    (req.headers && req.headers['x-forwarded-proto'] === 'https') ||
    (req.socket && req.socket.encrypted)
  );
  res.__ecIsHttps = isHttps;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      ...res.__ecCorsHeaders,
      'Content-Length': '0'
    });
    res.end();
    return;
  }

  // Serve /uploads/*
  if (pathname.startsWith('/uploads/') && method === 'GET') {
    return handleUploadServe(res, pathname.slice('/uploads/'.length));
  }

  try {
    // Health check
    if (pathname === '/api/health' && method === 'GET') {
      const db = await store.loadDb();
      return sendJson(res, 200, {
        ok: true,
        runtime: store.IS_VERCEL ? 'vercel-serverless' : 'node-local',
        persistence: store.HAS_KV ? 'redis-kv' : (store.IS_VERCEL ? 'ephemeral-tmp' : 'local-json'),
        internCount: db.interns.length,
        reportCount: db.reports.length
      });
    }

    // ------------------------------------------------------------------
    // AUTH: REGISTER PESERTA
    // ------------------------------------------------------------------
    if (pathname === '/api/auth/register-peserta' && method === 'POST') {
      const body = await readJsonBody(req);
      const nama = String(body.nama || body.nama_lengkap || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const telepon = normalizePhone(body.telepon || body.no_telepon);
      const alamat = String(body.alamat || '').trim();
      const universitas = String(body.universitas || body.asal_instansi || '').trim();
      const jurusan = String(body.jurusan || '').trim();
      const tglMulai = String(body.tglMulai || body.tgl_mulai || '').trim();
      const tglAkhir = String(body.tglAkhir || body.tgl_akhir || '').trim();
      const jenis = String(body.jenis || body.jenis_magang || '').trim();
      const divisi = String(body.divisi || '').trim();
      const password = String(body.password || '');
      const passwordConfirm = String(body.passwordConfirm || body.password_confirm || password);

      if (nama.length < 3) return sendJson(res, 400, { ok: false, message: 'Nama lengkap minimal 3 karakter.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return sendJson(res, 400, { ok: false, message: 'Format email tidak valid.' });
      }
      if (!/^\d{10,15}$/.test(telepon)) {
        return sendJson(res, 400, { ok: false, message: 'Nomor telepon harus terdiri dari 10–15 digit angka.' });
      }
      if (alamat.length < 5) return sendJson(res, 400, { ok: false, message: 'Alamat domisili minimal 5 karakter.' });
      if (universitas.length < 3) return sendJson(res, 400, { ok: false, message: 'Asal instansi / kampus wajib diisi.' });
      if (jurusan.length < 2) return sendJson(res, 400, { ok: false, message: 'Jurusan / program studi wajib diisi.' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tglMulai) || !/^\d{4}-\d{2}-\d{2}$/.test(tglAkhir)) {
        return sendJson(res, 400, { ok: false, message: 'Periode tanggal mulai & berakhir wajib diisi lengkap.' });
      }
      if (tglAkhir < tglMulai) {
        return sendJson(res, 400, { ok: false, message: 'Tanggal berakhir magang tidak boleh lebih awal dari tanggal mulai.' });
      }
      if (!jenis) return sendJson(res, 400, { ok: false, message: 'Pilih jenis magang terlebih dahulu.' });
      if (!divisi) return sendJson(res, 400, { ok: false, message: 'Pilih divisi penempatan terlebih dahulu.' });
      if (password.length < 6) return sendJson(res, 400, { ok: false, message: 'Password minimal 6 karakter.' });
      if (password !== passwordConfirm) {
        return sendJson(res, 400, { ok: false, message: 'Konfirmasi password tidak cocok.' });
      }

      const db = await store.loadDb();
      if (db.interns.some((i) => i.email.toLowerCase() === email)) {
        return sendJson(res, 409, { ok: false, message: 'Email tersebut sudah terdaftar. Silakan masuk atau gunakan email lain.' });
      }

      const newIntern = {
        id: `int-${crypto.randomBytes(4).toString('hex')}`,
        nama,
        namaPanggilan: nama.split(' ')[0] || nama,
        email,
        telepon,
        alamat,
        universitas,
        jurusan,
        jenis,
        divisi,
        tglMulai,
        tglAkhir,
        status: 'aktif',
        avatarUrl: '',
        passwordHash: store.hashPassword(password),
        createdAt: new Date().toISOString()
      };

      db.interns.unshift(newIntern);
      await store.saveDb(db);

      return sendJson(res, 201, {
        ok: true,
        message: 'Pendaftaran peserta berhasil! Silakan masuk menggunakan akun Anda.',
        user: store.sanitizeIntern(newIntern, db.reports)
      });
    }

    // ------------------------------------------------------------------
    // AUTH: LOGIN PESERTA
    // ------------------------------------------------------------------
    if (pathname === '/api/auth/login-peserta' && method === 'POST') {
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const telepon = normalizePhone(body.telepon || body.no_telepon);
      const password = String(body.password || '');

      if (!email || !telepon || !password) {
        return sendJson(res, 400, { ok: false, message: 'Email, nomor telepon, dan password wajib diisi.' });
      }

      const db = await store.loadDb();
      const intern = db.interns.find((i) => i.email.toLowerCase() === email);
      if (!intern || normalizePhone(intern.telepon) !== telepon || !store.verifyPassword(password, intern.passwordHash)) {
        return sendJson(res, 401, {
          ok: false,
          message: 'Kombinasi email, nomor telepon, atau password peserta tidak sesuai.'
        });
      }

      const token = store.signSessionToken({ id: intern.id, role: 'peserta' });
      return sendJson(
        res,
        200,
        {
          ok: true,
          message: `Selamat datang kembali, ${intern.nama}!`,
          token,
          user: store.sanitizeIntern(intern, db.reports)
        },
        { 'Set-Cookie': buildCookieHeader('ec_sid', token, 60 * 60 * 24 * 7, isHttps) }
      );
    }

    // ------------------------------------------------------------------
    // AUTH: LOGIN ADMIN / MENTOR
    // ------------------------------------------------------------------
    if (pathname === '/api/auth/login-admin' && method === 'POST') {
      const body = await readJsonBody(req);
      const identifier = String(body.username || body.email || '').trim().toLowerCase();
      const password = String(body.password || '');

      if (!identifier || !password) {
        return sendJson(res, 400, { ok: false, message: 'Username dan password wajib diisi.' });
      }

      const db = await store.loadDb();
      const admin = db.admins.find(
        (a) => a.username.toLowerCase() === identifier || a.email.toLowerCase() === identifier
      );
      if (!admin || !store.verifyPassword(password, admin.passwordHash)) {
        return sendJson(res, 401, {
          ok: false,
          message: 'Username atau password Admin / Mentor tidak sesuai.'
        });
      }

      const token = store.signSessionToken({ id: admin.id, role: 'admin' });
      return sendJson(
        res,
        200,
        {
          ok: true,
          message: `Login berhasil sebagai ${admin.nama}.`,
          token,
          user: store.sanitizeAdmin(admin, db)
        },
        { 'Set-Cookie': buildCookieHeader('ec_sid', token, 60 * 60 * 24 * 7, isHttps) }
      );
    }

    // ------------------------------------------------------------------
    // AUTH: LOGOUT & ME
    // ------------------------------------------------------------------
    if (pathname === '/api/auth/logout' && method === 'POST') {
      return sendJson(
        res,
        200,
        { ok: true, message: 'Berhasil keluar dari sistem.' },
        { 'Set-Cookie': buildCookieHeader('ec_sid', '', 0, isHttps) }
      );
    }

    const db = await store.loadDb();
    const session = resolveCurrentUser(req, db);

    if (pathname === '/api/auth/me' && method === 'GET') {
      if (!session) {
        return sendJson(res, 401, { ok: false, message: 'Sesi belum login atau telah berakhir.' });
      }
      const user = session.role === 'admin'
        ? store.sanitizeAdmin(session.record, db)
        : store.sanitizeIntern(session.record, db.reports);
      return sendJson(res, 200, { ok: true, user });
    }

    // Require login for all endpoints below
    if (!session) {
      return sendJson(res, 401, { ok: false, message: 'Akses ditolak. Silakan login terlebih dahulu.' });
    }

    // ------------------------------------------------------------------
    // PESERTA PROFILE ENDPOINTS
    // ------------------------------------------------------------------
    if (pathname === '/api/me' && method === 'PUT') {
      if (session.role !== 'peserta') {
        return sendJson(res, 403, { ok: false, message: 'Hanya akun peserta yang dapat mengubah profil peserta.' });
      }
      const body = await readJsonBody(req);
      const intern = session.record;
      const email = body.email !== undefined ? String(body.email).trim().toLowerCase() : intern.email;
      const telepon = body.telepon !== undefined ? normalizePhone(body.telepon) : intern.telepon;
      const nama = body.nama !== undefined ? String(body.nama).trim() : intern.nama;
      const alamat = body.alamat !== undefined ? String(body.alamat).trim() : intern.alamat;
      const universitas = body.universitas !== undefined ? String(body.universitas).trim() : intern.universitas;
      const jurusan = body.jurusan !== undefined ? String(body.jurusan).trim() : intern.jurusan;
      const jenis = body.jenis !== undefined ? String(body.jenis).trim() : intern.jenis;
      const divisi = body.divisi !== undefined ? String(body.divisi).trim() : intern.divisi;
      const tglMulai = body.tglMulai !== undefined ? String(body.tglMulai).trim() : intern.tglMulai;
      const tglAkhir = body.tglAkhir !== undefined ? String(body.tglAkhir).trim() : intern.tglAkhir;

      if (nama.length < 3) return sendJson(res, 400, { ok: false, message: 'Nama lengkap minimal 3 karakter.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { ok: false, message: 'Format email tidak valid.' });
      if (!/^\d{10,15}$/.test(telepon)) return sendJson(res, 400, { ok: false, message: 'Nomor telepon harus 10–15 digit angka.' });
      if (db.interns.some((i) => i.id !== intern.id && i.email.toLowerCase() === email)) {
        return sendJson(res, 409, { ok: false, message: 'Email tersebut sudah digunakan peserta lain.' });
      }

      intern.nama = nama;
      intern.namaPanggilan = nama.split(' ')[0] || nama;
      intern.email = email;
      intern.telepon = telepon;
      intern.alamat = alamat;
      intern.universitas = universitas;
      intern.jurusan = jurusan;
      intern.jenis = jenis || intern.jenis;
      intern.divisi = divisi || intern.divisi;
      if (/^\d{4}-\d{2}-\d{2}$/.test(tglMulai)) intern.tglMulai = tglMulai;
      if (/^\d{4}-\d{2}-\d{2}$/.test(tglAkhir) && tglAkhir >= intern.tglMulai) intern.tglAkhir = tglAkhir;

      await store.saveDb(db);
      return sendJson(res, 200, {
        ok: true,
        message: 'Perubahan profil berhasil disimpan.',
        user: store.sanitizeIntern(intern, db.reports)
      });
    }

    if (pathname === '/api/me/password' && method === 'PUT') {
      const body = await readJsonBody(req);
      const oldPassword = String(body.oldPassword || body.old_password || '');
      const newPassword = String(body.newPassword || body.new_password || '');
      const confirmPassword = String(body.confirmPassword || body.confirm_password || '');

      if (!oldPassword || !newPassword || !confirmPassword) {
        return sendJson(res, 400, { ok: false, message: 'Semua kolom password wajib diisi.' });
      }
      if (!store.verifyPassword(oldPassword, session.record.passwordHash)) {
        return sendJson(res, 400, { ok: false, message: 'Password lama Anda tidak sesuai.' });
      }
      if (newPassword.length < 6) {
        return sendJson(res, 400, { ok: false, message: 'Password baru minimal 6 karakter.' });
      }
      if (newPassword !== confirmPassword) {
        return sendJson(res, 400, { ok: false, message: 'Konfirmasi password baru tidak cocok.' });
      }
      session.record.passwordHash = store.hashPassword(newPassword);
      await store.saveDb(db);
      return sendJson(res, 200, { ok: true, message: 'Password akun berhasil diperbarui.' });
    }

    if (pathname === '/api/me/avatar' && method === 'POST') {
      if (session.role !== 'peserta') {
        return sendJson(res, 403, { ok: false, message: 'Khusus akun peserta.' });
      }
      const body = await readJsonBody(req);
      const saved = store.saveUploadedImage(body.fileName || 'avatar.jpg', body.dataUrl);
      session.record.avatarUrl = saved.url;
      await store.saveDb(db);
      return sendJson(res, 200, {
        ok: true,
        message: 'Foto profil berhasil diperbarui.',
        avatarUrl: saved.url,
        user: store.sanitizeIntern(session.record, db.reports)
      });
    }

    // ------------------------------------------------------------------
    // REPORTS ENDPOINTS (PESERTA & ADMIN)
    // ------------------------------------------------------------------
    if (pathname === '/api/reports' && method === 'GET') {
      const targetInternId = session.role === 'admin'
        ? (reqUrl.searchParams.get('internId') || db.interns[0]?.id || '')
        : session.record.id;

      const list = db.reports
        .filter((r) => r.internId === targetInternId)
        .sort((a, b) => (b.dateIso.localeCompare(a.dateIso) || b.createdAt.localeCompare(a.createdAt)))
        .map(store.enrichReport);

      const internObj = db.interns.find((i) => i.id === targetInternId);
      return sendJson(res, 200, {
        ok: true,
        intern: internObj ? store.sanitizeIntern(internObj, db.reports) : null,
        reports: list
      });
    }

    if (pathname === '/api/reports' && method === 'POST') {
      if (session.role !== 'peserta') {
        return sendJson(res, 403, { ok: false, message: 'Hanya peserta yang dapat mengirim laporan harian.' });
      }
      const body = await readJsonBody(req);
      const dateIso = String(body.dateIso || body.tgl_laporan || '').trim();
      const hasilKerja = String(body.hasilKerja || body.hasil_kerja || '').trim();
      const kendala = String(body.kendala || body.kendala_kerja || '').trim() || 'Tidak ada';

      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
        return sendJson(res, 400, { ok: false, message: 'Tanggal laporan wajib diisi dengan format yang benar.' });
      }
      if (hasilKerja.length < 10) {
        return sendJson(res, 400, { ok: false, message: 'Deskripsi hasil kerja minimal 10 karakter.' });
      }
      if (!body.proofDataUrl) {
        return sendJson(res, 400, { ok: false, message: 'Foto bukti pekerjaan wajib dilampirkan.' });
      }

      const uploaded = store.saveUploadedImage(body.proofName || 'bukti-laporan.jpg', body.proofDataUrl);
      const now = new Date().toISOString();
      const newReport = {
        id: `rep-${crypto.randomBytes(4).toString('hex')}`,
        internId: session.record.id,
        dateIso,
        hasilKerja,
        kendala,
        proofName: uploaded.fileName,
        proofUrl: uploaded.url,
        status: 'menunggu',
        mentorNote: '',
        validatedBy: '',
        validatedAt: '',
        createdAt: now,
        updatedAt: now
      };

      db.reports.unshift(newReport);
      await store.saveDb(db);
      return sendJson(res, 201, {
        ok: true,
        message: 'Laporan harian berhasil dikirim dan menunggu validasi Mentor.',
        report: store.enrichReport(newReport)
      });
    }

    // Match /api/reports/:id
    const reportMatch = pathname.match(/^\/api\/reports\/([^/]+)$/);
    if (reportMatch) {
      const reportId = decodeURIComponent(reportMatch[1]);
      const report = db.reports.find((r) => r.id === reportId);
      if (!report) {
        return sendJson(res, 404, { ok: false, message: 'Laporan tidak ditemukan.' });
      }

      if (method === 'GET') {
        if (session.role === 'peserta' && report.internId !== session.record.id) {
          return sendJson(res, 403, { ok: false, message: 'Anda tidak berhak mengakses laporan peserta lain.' });
        }
        return sendJson(res, 200, { ok: true, report: store.enrichReport(report) });
      }

      if (method === 'PUT') {
        if (session.role !== 'peserta' || report.internId !== session.record.id) {
          return sendJson(res, 403, { ok: false, message: 'Hanya pemilik laporan yang dapat mengubah laporan ini.' });
        }
        const body = await readJsonBody(req);
        const dateIso = String(body.dateIso || report.dateIso).trim();
        const hasilKerja = String(body.hasilKerja ?? report.hasilKerja).trim();
        const kendala = String(body.kendala ?? report.kendala).trim() || 'Tidak ada';

        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
          return sendJson(res, 400, { ok: false, message: 'Tanggal laporan wajib diisi.' });
        }
        if (hasilKerja.length < 10) {
          return sendJson(res, 400, { ok: false, message: 'Hasil kerja minimal 10 karakter.' });
        }

        if (body.proofDataUrl) {
          const uploaded = store.saveUploadedImage(body.proofName || 'perbaikan-bukti.jpg', body.proofDataUrl);
          report.proofName = uploaded.fileName;
          report.proofUrl = uploaded.url;
        } else if (body.removeProof) {
          return sendJson(res, 400, { ok: false, message: 'Laporan wajib memiliki bukti dokumentasi foto.' });
        }

        const wasReturned = report.status === 'revisi' || report.status === 'ditolak';
        report.dateIso = dateIso;
        report.hasilKerja = hasilKerja;
        report.kendala = kendala;
        if (wasReturned || report.status === 'menunggu') {
          report.status = 'menunggu';
          report.mentorNote = '';
        }
        report.updatedAt = new Date().toISOString();

        await store.saveDb(db);
        return sendJson(res, 200, {
          ok: true,
          message: wasReturned
            ? 'Perbaikan laporan berhasil dikirim ulang dan siap divalidasi kembali oleh Mentor.'
            : 'Perubahan laporan harian berhasil disimpan.',
          report: store.enrichReport(report)
        });
      }

      if (method === 'DELETE') {
        if (session.role === 'peserta' && report.internId !== session.record.id) {
          return sendJson(res, 403, { ok: false, message: 'Anda tidak berhak menghapus laporan ini.' });
        }
        db.reports = db.reports.filter((r) => r.id !== reportId);
        await store.saveDb(db);
        return sendJson(res, 200, { ok: true, message: 'Laporan harian berhasil dihapus permanen.' });
      }
    }

    // ------------------------------------------------------------------
    // ADMIN / MENTOR ENDPOINTS
    // ------------------------------------------------------------------
    if (session.role !== 'admin') {
      return sendJson(res, 403, { ok: false, message: 'Endpoint khusus Mentor / Admin.' });
    }

    if (pathname === '/api/admin/interns' && method === 'GET') {
      const list = db.interns.map((intern) => store.sanitizeIntern(intern, db.reports));
      const pendingTotal = db.reports.filter((r) => r.status === 'menunggu').length;
      return sendJson(res, 200, {
        ok: true,
        pendingTotal,
        interns: list
      });
    }

    const internDetailMatch = pathname.match(/^\/api\/admin\/interns\/([^/]+)$/);
    if (internDetailMatch) {
      const internId = decodeURIComponent(internDetailMatch[1]);
      const intern = db.interns.find((i) => i.id === internId);
      if (!intern) return sendJson(res, 404, { ok: false, message: 'Data peserta magang tidak ditemukan.' });

      if (method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          intern: store.sanitizeIntern(intern, db.reports)
        });
      }

      if (method === 'DELETE') {
        db.interns = db.interns.filter((i) => i.id !== internId);
        db.reports = db.reports.filter((r) => r.internId !== internId);
        await store.saveDb(db);
        return sendJson(res, 200, {
          ok: true,
          message: `Data peserta ${intern.nama} beserta riwayat laporannya berhasil dihapus.`
        });
      }
    }

    const internStatusMatch = pathname.match(/^\/api\/admin\/interns\/([^/]+)\/status$/);
    if (internStatusMatch && method === 'PATCH') {
      const internId = decodeURIComponent(internStatusMatch[1]);
      const intern = db.interns.find((i) => i.id === internId);
      if (!intern) return sendJson(res, 404, { ok: false, message: 'Peserta tidak ditemukan.' });

      const body = await readJsonBody(req);
      const nextStatus = body.status === 'selesai' ? 'selesai' : 'aktif';
      intern.status = nextStatus;
      await store.saveDb(db);

      return sendJson(res, 200, {
        ok: true,
        message: `Status magang ${intern.nama} diperbarui menjadi ${nextStatus === 'selesai' ? 'Selesai' : 'Aktif'}.`,
        intern: store.sanitizeIntern(intern, db.reports)
      });
    }

    const approveAllMatch = pathname.match(/^\/api\/admin\/interns\/([^/]+)\/approve-all-pending$/);
    if (approveAllMatch && method === 'POST') {
      const internId = decodeURIComponent(approveAllMatch[1]);
      const intern = db.interns.find((i) => i.id === internId);
      if (!intern) return sendJson(res, 404, { ok: false, message: 'Peserta tidak ditemukan.' });

      const now = new Date().toISOString();
      let updatedCount = 0;
      db.reports.forEach((r) => {
        if (r.internId === internId && r.status === 'menunggu') {
          r.status = 'valid';
          r.mentorNote = '';
          r.validatedBy = session.record.nama;
          r.validatedAt = now;
          r.updatedAt = now;
          updatedCount += 1;
        }
      });

      await store.saveDb(db);
      return sendJson(res, 200, {
        ok: true,
        updatedCount,
        message: updatedCount > 0
          ? `${updatedCount} laporan berstatus Menunggu untuk ${intern.nama} berhasil disetujui.`
          : 'Tidak ada laporan berstatus Menunggu yang perlu disetujui.'
      });
    }

    const validateMatch = pathname.match(/^\/api\/admin\/reports\/([^/]+)\/validate$/);
    if (validateMatch && method === 'PATCH') {
      const reportId = decodeURIComponent(validateMatch[1]);
      const report = db.reports.find((r) => r.id === reportId);
      if (!report) return sendJson(res, 404, { ok: false, message: 'Laporan tidak ditemukan.' });

      const body = await readJsonBody(req);
      const status = String(body.status || '').trim();
      const mentorNote = String(body.mentorNote || '').trim();

      if (!['valid', 'revisi', 'ditolak', 'menunggu'].includes(status)) {
        return sendJson(res, 400, { ok: false, message: 'Keputusan status validasi tidak valid.' });
      }
      if ((status === 'revisi' || status === 'ditolak') && mentorNote.length < 5) {
        return sendJson(res, 400, {
          ok: false,
          message: 'Mohon isi catatan arahan atau alasan minimal 5 karakter agar peserta tahu bagian yang harus diperbaiki.'
        });
      }

      const now = new Date().toISOString();
      report.status = status;
      report.mentorNote = (status === 'revisi' || status === 'ditolak') ? mentorNote : '';
      report.validatedBy = status === 'menunggu' ? '' : session.record.nama;
      report.validatedAt = status === 'menunggu' ? '' : now;
      report.updatedAt = now;

      await store.saveDb(db);

      const labelMap = {
        valid: 'disetujui (Valid)',
        revisi: 'dikembalikan untuk Revisi',
        ditolak: 'Ditolak',
        menunggu: 'direset ke Menunggu Validasi'
      };
      return sendJson(res, 200, {
        ok: true,
        message: `Laporan tanggal ${store.formatDateIndo(report.dateIso).main} berhasil ${labelMap[status]}.`,
        report: store.enrichReport(report)
      });
    }

    return sendJson(res, 404, { ok: false, message: 'Endpoint API tidak ditemukan.' });
  } catch (err) {
    const statusCode = err && err.statusCode ? err.statusCode : 500;
    return sendJson(res, statusCode, {
      ok: false,
      message: err && err.message ? err.message : 'Terjadi kesalahan pada server.'
    });
  }
}

module.exports = { handleApi };
