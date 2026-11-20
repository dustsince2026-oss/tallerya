'use strict';
// TallerYa — servidor local y entrypoint en Vercel.
// Uso: npm install && npm run dev  →  http://localhost:3000
// En local usa data/db.json (no compartido, solo pruebas).
// En Vercel usa Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
//
// IMPORTANTE (lección de OnlyClick): en producción Vercel despliega este
// archivo como UN solo servidor y ES el entrypoint. Todas las rutas
// /api/* se atienden aquí con dispatch() de api/_lib/handlers.js.
// NO crear wrappers api/*.js esperando que se ejecuten: en vivo no corren.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { dispatch } = require('./api/_lib/handlers');
const { tokenFromReq } = require('./api/_lib/auth');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.webp': 'image/webp',
};

// URL pública /api/<nombre> → ruta interna de dispatch()
const ROUTES = {
  'auth-register': 'register',
  'auth-login': 'login',
  'auth-status': 'auth-status',
  'driver-profile': 'get-driver-profile',
  'driver-profile-save': 'save-driver-profile',
  'search': 'search',
  'shop-get': 'get-shop',
  'focos': 'list-focos',
  'focos-diagnostico': 'diagnostico-focos',
  'notify': 'notify',
  'panel': 'get-panel',
  'panel-services': 'set-services',
  'panel-offer-create': 'create-offer',
  'panel-offer-toggle': 'set-offer-active',
  'panel-profile': 'update-workshop-profile',
  'panel-pause': 'set-paused',
  'notifications': 'list-notifications',
  'notifications-read': 'mark-notifications-read',
  'track-event': 'track-event',
  'workshop-approve': 'approve-workshop',
  'invite-code-create': 'invite-code-create',
  'invite-codes-list': 'invite-codes-list',
  'invite-code-deactivate': 'invite-code-deactivate',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 4 * 1024 * 1024) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const query = Object.fromEntries(url.searchParams.entries());

    // Foto adjunta a una solicitud: solo la ven el conductor que la mandó
    // o el taller que la recibió (lo verifica fotoFile en handlers.js).
    if (url.pathname === '/api/foto') {
      const result = await dispatch('foto-file', { body: {}, query, token: tokenFromReq({ ...req, query, headers: req.headers }) });
      res.writeHead(200, {
        'Content-Type': result.file.mimeType,
        'Content-Disposition': 'inline',
        'Content-Length': result.file.bytes.length,
        'Cache-Control': 'private, max-age=0, no-store',
      });
      return res.end(result.file.bytes);
    }

    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5).replace(/\/$/, '');
      const route = ROUTES[name];
      if (!route) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Ruta no encontrada.' })); }
      const body = req.method === 'POST' ? await readBody(req) : {};
      const result = await dispatch(route, { body, query, token: tokenFromReq({ ...req, body, query, headers: req.headers }) });
      res.writeHead(result.status || 200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result.data));
    }

    // Archivos estáticos (la app: index.html + app.js + logo)
    let file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    file = path.join(PUBLIC, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    res.writeHead(e.status || 500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message || 'Error del servidor.' }));
  }
});

server.listen(PORT, () => console.log(`TallerYa local en http://localhost:${PORT}`));
