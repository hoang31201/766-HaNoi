import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const valid = v => typeof v === 'number' && Number.isFinite(v);
const fmt = v => valid(v) ? v.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : 'chưa có';
const date = d => d.split('-').reverse().join('/');
const delta = (a, b) => valid(a) && valid(b) ? Math.round((a - b) * 100) / 100 : null;
const signed = n => valid(n) ? `${n > 0 ? '+' : ''}${fmt(n)}` : 'chưa đủ đối chiếu';
export function vietnamDay(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(p => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function comparable(a, b, allowSecondary = false) {
  return !!a && !!b && (allowSecondary || !a.source && !b.source) && a.period?.year === b.period?.year && a.period?.timeType === b.period?.timeType && valid(a.totalMaxScore) && a.totalMaxScore === b.totalMaxScore;
}
export function watchlist(current, baseline, type, limit, allowSecondary = false) {
  const canCompare = comparable(current, baseline, allowSecondary);
  return current.departments.filter(d => d.type === type && valid(d.score)).map(d => {
    const prior = canCompare ? baseline.departments.find(p => p.code === d.code) : null;
    const change = delta(d.score, prior?.score);
    const percent = valid(current.totalMaxScore) && current.totalMaxScore > 0 ? d.score / current.totalMaxScore * 100 : null;
    const tier = valid(change) && change <= -.5 ? 0 : valid(percent) && percent < 70 ? 1 : 2;
    const cause = tier === 0 ? current.groups.map(g => {
      const a = d.groupScores?.[g.code], b = prior?.groupScores?.[g.code];
      return { name: g.name, change: valid(a?.maxScore) && a.maxScore === b?.maxScore ? delta(a.score, b.score) : null };
    }).filter(g => valid(g.change) && g.change < 0).sort((a, b) => a.change - b.change)[0] : undefined;
    return { ...d, change, percent, tier, cause };
  }).filter(d => d.tier < 2).sort((a, b) => a.tier - b.tier || (a.tier === 0 ? a.change - b.change : a.percent - b.percent) || a.code.localeCompare(b.code)).slice(0, limit);
}
export function splitMessages(text, maximum = 3800) {
  const parts = []; let part = '';
  for (const line of text.split('\n')) {
    if (line.length > maximum) throw new Error('Report line too long');
    if (part && part.length + line.length + 1 > maximum) { parts.push(part); part = ''; }
    part += (part ? '\n' : '') + line;
  }
  if (part) parts.push(part);
  return parts;
}
const escapeHtml = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const headingIcons = [['BÁO CÁO 766', '📊'], ['ĐƠN VỊ CẦN THEO DÕI', ''], ['KẾT QUẢ THÀNH PHỐ', '🏙️'], ['CẦN CHÚ Ý', '⚠️'], ['SỞ/NGÀNH:', ''], ['XÃ/PHƯỜNG:', '']];
export function formatTelegramHtml(text) {
  return text.split('\n').map(line => {
    if (!line) return '';
    const unit = line.match(/^(\d+)\. (.*?): ([\d.,]+ điểm); ([^;]+); (.*)$/);
    if (unit) {
      const [, rank, name, score, change, detail] = unit;
      const marker = '. Nhóm giảm chính: ';
      const position = detail.indexOf(marker);
      const assessment = position < 0 ? detail : detail.slice(0, position);
      const cause = position < 0 ? '' : detail.slice(position + marker.length);
      return `${rank}. <b>${escapeHtml(name)}</b>\n   ${escapeHtml(score)} | ${escapeHtml(change)}\n   ${escapeHtml(assessment)}${cause ? `\n   Nhóm giảm chính: ${escapeHtml(cause)}` : ''}`;
    }
    const heading = headingIcons.find(([prefix]) => line.startsWith(prefix));
    if (heading) return `${heading[1] ? heading[1] + ' ' : ''}<b>${escapeHtml(line)}</b>`;
    const warning = line.match(/^(ĐỐI CHIẾU THAM KHẢO:|Ngưỡng vận hành:)(.*)$/);
    if (warning) return `⚠️ <b>${escapeHtml(warning[1])}</b>${escapeHtml(warning[2])}`;
    const score = line.match(/^(Điểm|Hạng nguồn|Công khai, minh bạch|Tiến độ giải quyết|Dịch vụ công trực tuyến|Thanh toán trực tuyến|Mức độ hài lòng|Số hóa hồ sơ): (.*?) \| (.*)$/);
    if (score) return `<b>${escapeHtml(score[1])}:</b> ${escapeHtml(score[2])} | <b>${escapeHtml(score[3])}</b>`;
    if (/^(Chưa có bản số liệu mới|Chưa có đối chiếu|Chưa đủ chi tiết|Có chỉ tiêu nguồn)/.test(line)) return `⚠️ <i>${escapeHtml(line)}</i>`;
    if (line.startsWith('Chi tiết:')) return `🔗 ${escapeHtml(line)}`;
    if (/^(Nguồn:|Lấy lúc:|Đối chiếu:|Đủ điểm tổng:|Chưa có bản số liệu mới|Chưa có đối chiếu|Chưa đủ chi tiết|Có chỉ tiêu nguồn)/.test(line)) return `<i>${escapeHtml(line)}</i>`;
    return escapeHtml(line);
  }).join('\n');
}
export function buildReport(snapshots, day = vietnamDay(), { allowSecondary = false } = {}) {
  const current = snapshots.find(s => s.day === day && s.department?.code === 'H26' && !s.source);
  const latest = snapshots.filter(s => s.department?.code === 'H26' && !s.source && s.day <= day).sort((a, b) => a.day.localeCompare(b.day)).at(-1);
  if (!current) return { day, kind: 'missing', messages: [`BÁO CÁO 766 HÀ NỘI | ${date(day)}\nChưa có bản số liệu mới từ Cổng Dịch vụ công quốc gia.\nBản nguồn chính gần nhất: ${latest ? date(latest.day) : 'chưa có'}.\nKhông dùng số liệu cũ để kết luận tăng/giảm hôm nay.\nĐề xuất: kiểm tra máy cào dữ liệu và kết nối nguồn.\nhttps://hoang31201.github.io/766-HaNoi/#history`] };
  if (!Array.isArray(current.groups) || current.groups.length !== 6 || !Array.isArray(current.departments) || !valid(current.totalScore)) throw new Error('Invalid report snapshot');
  const previous = new Date(Date.parse(day + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  const baseline = snapshots.find(s => s.day === previous);
  const compare = comparable(current, baseline, allowSecondary);
  const crossSource = compare && !!(current.source || baseline.source);
  const totalChange = compare ? delta(current.totalScore, baseline.totalScore) : null;
  const counts = { up: 0, down: 0, same: 0, unknown: 0 };
  for (const d of current.departments) {
    const prior = compare ? baseline.departments.find(p => p.code === d.code) : null;
    const change = delta(d.score, prior?.score);
    counts[!valid(change) ? 'unknown' : change > 0 ? 'up' : change < 0 ? 'down' : 'same']++;
  }
  const groupChanges = current.groups.map(g => {
    const before = compare ? baseline.groups.find(p => p.code === g.code) : null;
    return { ...g, change: valid(g.maxScore) && g.maxScore === before?.maxScore ? delta(g.score, before.score) : null, percent: valid(g.score) && valid(g.maxScore) && g.maxScore > 0 ? g.score / g.maxScore * 100 : null };
  });
  const concerns = groupChanges.filter(g => valid(g.change) && g.change <= -.5 || valid(g.percent) && g.percent < 70).sort((a, b) => {
    const aDrop = valid(a.change) && a.change <= -.5, bDrop = valid(b.change) && b.change <= -.5;
    return Number(bDrop) - Number(aDrop) || (aDrop ? a.change - b.change : (a.percent ?? 100) - (b.percent ?? 100));
  }).slice(0, 3);
  const quality = [crossSource ? `ĐỐI CHIẾU THAM KHẢO: ${date(current.day)} nguồn DVCQG; ${date(previous)} nguồn ${baseline.source?.name || 'DVCQG'}. Chưa xác minh thời điểm chốt và cách tổng hợp trùng nhau; không dùng chênh lệch để kết luận hiệu quả hoặc trách nhiệm đơn vị.` : '', baseline?.source?.inconsistentUnitCount ? `Nguồn đối chiếu có ${baseline.source.inconsistentUnitCount} đơn vị lệch điểm tổng với tổng 6 nhóm; giữ nguyên điểm nguồn.` : '', !compare ? `Chưa có đối chiếu cùng nguồn/kỳ ngày ${date(previous)}; không kết luận biến động.` : '', current.departments.some(d => !d.groupDetails) || baseline && baseline.departments.some(d => !d.groupDetails) ? 'Chưa đủ chi tiết tiêu chí từng đơn vị ở hai ngày; chỉ đối chiếu điểm tổng và nhóm.' : '', current.groups.some(g => g.metrics?.some(m => m.dataQualityStatus)) ? 'Có chỉ tiêu nguồn đánh dấu số liệu tạm; không dùng để kết luận suy giảm.' : ''].filter(Boolean);
  const summary = [
    `BÁO CÁO 766 HÀ NỘI | ${date(day)}`,
    `Lấy lúc: ${new Date(current.capturedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
    '', 'KẾT QUẢ THÀNH PHỐ',
    `Điểm: ${fmt(current.totalScore)}/${fmt(current.totalMaxScore)} | ${signed(totalChange)}${valid(totalChange) ? ' điểm' : ''}`,
    `Hạng nguồn: ${fmt(current.rank)}/${fmt(current.provinceCount)} | ${signed(compare ? delta(baseline.rank, current.rank) : null)}${compare && valid(baseline.rank) && valid(current.rank) ? ' bậc' : ''}`,
    ...groupChanges.map(g => `${g.name}: ${fmt(g.score)}/${fmt(g.maxScore)} | ${signed(g.change)}${valid(g.change) ? ' điểm' : ''}`),
    '', 'CẦN CHÚ Ý',
    ...(concerns.length ? concerns.map((g, i) => `${i + 1}. ${g.name}: ${fmt(g.percent)}% thang điểm; ${signed(g.change)}${valid(g.change) ? ' điểm' : ''}.`) : ['Chưa ghi nhận nhóm giảm vượt ngưỡng hoặc dưới 70% thang điểm.']),
    `Đơn vị tăng ${counts.up} | giảm ${counts.down} | không đổi ${counts.same} | chưa đủ đối chiếu ${counts.unknown}.`,
    `Chi tiết: https://hoang31201.github.io/766-HaNoi/#history?day=${day}`,
  ].join('\n');
  const units = ['ĐƠN VỊ CẦN THEO DÕI | ' + date(day)];
  for (const [type, limit, title] of [['AGENCY', 3, 'SỞ/NGÀNH'], ['COMMUNE', 10, 'XÃ/PHƯỜNG']]) {
    const list = watchlist(current, baseline, type, limit, allowSecondary);
    units.push('', `${title}: ${list.length}/${limit} đơn vị`);
    list.forEach((d, i) => units.push(`${i + 1}. ${d.name}: ${fmt(d.score)} điểm; ${signed(d.change)}${valid(d.change) ? ' điểm' : ''}; ${d.tier === 0 ? 'Giảm vượt ngưỡng' : 'Điểm thấp'}.${d.cause ? ` Nhóm giảm chính: ${d.cause.name} (${signed(d.cause.change)}).` : ''}`));
    if (list.length < limit) units.push('Không bổ sung đơn vị không thuộc diện theo dõi chỉ để đủ số lượng.');
  }
  return { day, kind: 'report', qualityNotes: quality, messages: [...splitMessages(summary), ...splitMessages(units.join('\n'))] };
}
export async function readHistory() {
  const byDay = new Map();
  for (const directory of ['outputs/github-sync/history/quality', 'outputs/local-sync/history']) {
    let files;
    try { files = await fs.readdir(path.join(root, directory)); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    for (const file of files.filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))) {
      const s = JSON.parse(await fs.readFile(path.join(root, directory, file), 'utf8'));
      if (s.day !== file.slice(0, 10) || s.department?.code !== 'H26') throw new Error('Invalid history file');
      const previous = byDay.get(s.day);
      if (!previous || !s.source && (previous.source || s.capturedAt >= previous.capturedAt)) byDay.set(s.day, s);
    }
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const day = process.argv.slice(2).find(arg => !arg.startsWith('--')) || vietnamDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid date');
  const report = buildReport(await readHistory(), day, { allowSecondary: process.argv.includes('--compare-secondary') });
  if (process.argv.includes('--html')) { report.messages = report.messages.map(formatTelegramHtml); report.parseMode = 'HTML'; }
  console.log(JSON.stringify(report));
}
