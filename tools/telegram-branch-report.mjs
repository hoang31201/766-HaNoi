import { pathToFileURL } from 'node:url';
import '../webapp/data/branch-assignments.js';
import '../webapp/branch-model.js';
import { readHistory, vietnamDay, splitMessages } from './telegram-quality-report.mjs';
import { validDailySnapshot, hasNewSourceData } from './quality-sync-policy.mjs';

const mapping = globalThis.BRANCH_ASSIGNMENTS, model = globalThis.BranchModel;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const fmt = n => finite(n) ? n.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'chưa đủ điểm';
const date = day => day.split('-').reverse().join('/');
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const signed = n => `${n > 0 ? '+' : ''}${fmt(n)}`;

export function buildBranchReport(snapshots, day = vietnamDay(), { allowSecondary = false } = {}) {
  const current = snapshots.find(s => s.day === day && validDailySnapshot(s, day));
  if (!current || !hasNewSourceData(current, snapshots) || day < mapping.effectiveFrom) return null;
  const prior = snapshots.find(s => s.day === model.previousDay(day));
  const compare = model.comparable(current, prior, mapping) && (allowSecondary || !prior.source);
  const ranked = model.ranking(current, mapping);
  const oldRanks = compare ? model.ranking(prior, mapping) : [];
  const counts = { up: 0, down: 0, same: 0, unknown: 0, alert: 0, red: 0, yellow: 0 };
  const rows = ranked.map(r => {
    const before = oldRanks.find(p => p.id === r.id);
    const change = model.change(r, before);
    counts[!finite(change) ? 'unknown' : change > 0 ? 'up' : change < 0 ? 'down' : 'same']++;
    const drop = finite(change) && change <= -.5;
    if (drop) counts.alert++;
    const ratio = finite(r.score) && r.max > 0 ? r.score / r.max : null;
    if (finite(ratio) && ratio < .5) counts.red++;
    else if (finite(ratio) && ratio < .7) counts.yellow++;
    const branch = mapping.branches.find(b => b.id === r.id);
    const cause = drop ? current.groups.map(g => ({ name: g.name,
      change: model.change(model.aggregate(branch, current, mapping, g.code), model.aggregate(branch, prior, mapping, g.code))
    })).filter(g => finite(g.change) && g.change < 0).sort((a, b) => a.change - b.change)[0] : null;
    return { ...r, change, drop, cause };
  });
  const lines = [
    `🏢 BÁO CÁO 12 CHI NHÁNH | ${date(day)}`,
    `Tăng ${counts.up} | Giảm ${counts.down} | Giữ nguyên ${counts.same}${counts.unknown ? ` | Chưa đủ đối chiếu ${counts.unknown}` : ''}`,
    '', 'Giảm vượt ngưỡng / Điểm thấp',
    `Giảm từ 0,5 điểm: ${counts.alert} chi nhánh.`,
    `Dưới 50%: ${counts.red} | Từ 50% đến dưới 70%: ${counts.yellow}.`,
    '', 'Điểm và biến động 12 chi nhánh', '',
  ];
  for (const r of rows) {
    const movement = !finite(r.change) ? 'Chưa đủ đối chiếu' : r.change > 0 ? `Tăng ${fmt(r.change)}` : r.change < 0 ? `Giảm ${fmt(-r.change)}` : 'Giữ nguyên';
    lines.push(`${r.rank ?? '—'}. Chi nhánh ${r.id}: ${fmt(r.score)}${finite(r.score) ? ' điểm' : ''} | ${movement}${r.drop ? ' · Giảm vượt ngưỡng' : ''}`);
    if (r.cause) lines.push(`   Nhóm giảm chính: ${r.cause.name} (${signed(r.cause.change)} điểm).`);
    if (!r.complete) lines.push(`   Đủ điểm ${r.coverage}/${r.count} xã/phường; chưa tính điểm trung bình hoặc hạng.`);
  }
  const eligibleCount = rows.filter(r => r.complete).length;
  if (eligibleCount < 12) lines.push(`Thứ hạng tạm trong ${eligibleCount}/12 chi nhánh đủ dữ liệu.`);
  if (!compare) lines.push(`Chưa đủ đối chiếu cùng nguồn/kỳ ngày ${date(model.previousDay(day))}; không kết luận tăng/giảm.`);
  if (compare && prior.source) lines.push(`Đối chiếu tham khảo với nguồn ${prior.source.name}; không dùng chênh lệch để kết luận trách nhiệm.`);
  lines.push('', `Chi tiết: https://hoang31201.github.io/766-HaNoi/#branches?day=${day}`);
  const headings = new Set(['Giảm vượt ngưỡng / Điểm thấp', 'Điểm và biến động 12 chi nhánh']);
  const text = lines.join('\n');
  const html = lines.map(line => line.startsWith('🏢 ') ? `🏢 <b>${escape(line.slice(3))}</b>` : headings.has(line) ? `<b>${escape(line)}</b>` : escape(line)).join('\n');
  return { day, kind: 'branches', deliveryKey: `${day}-branches-fresh`, counts, rows,
    text, messages: splitMessages(html) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const day = process.argv.slice(2).find(a => !a.startsWith('--')) || vietnamDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid date');
  const report = buildBranchReport(await readHistory(), day, { allowSecondary: process.argv.includes('--compare-secondary') });
  console.log(report?.text || 'Chưa đủ dữ liệu mới để lập báo cáo chi nhánh.');
}
