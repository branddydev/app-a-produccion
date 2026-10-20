/* Servidor de producción de una SPA (Vite) sin dependencias. Va en apps/web/server.mjs.
   Arranque: NODE_ENV=production PORT=8080 API_INTERNAL_URL=http://api.railway.internal:3001 node apps/web/server.mjs
   - Sirve dist/ con fallback a index.html (SPA).
   - Reenvía /api y /mcp a la API por la red privada de Railway (API_INTERNAL_URL),
     así la app vive en un solo dominio: cookies de primera parte y sin CORS. */
import { createReadStream, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 8080);
const API = new URL(process.env.API_INTERNAL_URL ?? 'http://localhost:3001');
const DIST = resolve(fileURLToPath(new URL('./dist', import.meta.url)));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

function proxy(req, res) {
  const send = API.protocol === 'https:' ? httpsRequest : httpRequest;
  const headers = { ...req.headers, host: API.host, 'x-forwarded-host': req.headers.host ?? '', 'x-forwarded-proto': req.headers['x-forwarded-proto'] ?? 'https' };
  const upstream = send({ protocol: API.protocol, hostname: API.hostname, port: API.port, method: req.method, path: req.url, headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res); // en streaming: el MCP usa SSE
  });
  upstream.on('error', (err) => {
    console.error(`[proxy] ${req.method} ${req.url}: ${err.message}`);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: 'La API no responde' }));
  });
  req.pipe(upstream);
}

function file(path) {
  try { const s = statSync(path); return s.isFile() ? s : null; } catch { return null; }
}

function serveStatic(req, res) {
  const url = new URL(req.url ?? '/', 'http://x');
  const safe = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let path = join(DIST, safe);
  if (!path.startsWith(DIST)) { res.writeHead(400).end(); return; }
  let stat = file(path);
  if (!stat) { path = join(DIST, 'index.html'); stat = file(path); } // SPA
  if (!stat) { res.writeHead(500).end('Falta el build (dist/)'); return; }
  const isHtml = path.endsWith('.html') || path.endsWith('sw.js') || path.includes('workbox-');
  res.writeHead(200, {
    'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
    'content-length': stat.size,
    // Los assets llevan hash: caché larga. El HTML y el service worker, nunca.
    'cache-control': isHtml ? 'no-cache' : 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(path).pipe(res);
}

createServer((req, res) => {
  const p = req.url ?? '/';
  if (p === '/api' || p.startsWith('/api/') || p === '/mcp' || p.startsWith('/mcp/') || p.startsWith('/mcp?')) return proxy(req, res);
  if (p === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }).end('ok'); return; }
  serveStatic(req, res);
}).listen(PORT, '::', () => console.log(`Web en :${PORT} · API → ${API.origin}`));
