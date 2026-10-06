import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const scope = { window: {} };
vm.runInNewContext(await fs.readFile(new URL('../webapp/unit-leader-model.js', import.meta.url), 'utf8'), scope);
const model = scope.window.UnitLeaderModel;
const unit = metrics => ({ groupDetails: { X: { code: 'X', name: 'Group', metrics } } });
const metric = (extra = {}) => ({ code: 'a', name: 'A', direction: 'up', unit: '%', score: 5, maxScore: 6, ratio: 80, denominator: 100, ...extra });
test('Rate deterioration still alerts when rounded score is unchanged', () => {
  const [r] = model.analyze(unit([metric({ ratio: 75 })]), unit([metric()]), 0.5);
  assert.equal(r.status, 'red'); assert.equal(r.scoreDelta, 0); assert.equal(r.rateDelta, -5);
});
test('Temporary and zero-denominator data do not become priorities', () => {
  const rows = model.analyze(unit([metric({ code: 'a', dataQualityStatus: 'TEMP' }), metric({ code: 'b', denominator: 0 })]), unit([metric({ score: 6 })]), 0.5);
  assert.equal(rows[0].status, 'temporary'); assert.equal(rows[1].status, 'empty'); assert.equal(model.priorities(rows).length, 0);
});
test('Low scores without a baseline are deficits, not deterioration alerts', () => {
  const [r] = model.analyze(unit([metric({ score: 2 })]), null, 0.5);
  assert.equal(r.status, 'unknown'); assert.equal(r.deficit, 4); assert.equal(model.priorities([r]).length, 1);
});
test('Time increase alerts, neutral counts do not; changed scales avoid score comparison', () => {
  const now = unit([metric({ code: 'days', direction: 'down', unit: 'ngày', score: null, maxScore: null, value: 4 }), metric({ code: 'count', direction: 'neutral', unit: 'hồ sơ', value: 20 }), metric({ code: 'scale', maxScore: 10, score: 3, ratio: 80 })]);
  const before = unit([metric({ code: 'days', direction: 'down', unit: 'ngày', score: null, maxScore: null, value: 2 }), metric({ code: 'count', direction: 'neutral', unit: 'hồ sơ', value: 10 }), metric({ code: 'scale' })]);
  const rows = model.analyze(now, before, 0.5);
  assert.equal(rows[0].status, 'red'); assert.equal(rows[1].status, 'normal'); assert.equal(rows[2].scoreDelta, null);
});
test('Peer ranking respects type, ties and missing scores', () => {
  const d = { type: 'COMMUNE', score: 60 };
  const rank = model.rank(d, [d, { type: 'COMMUNE', score: 60 }, { type: 'COMMUNE', score: 70 }, { type: 'AGENCY', score: 80 }, { type: 'COMMUNE', score: null }]);
  assert.equal(rank.rank, 2); assert.equal(rank.count, 3);
});
