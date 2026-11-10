'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { URL } = require('node:url');
const { handleApi } = require('./backend/handler');

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT) || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function serveStaticFile(res, pathname) {
  let cleanPath = decodeURIComponent(pathname.split('?')[0]);
  if (cleanPath === '/' || cleanPath === '') {
    cleanPath = '/index.html';
  }

  const resolvedPath = path.normalize(path.join(ROOT_DIR, cleanPath));
  // Protect against path traversal and keep backend/data files private
  if (
    !resolvedPath.startsWith(ROOT_DIR) ||
    resolvedPath.includes(`${path.sep}backend${path.sep}`) ||
    resolvedPath.includes(`${path.sep}data${path.sep}`) ||
    path.basename(resolvedPath) === 'server.js'
  ) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  if (!fs.existsSync(resolvedPath) || fs.statSync(resolvedPath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
  });
  fs.createReadStream(resolvedPath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  if (reqUrl.pathname.startsWith('/api/') || reqUrl.pathname.startsWith('/uploads/')) {
    return handleApi(req, res);
  }
  return serveStaticFile(res, reqUrl.pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const lanIps = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) lanIps.push(net.address);
    }
  }
  console.log('===============================================================');
  console.log('  ENGLISH CAFE DAILYREPORT - FULL-STACK SYSTEM ACTIVE');
  console.log('===============================================================');
  console.log(`  Lokal   : http://localhost:${PORT}`);
  if (lanIps.length > 0) {
    console.log(`  Jaringan: http://${lanIps[0]}:${PORT}  (bisa dibuka dari HP/perangkat lain di Wi-Fi sama)`);
  }
  console.log('  Akun Peserta Default : angeline@gmail.com | 089637491877 | password123');
  console.log('  Akun Mentor Default  : admin | admin123');
  console.log('===============================================================');
});
