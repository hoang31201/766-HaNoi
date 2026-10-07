import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBranchReport } from './telegram-branch-report.mjs';
import { notificationPlans, deliverReport } from './telegram-github.mjs';

const mapping = globalThis.BRANCH_ASSIGNMENTS;
const definitions = [['CKMB', 18], ['TDGQ', 20], ['CLGQ', 12], ['TTTT', 10], ['MDHL', 18], ['MDSH', 22]];
function snapshot(day) {
  return { day, capturedAt: `${day}T00:00:00Z`, department: { code: 'H26' }, period: { year: 2026, timeType: 'year' },
    totalScore: 60, totalMaxScore: 100, rank: 20, provinceCount: 34,
    groups: definitions.map(([code, maxScore]) => ({ code, name: code, score: 10, maxScore,
      metrics: [{ code: 'COUNT', numerator: day.endsWith('07') ? 101 : 100 }] })),
    departments: mapping.branches.flatMap(b => b.codes.map(code => ({ code, name: code, type: 'COMMUNE', score: 60,
      groupScores: Object.fromEntries(definitions.map(([code, maxScore]) => [code, { score: 10, maxScore }])),
      groupDetails: Object.fromEntries(definitions.map(([code, maxScore]) => [code, { score: 10, maxScore, metrics: [] }])) }))) };
}
test('one separate HTML branch message contains all 12, with exact mean changes and plain unit lines', () => {
  const before = snapshot('2026-10-06'), current = snapshot('2026-10-07');
  for (const s of [before, current]) for (const code of mapping.branches[1].codes) s.departments.find(d => d.code === code).score = 49;
  for (const code of mapping.branches[0].codes) {
    const u = current.departments.find(d => d.code === code); u.score -= .5; u.groupScores.CKMB.score -= .5;
  }
  const report = buildBranchReport([before, current], current.day);
  assert.equal(report.messages.length, 1); assert.equal(report.rows.length, 12);
  assert.equal(report.counts.down, 1); assert.equal(report.counts.same, 11); assert.equal(report.counts.alert, 1);
  assert.equal(report.counts.red, 1); assert.equal(report.counts.yellow, 11);
  assert.equal(report.rows.find(r => r.id === '01').change, -.5);
  assert.equal(report.rows.find(r => r.id === '01').cause.name, 'CKMB');
  assert.equal(report.rows.find(r => r.id === '02').cause, null);
  assert.match(report.messages[0], /<b>BÁO CÁO 12 CHI NHÁNH/);
  assert.ok(!report.messages[0].includes('<b>Chi nhánh'));
  assert.ok(!report.messages[0].includes('Đối chiếu:'));
  assert.ok(!report.messages[0].includes('Chưa đủ đối chiếu 0'));
  assert.match(report.messages[0], /<b>Điểm và biến động 12 chi nhánh<\/b>\n\n/);
  assert.ok(report.messages[0].length < 3800);
});
test('stale or unverified source never produces branch report; no prior means unknown, not zero', () => {
  const a = snapshot('2026-10-06'), b = snapshot('2026-10-07');
  const noPrior = buildBranchReport([b], b.day);
  assert.equal(noPrior.counts.unknown, 12); assert.equal(noPrior.counts.same, 0);
  b.groups.forEach(g => { g.metrics[0].numerator = 100; });
  assert.ok(buildBranchReport([a, b], b.day) === null);
  b.groups[0].metrics[0].numerator = 101; b.source = { name: 'secondary' };
  assert.equal(buildBranchReport([a, b], b.day), null);
  delete b.source; b.capturedAt = a.capturedAt;
  assert.equal(buildBranchReport([a, b], b.day), null);
});
test('missing units keep full denominator and suppress aggregate and rank', () => {
  const a = snapshot('2026-10-06'), b = snapshot('2026-10-07');
  b.departments.find(d => d.code === mapping.branches[0].codes[0]).score = null;
  const report = buildBranchReport([a, b], b.day), r = report.rows.find(r => r.id === '01');
  assert.equal(r.score, null); assert.equal(r.rank, null); assert.equal(r.count, 3); assert.equal(r.coverage, 2);
  assert.match(report.text, /Đủ điểm 2\/3/); assert.match(report.text, /11\/12 chi nhánh/);
});
test('source mixing is disabled by default and explicit preview remains labeled', () => {
  const a = snapshot('2026-10-06'), b = snapshot('2026-10-07'); a.source = { name: 'Source <external>' };
  const report = buildBranchReport([a, b], b.day);
  assert.equal(report.counts.unknown, 12); assert.equal(report.counts.same, 0);
  const preview = buildBranchReport([a, b], b.day, { allowSecondary: true });
  assert.equal(preview.counts.same, 12); assert.match(preview.messages[0], /Source &lt;external&gt;/);
});
test('send time and missing notice shared with city; branch uses independent daily dedupe', async () => {
  const a = snapshot('2026-10-06'), b = snapshot('2026-10-07'), history = [a, b];
  assert.deepEqual(notificationPlans(history, new Date('2026-10-06T23:29:59Z')), []);
  const plans = notificationPlans(history, new Date('2026-10-06T23:30:00Z'));
  assert.deepEqual(plans.map(p => p.kind), ['report', 'branches']);
  assert.deepEqual(notificationPlans([a], new Date('2026-10-06T23:30:00Z')).map(p => p.kind), ['missing']);
  let state = { version: 1, deliveries: { '2026-10-07-report-fresh': { complete: true, pending: null } } };
  const store = { load: async () => structuredClone(state), save: async s => { state = structuredClone(s); } };
  const sent = [];
  assert.equal(await deliverReport(plans[0], store, async t => sent.push(t), '-1:'), 'already-sent');
  assert.equal(await deliverReport(plans[1], store, async t => sent.push(t), '-1:'), 'sent');
  assert.equal(await deliverReport(plans[1], store, async t => sent.push(t), '-1:'), 'already-sent');
  assert.equal(sent.length, 1);
});
test('uncertain branch delivery blocks resend and later city messages', async () => {
  const plans = notificationPlans([snapshot('2026-10-06'), snapshot('2026-10-07')], new Date('2026-10-06T23:30:00Z'));
  let state = { version: 1, deliveries: {} };
  const store = { load: async () => structuredClone(state), save: async s => { state = structuredClone(s); } };
  await assert.rejects(deliverReport(plans[1], store, async () => { throw new Error('Timeout'); }, '-1:'));
  await assert.rejects(deliverReport(plans[0], store, async () => {}, '-1:'), /Uncertain/);
});
