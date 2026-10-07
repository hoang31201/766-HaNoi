import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import '../webapp/branch-model.js';

const context = { window: {} };
vm.runInNewContext(await fs.readFile(new URL('../webapp/data/branch-assignments.js', import.meta.url), 'utf8'), context);
const mapping = JSON.parse(JSON.stringify(context.window.BRANCH_ASSIGNMENTS));
const model = globalThis.BranchModel;
function snapshot(day = '2026-10-02') {
  return { day, period: { timeType: 'year', year: 2026 }, totalMaxScore: 100,
    departments: mapping.branches.flatMap(b => b.codes.map((code, i) => ({ code, type: 'COMMUNE', score: i * 10,
      groupScores: { CKMB: { score: i, maxScore: 18 } } }))) };
}
test('126 unique commune assignments use point names, effective October 1', () => {
  model.validate(mapping);
  assert.equal(mapping.effectiveFrom, '2026-10-01');
  assert.equal(mapping.basis, 'support-point-name');
  assert.deepEqual(mapping.branches.map(b => b.codes.length), [3, 6, 11, 10, 12, 8, 15, 14, 11, 12, 13, 11]);
  assert.ok(mapping.branches[2].codes.includes('H26.117'));
  assert.ok(mapping.branches[3].codes.includes('H26.125'));
  assert.ok(mapping.branches[4].codes.includes('H26.137'));
  assert.ok(!mapping.branches[0].codes.includes('H26.131'));
});
test('means use all assigned communes; zero is valid, agencies excluded', () => {
  const s = snapshot();
  const r = model.aggregate(mapping.branches[0], s, mapping);
  assert.equal(r.score, 10); assert.equal(r.count, 3); assert.equal(r.coverage, 3);
  assert.equal(model.aggregate(mapping.branches[0], s, mapping, 'CKMB').score, 1);
  s.departments[0].type = 'AGENCY';
  assert.equal(model.aggregate(mapping.branches[0], s, mapping).score, null);
});
test('missing score never shrinks denominator; group and total evaluated independently', () => {
  const s = snapshot(); s.departments[1].score = null;
  const r = model.aggregate(mapping.branches[0], s, mapping);
  assert.equal(r.count, 3); assert.equal(r.coverage, 2); assert.equal(r.score, null);
  assert.equal(model.aggregate(mapping.branches[0], s, mapping, 'CKMB').score, 1);
  delete s.departments[1].groupScores.CKMB;
  assert.equal(model.aggregate(mapping.branches[0], s, mapping, 'CKMB').score, null);
});
test('invalid assignment, wrong scale and dates before effective date blocked', () => {
  const duplicate = structuredClone(mapping); duplicate.branches[1].codes.push(mapping.branches[0].codes[0]);
  assert.throws(() => model.validate(duplicate), /trùng/);
  const s = snapshot('2026-09-30');
  assert.equal(model.aggregate(mapping.branches[0], s, mapping).score, null);
  s.day = '2026-10-01'; s.departments[1].groupScores.CKMB.maxScore = 20;
  assert.equal(model.aggregate(mapping.branches[0], s, mapping, 'CKMB').score, null);
});
test('daily comparison requires exact yesterday, matching period and verified source', () => {
  const a = snapshot(), b = snapshot('2026-10-01');
  assert.equal(model.comparable(a, b, mapping), true);
  b.period.timeType = 'month'; assert.equal(model.comparable(a, b, mapping), false);
  b.period.timeType = 'year'; a.freshness = { status: 'unchanged' };
  assert.equal(model.comparable(a, b, mapping), false);
  delete a.freshness; b.day = '2026-09-30'; assert.equal(model.comparable(a, b, mapping), false);
});
test('ranking is descending with competition ties and no rank for missing scores', () => {
  const s = snapshot(); s.departments.forEach(u => { u.score = 50; });
  s.departments.find(u => u.code === mapping.branches[1].codes[0]).score = 20;
  s.departments.find(u => u.code === mapping.branches[2].codes[0]).score = null;
  const rows = model.ranking(s, mapping);
  assert.equal(rows[0].rank, 1); assert.equal(rows[1].rank, 1);
  assert.equal(rows.find(r => r.id === '02').rank, 11);
  assert.equal(rows.at(-1).id, '03'); assert.equal(rows.at(-1).rank, null);
});
