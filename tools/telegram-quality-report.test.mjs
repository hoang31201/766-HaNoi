import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, watchlist, splitMessages, vietnamDay, formatTelegramHtml } from './telegram-quality-report.mjs';
const snapshot = (day, departments = []) => ({ day, capturedAt: day + 'T22:00:00Z', period: { year: 2026, timeType: 'year' }, department: { code: 'H26' }, totalMaxScore: 100, totalScore: 55, rank: 30, provinceCount: 34, groups: Array.from({ length: 6 }, (_, i) => ({ code: String(i), name: 'Group ' + i, score: 10, maxScore: 20, metrics: [] })), departments });
test('Vietnam date and stale data never become today report', () => {
  assert.equal(vietnamDay(new Date('2026-10-06T20:00:00Z')), '2026-10-07');
  const report = buildReport([snapshot('2026-10-06')], '2026-10-07');
  assert.equal(report.kind, 'missing'); assert.match(report.messages[0], /06\/10\/2026/);
});
test('Watch lists separate peers, preserve zero and rank drop before low score', () => {
  const current = snapshot('2026-10-07', [{ code: 'a', type: 'AGENCY', score: 80 }, { code: 'b', type: 'AGENCY', score: 0 }, { code: 'c', type: 'COMMUNE', score: 30 }, { code: 'd', type: 'AGENCY', score: null }]);
  const baseline = snapshot('2026-10-06', [{ code: 'a', score: 83 }]);
  assert.deepEqual(watchlist(current, baseline, 'AGENCY', 3).map(d => d.code), ['a', 'b']);
  assert.equal(watchlist(current, baseline, 'COMMUNE', 10).length, 1);
  baseline.source = { name: 'other' };
  assert.deepEqual(watchlist(current, baseline, 'AGENCY', 3).map(d => d.code), ['b']);
});
test('Missing previous day and different periods do not imply zero change', () => {
  const report = buildReport([snapshot('2026-10-07')], '2026-10-07');
  assert.match(report.messages[0], /chưa đủ đối chiếu/);
  const before = snapshot('2026-10-06'); before.period.year = 2025;
  assert.match(buildReport([before, snapshot('2026-10-07')], '2026-10-07').messages[0], /chưa đủ đối chiếu/);
});
test('Message chunks remain under Telegram limit without truncation', () => {
  const text = Array.from({ length: 200 }, (_, i) => 'Line ' + i + ' x'.repeat(50)).join('\n');
  const parts = splitMessages(text);
  assert.ok(parts.every(p => p.length <= 3800)); assert.equal(parts.join('\n'), text);
});
test('Secondary comparison is opt-in, labeled and still rejects incompatible years', () => {
  const before = snapshot('2026-10-06', [{ code: 'a', type: 'COMMUNE', score: 60 }]);
  before.source = { name: 'secondary' }; before.totalScore = 54;
  const now = snapshot('2026-10-07', [{ code: 'a', type: 'COMMUNE', score: 58 }]);
  assert.equal(watchlist(now, before, 'COMMUNE', 10)[0].change, null);
  assert.equal(watchlist(now, before, 'COMMUNE', 10, true)[0].change, -2);
  const report = buildReport([before, now], now.day, { allowSecondary: true });
  assert.ok(report.qualityNotes.some(note => note.startsWith('ĐỐI CHIẾU THAM KHẢO')));
  assert.match(report.messages[0], /\+1 điểm/);
  before.period.year = 2025;
  assert.match(buildReport([before, now], now.day, { allowSecondary: true }).messages[0], /chưa đủ đối chiếu/);
});
test('Telegram formatting highlights headings and unit scores without allowing injected HTML', () => {
  const text = 'BÁO CÁO 766 HÀ NỘI | 06/10/2026\nĐiểm: 54,79/100 | +0,15 điểm\n1. UBND <xã> & phường: 46,35 điểm; +0,45 điểm; đỏ: dưới 50%. Nhóm giảm chính: Số hóa (-0,06).';
  const html = formatTelegramHtml(text);
  assert.match(html, /<b>BÁO CÁO 766/);
  assert.match(html, /<b>\+0,15 điểm<\/b>/);
  assert.match(html, /<b>UBND &lt;xã&gt; &amp; phường<\/b>/);
  assert.match(html, /\n   46,35 điểm \| \+0,45 điểm/);
  assert.doesNotMatch(html, /<b>(46,35 điểm|đỏ: dưới 50%)/);
  assert.equal((html.match(/<b>/g) || []).length, (html.match(/<\/b>/g) || []).length);
  assert.ok(!html.includes('<xã>'));
  assert.equal(formatTelegramHtml('chưa có <script>'), 'chưa có &lt;script&gt;');
});
test('Changes and unit sections have no emoji', () => {
  const html = formatTelegramHtml('Điểm: 50/100 | -0,5 điểm\nĐiểm: 50/100 | +0,5 điểm\nĐiểm: 50/100 | 0 điểm\nĐiểm: 50/100 | chưa đủ đối chiếu\n1. Xã A: 45 điểm; +0,5 điểm; đỏ: dưới 50%.');
  assert.doesNotMatch(html, /📉|📈|➖|⚪/);
  assert.match(html, /\| <b>-0,5 điểm/);
  assert.match(html, /\| <b>\+0,5 điểm/);
  assert.match(html, /\| <b>0 điểm/);
  assert.match(html, /\| <b>chưa đủ đối chiếu/);
  assert.doesNotMatch(formatTelegramHtml('1. Xã B: 55 điểm; -2 điểm; giảm vượt ngưỡng.'), /📉|📈|➖|⚪/);
  assert.doesNotMatch(html, /🔴|🟡/);
  assert.equal(formatTelegramHtml('XÃ/PHƯỜNG: 10/10 đơn vị'), '<b>XÃ/PHƯỜNG: 10/10 đơn vị</b>');
});
test('Compact reports omit removed sections and use clear unit labels', () => {
  const before = snapshot('2026-10-06', [{ code: 'a', score: 63 }, { code: 'b', score: 40 }]);
  const now = snapshot('2026-10-07', [{ code: 'a', name: 'Xã A', type: 'COMMUNE', score: 60 }, { code: 'b', name: 'Sở B', type: 'AGENCY', score: 40 }]);
  const report = buildReport([before, now], now.day);
  const text = report.messages.join('\n');
  assert.doesNotMatch(text, /ĐỀ XUẤT KIỂM TRA|Nguồn:|Đủ điểm tổng:|Số liệu lũy kế|Ngưỡng vận hành:|Chưa đủ chi tiết/);
  assert.match(text, /Giảm vượt ngưỡng/);
  assert.match(text, /Điểm thấp/);
  assert.doesNotMatch(formatTelegramHtml(report.messages.at(-1)), /📋|🏛️|🏘️|🔴|🟡|📉|📈|➖|⚪/);
});
test('Reports omit the separate comparison-date line but retain daily deltas', () => {
  const before = snapshot('2026-10-06'); before.totalScore = 54;
  const now = snapshot('2026-10-07');
  const report = buildReport([before, now], now.day);
  assert.ok(report.messages.every(message => !/^Đối chiếu:/m.test(message)));
  assert.match(report.messages[0], /\+1 điểm/);
});

test('Half-point decline is inclusive and only declining alerts expose their main group', () => {
  const makeUnit = (code, score, groupScore) => ({ code, name: code, type: 'COMMUNE', score, groupScores: { '0': { score: groupScore, maxScore: 20 } } });
  const before = snapshot('2026-10-06', [makeUnit('boundary', 80, 10), makeUnit('above', 80, 10), makeUnit('low', 40, 10)]);
  const now = snapshot('2026-10-07', [makeUnit('boundary', 79.5, 9.5), makeUnit('above', 79.51, 9.51), makeUnit('low', 39.9, 9.9)]);
  const list = watchlist(now, before, 'COMMUNE', 10);
  assert.deepEqual(list.map(d => d.code), ['boundary', 'low']);
  assert.equal(list[0].tier, 0);
  assert.equal(list[0].cause.change, -.5);
  assert.equal(list[1].tier, 1);
  assert.equal(list[1].cause, undefined);
  const units = buildReport([before, now], now.day).messages.at(-1);
  assert.match(units, /boundary:.*Giảm vượt ngưỡng\. Nhóm giảm chính:/);
  assert.match(units, /low:.*Điểm thấp\.(?:\n|$)/);
  const html = formatTelegramHtml(units);
  assert.doesNotMatch(html, /<b>(79,5 điểm|39,9 điểm|Giảm vượt ngưỡng|Điểm thấp|-0,5 điểm|-0,1 điểm)/);
  assert.match(html, /<b>boundary<\/b>/);
});
