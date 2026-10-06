import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createQualityServer } from './quality-server.mjs';
import { seedHistory, localDay } from './quality-data.mjs';

async function fixture(t, options = {}) {
  const app = createQualityServer({ history: async () => [{ day: '2026-10-06', totalScore: 54.79 }], localDay: () => '2026-10-06', production: true, publicOrigin: 'https://hanoi.example.org', ...options });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  t.after(() => new Promise(resolve => { app.server.close(resolve); app.server.closeAllConnections(); }));
  return { ...app, url: `http://127.0.0.1:${app.server.address().port}` };
}
test('Public HTTPS origin works; foreign and loopback origins fail on production', async t => {
  let calls = 0;
  const { url } = await fixture(t, { cooldownMs: 0, collect: async () => { calls++; } });
  assert.equal((await fetch(url + '/healthz')).status, 200);
  assert.equal((await fetch(url + '/api/collect', { method: 'POST', headers: { Origin: 'https://hanoi.example.org' } })).status, 200);
  assert.equal(calls, 1);
  for (const origin of ['https://foreign.example.org', 'http://127.0.0.1:8766']) assert.equal((await fetch(url + '/api/collect', { method: 'POST', headers: { Origin: origin } })).status, 403);
  assert.equal(calls, 1);
  const js = await (await fetch(url + '/data/quality-history.js')).text();
  assert.match(js, /54.79/);
  assert.equal((await fetch(url + '/%2e%2e%2fpackage.json')).status, 403);
  assert.equal((await fetch(url + '/outputs/quality-history/raw/a.json')).status, 404);
});
test('Concurrent refreshes share one crawl; completed crawls have cooldown', async t => {
  let calls = 0, complete;
  const { url } = await fixture(t, { collect: () => { calls++; return new Promise(resolve => { complete = resolve; }); } });
  const request = () => fetch(url + '/api/collect', { method: 'POST', headers: { Origin: 'https://hanoi.example.org' } });
  const first = request(), second = request();
  for (let i = 0; !complete && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(complete);
  await new Promise(resolve => setTimeout(resolve, 30));
  complete();
  assert.equal((await first).status, 200); assert.equal((await second).status, 200); assert.equal(calls, 1);
  const cooldown = await request(); assert.equal(cooldown.status, 429); assert.ok(Number(cooldown.headers.get('retry-after')) > 0);
});
test('Failed collection leaves history available and reports failure', async t => {
  const { url } = await fixture(t, { collect: async () => { throw new Error('Source unavailable'); } });
  assert.equal((await fetch(url + '/api/collect', { method: 'POST' })).status, 502);
  const history = await (await fetch(url + '/api/history')).json();
  assert.equal(history.snapshots[0].totalScore, 54.79); assert.equal(history.lastError, 'Source unavailable');
});
test('Daily scheduling skips existing days and collects a missing Vietnam date', async t => {
  let calls = 0;
  const known = await fixture(t, { collect: async () => { calls++; } });
  await known.refreshIfMissing(); assert.equal(calls, 0);
  const missing = await fixture(t, { history: async () => [], collect: async () => { calls++; } });
  await missing.refreshIfMissing(); assert.equal(calls, 1);
  assert.equal(localDay(new Date('2026-10-05T17:00:00Z')), '2026-10-06');
});
test('Seed migration survives repeat launches and preserves cloud history', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'quality-deploy-'));
  t.after(() => {
    assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep));
    return fs.rm(temp, { recursive: true, force: true });
  });
  const source = path.join(temp, 'seed'), destination = path.join(temp, 'disk');
  await fs.mkdir(path.join(source, 'raw'), { recursive: true });
  const seed = { day: '2026-10-06', department: { code: 'H26' }, totalScore: 54.79, rawFile: 'capture.json' };
  await fs.writeFile(path.join(source, '2026-10-06.json'), JSON.stringify(seed));
  await fs.writeFile(path.join(source, 'raw', 'capture.json'), '{"source":"DVCQG"}');
  await seedHistory(source, destination);
  assert.equal(JSON.parse(await fs.readFile(path.join(destination, '2026-10-06.json'))).totalScore, 54.79);
  await fs.writeFile(path.join(destination, '2026-10-06.json'), JSON.stringify({ ...seed, totalScore: 56 }));
  await seedHistory(source, destination);
  assert.equal(JSON.parse(await fs.readFile(path.join(destination, '2026-10-06.json'))).totalScore, 56);
  assert.match(await fs.readFile(path.join(destination, 'raw', 'capture.json'), 'utf8'), /DVCQG/);
});
