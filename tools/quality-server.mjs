import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, history, collect, localDay, seedHistory } from './quality-data.mjs';

export function createQualityServer(options = {}) {
  const readHistory = options.history || history, crawl = options.collect || collect;
  const day = options.localDay || localDay;
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const webRoot = options.webRoot || path.join(root, 'webapp');
  const configuredOrigin = options.publicOrigin ?? process.env.PUBLIC_ORIGIN ?? process.env.RENDER_EXTERNAL_URL;
  const publicOrigin = configuredOrigin ? new URL(configuredOrigin).origin : '';
  const cooldownMs = options.cooldownMs ?? 60000;
  let lastError = '', lastAttempt = 0, refreshPromise = null;

  function send(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  }
  async function refresh() {
    if (refreshPromise) return refreshPromise;
    lastAttempt = Date.now();
    refreshPromise = Promise.resolve().then(crawl).then(result => { lastError = ''; return result; }).catch(error => { lastError = error.message; throw error; }).finally(() => { refreshPromise = null; });
    return refreshPromise;
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/healthz' && req.method === 'GET') return send(res, 200, { status: 'ok' });
      if (url.pathname === '/api/history' && req.method === 'GET') return send(res, 200, { snapshots: await readHistory(), lastError, today: day() });
      if (url.pathname === '/api/collect' && req.method === 'POST') {
        const allowed = production ? [publicOrigin].filter(Boolean) : [publicOrigin, 'http://localhost:' + server.address().port, 'http://127.0.0.1:' + server.address().port].filter(Boolean);
        if (req.headers.origin && !allowed.includes(req.headers.origin)) return send(res, 403, { error: 'Origin không hợp lệ' });
        if (!refreshPromise && Date.now() - lastAttempt < cooldownMs) {
          const seconds = Math.ceil((cooldownMs - (Date.now() - lastAttempt)) / 1000);
          res.setHeader('Retry-After', seconds);
          return send(res, 429, { error: `Vừa cập nhật số liệu. Vui lòng chờ ${seconds} giây rồi thử lại.` });
        }
        await refresh();
        return send(res, 200, { snapshots: await readHistory(), today: day() });
      }
      if (req.method !== 'GET') return send(res, 405, { error: 'Phương thức không hợp lệ' });
      if (url.pathname === '/data/quality-history.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(`window.QUALITY_HISTORY = ${JSON.stringify(await readHistory())};\n`);
      }
      const filename = path.resolve(webRoot, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!filename.startsWith(webRoot + path.sep)) return send(res, 403, { error: 'Không được truy cập' });
      const content = await fs.readFile(filename);
      res.writeHead(200, { 'Content-Type': (({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' })[path.extname(filename)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(content);
    } catch (error) { send(res, error.code === 'ENOENT' ? 404 : 502, { error: error.message }); }
  });
  server.requestTimeout = 180000;
  async function refreshIfMissing() {
    try {
      const snapshots = await readHistory();
      if (!snapshots.some(s => s.day === day())) await refresh();
    } catch (error) { console.error('Collection failed:', error.message); }
  }
  return { server, refreshIfMissing };
}

async function main() {
  await seedHistory();
  const production = process.env.NODE_ENV === 'production';
  const host = process.env.HOST || (production || process.env.PORT ? '0.0.0.0' : '127.0.0.1');
  const fixedPort = process.env.PORT || process.env.QUALITY_PORT;
  let port = Number(fixedPort || 8766);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const { server, refreshIfMissing } = createQualityServer({ production });
  server.on('error', error => {
    if (!fixedPort && error.code === 'EADDRINUSE' && port < 8790) server.listen(++port, host);
    else { console.error(error.message); process.exitCode = 1; }
  });
  server.once('listening', async () => {
    const address = process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${port}`;
    console.log(`Quality dashboard: ${address}`);
    if (!production) {
      await fs.mkdir(path.join(root, 'outputs'), { recursive: true });
      await fs.writeFile(path.join(root, 'outputs', 'quality-server-url.txt'), address);
    }
    await refreshIfMissing();
  });
  server.listen(port, host);
  const timer = setInterval(refreshIfMissing, 5 * 60 * 1000);
  timer.unref();
  function shutdown() { clearInterval(timer); server.close(() => { process.exitCode = 0; }); setTimeout(() => process.exit(0), 10000).unref(); }
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
