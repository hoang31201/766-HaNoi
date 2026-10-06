import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { root, groups, extractDepartmentScores } from './quality-data.mjs';
import vm from 'node:vm';

test('Map joins all current Hanoi communes without fuzzy or cross-type matching', async () => {
  const scope = { window: {} };
  vm.runInNewContext(await fs.readFile(path.join(root, 'webapp/map-model.js'), 'utf8'), scope);
  vm.runInNewContext(await fs.readFile(path.join(root, 'webapp/data/hanoi-boundaries.js'), 'utf8'), scope);
  const { key, join, evaluate } = scope.window.QualityMapModel;
  const features = scope.window.HANOI_BOUNDARIES.features;
  assert.equal(features.length, 126); assert.equal(new Set(features.map(f => f.id)).size, 126);
  assert.equal(key('UBND Phường Đông Anh'), 'phuong dong anh');
  const units = features.map((f, i) => ({ code: String(i), name: 'UBND ' + f.properties.name, type: 'COMMUNE' }));
  assert.equal(join(features, units).filter(e => e.unit).length, 126);
  assert.equal(join(features, [{ ...units[0], type: 'AGENCY' }])[0].unit, null);
  assert.equal(join(features, [units[0], { ...units[0], code: 'duplicate' }])[0].unit, null);
  const opts = { mode: 'score', totalMax: 100, priorMax: 100, red: 50, yellow: 70, threshold: 0.5 };
  assert.equal(evaluate({ score: 0 }, null, 'all', opts).status, 'red');
  assert.equal(evaluate({ score: 50 }, null, 'all', opts).status, 'yellow');
  assert.equal(evaluate({ score: 70 }, null, 'all', opts).status, 'green');
  assert.equal(evaluate({ score: null }, null, 'all', opts).status, 'unknown');
  assert.equal(evaluate({ score: 60 }, null, 'all', { ...opts, mode: 'delta' }).status, 'unknown');
  assert.equal(evaluate({ score: 60 }, { score: 61 }, 'all', { ...opts, mode: 'delta' }).status, 'red');
  assert.equal(evaluate({ score: 60 }, { score: 60.5 }, 'all', { ...opts, mode: 'delta' }).status, 'yellow');
  assert.equal(evaluate({ score: 60 }, { score: 59 }, 'all', { ...opts, mode: 'delta' }).status, 'green');
  assert.equal(evaluate({ score: 60 }, { score: 59 }, 'all', { ...opts, priorMax: 80 }).delta, null);
  assert.equal(evaluate({ score: 60 }, { score: 59 }, 'TTTT', opts).status, 'unknown');
});

test('Unit group points join by department ID and preserve zero and missing data', () => {
  const raw = Object.fromEntries(groups.map(g => [g.endpoint, { evaluation: [{ departmentId: 'b', totalScore: 3, totalMaxScore: 18 }, { departmentId: 'a', totalScore: 0, totalMaxScore: 18 }] }]));
  raw['dvc-progress-tree'] = { children: [{ departmentId: 'a', score: 2, maxScore: 20 }] };
  const records = extractDepartmentScores([{ departmentId: 'a', departmentCode: 'H26.1', departmentName: 'A', totalScore: 10, childGroup: 'AGENCY' }, { departmentId: 'b', departmentCode: 'H26.2', departmentName: 'B', totalScore: 12, childGroup: 'COMMUNE' }], raw);
  assert.equal(records[0].score, 10);
  assert.deepEqual(records[0].groupScores.CKMB, { score: 0, maxScore: 18 });
  assert.deepEqual(records[0].groupScores.TDGQ, { score: 2, maxScore: 20 });
  assert.equal(records[1].groupScores.CKMB.score, 3);
  assert.deepEqual(records[1].groupScores.TDGQ, { score: null, maxScore: null });
});
import { buildPages } from './build-quality-pages.mjs';

test('Pages build includes only public assets and relative paths', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'quality-pages-'));
  t.after(() => { assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep)); return fs.rm(temp, { recursive: true, force: true }); });
  const dataDir = path.join(temp, 'history'), outDir = path.join(temp, 'site');
  await fs.mkdir(path.join(dataDir, 'raw'), { recursive: true });
  await fs.writeFile(path.join(dataDir, '2026-10-06.json'), JSON.stringify({ day: '2026-10-06', department: { code: 'H26' }, totalScore: 54.79, groups: [], rawFile: 'private-response.json' }));
  await fs.writeFile(path.join(dataDir, 'raw', 'private-response.json'), '{"not_for_website":true}');
  await buildPages({ dataDir, outDir, repository: 'owner/hanoi-quality-766' });
  assert.deepEqual((await fs.readdir(outDir)).sort(), ['.nojekyll', 'app.js', 'config.js', 'data', 'index.html', 'map-model.js', 'quality-map.js', 'styles.css', 'vendor']);
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
