import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { root } from './quality-data.mjs';
import { buildPages } from './build-quality-pages.mjs';

test('Pages build includes only public assets and relative paths', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'quality-pages-'));
  t.after(() => { assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep)); return fs.rm(temp, { recursive: true, force: true }); });
  const dataDir = path.join(temp, 'history'), outDir = path.join(temp, 'site');
  await fs.mkdir(path.join(dataDir, 'raw'), { recursive: true });
  await fs.writeFile(path.join(dataDir, '2026-10-06.json'), JSON.stringify({ day: '2026-10-06', department: { code: 'H26' }, totalScore: 54.79, groups: [], rawFile: 'private-response.json' }));
  await fs.writeFile(path.join(dataDir, 'raw', 'private-response.json'), '{"not_for_website":true}');
  await buildPages({ dataDir, outDir, repository: 'owner/hanoi-quality-766' });
  assert.deepEqual((await fs.readdir(outDir)).sort(), ['.nojekyll', 'app.js', 'config.js', 'data', 'index.html', 'styles.css']);
  const config = await fs.readFile(path.join(outDir, 'config.js'), 'utf8');
  assert.match(config, /"mode":"pages"/);
  assert.match(config, /https:\/\/github.com\/owner\/hanoi-quality-766\/actions\/workflows\/update-quality.yml/);
  const records = JSON.parse(await fs.readFile(path.join(outDir, 'data', 'quality-history.json'), 'utf8'));
  assert.equal(records[0].totalScore, 54.79); assert.equal(records[0].rawFile, undefined);
  const html = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
  assert.ok(!html.includes('src="/')); assert.match(html, /src="config.js\?v=[a-f0-9]{12}"/);
  assert.match(html, /src="app.js\?v=[a-f0-9]{12}"/);
  assert.match(html, /href="styles.css\?v=[a-f0-9]{12}"/);
  assert.match(html, /src="data\/quality-history.js\?v=[a-f0-9]{12}"/);
  await assert.rejects(buildPages({ dataDir, outDir, repository: 'https://malicious.invalid' }), /Invalid GitHub repository/);
});
test('Workflow publishes locally collected history with read-only source access', async () => {
  const workflow = await fs.readFile(path.join(root, '.github', 'workflows', 'update-quality.yml'), 'utf8');
  assert.ok(!workflow.includes('schedule:'));
  assert.ok(!workflow.includes('node tools/crawl-quality.mjs'));
  assert.match(workflow, /QUALITY_DATA_DIR:.*history\/quality/);
  assert.match(workflow, /contents: read/); assert.ok(!workflow.includes('contents: write')); assert.match(workflow, /pages: write/); assert.match(workflow, /id-token: write/);
  assert.match(workflow, /needs: collect-and-build/); assert.match(workflow, /cancel-in-progress: false/);
});
