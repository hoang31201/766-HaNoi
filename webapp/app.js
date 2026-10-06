const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = v => typeof v === 'number' && Number.isFinite(v);
const fmt = v => num(v) ? new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(v) : '—';
const dateLabel = d => d ? d.split('-').reverse().join('/') : '—';
const value = m => m ? (m.unit === '%' ? m.ratio : m.value) : null;
const diff = (a, b) => num(a) && num(b) ? Math.round((a - b) * 100) / 100 : null;
const colors = ['#26798a', '#46865a', '#7662a0', '#b68127', '#bc5268', '#388c89'];
const settings = window.QUALITY_CONFIG || { mode: 'server' };
const pages = settings.mode === 'pages';
let snapshots = window.QUALITY_HISTORY || [], rows = [], offline = location.protocol === 'file:', today = '', lastError = '';
if (pages) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(p => [p.type, p.value]));
  today = `${parts.year}-${parts.month}-${parts.day}`;
  $('refresh').textContent = '↻ Làm mới dữ liệu';
  if (settings.workflowUrl) {
    const url = new URL(settings.workflowUrl);
    if (url.protocol === 'https:' && url.hostname === 'github.com') {
      const link = document.createElement('a');
      link.href = url.href; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = 'Lịch sử cập nhật ↗'; link.id = 'runWorkflow';
      $('refresh').after(link);
    }
  }
}
try { $('threshold').value = localStorage.getItem('quality-threshold') || '0.5'; } catch {}
function threshold() { const n = Number($('threshold').value); return Number.isFinite(n) && n >= 0.01 ? n : 0.5; }
function tone(delta, direction = 'up') {
  if (!num(delta) || delta === 0 || direction === 'neutral') return 'neutral';
  return (direction === 'down' ? delta < 0 : delta > 0) ? 'good' : 'bad';
}
function deltaText(delta, unit = 'điểm') {
  return num(delta) ? `${delta > 0 ? '↑ +' : delta < 0 ? '↓ ' : ''}${fmt(delta)} ${unit}` : 'Chưa có đối chiếu';
}
function deltaHTML(delta, unit = 'điểm', direction = 'up') { return `<span class="delta ${tone(delta, direction)}">${deltaText(delta, unit)}</span>`; }
function notify(message) { $('notice').hidden = !message; $('notice').textContent = message; }
function populate(preferred) {
  snapshots.sort((a, b) => a.day.localeCompare(b.day));
  $('current').innerHTML = snapshots.map(s => `<option value="${esc(s.day)}">${dateLabel(s.day)}</option>`).reverse().join('');
  $('current').value = snapshots.some(s => s.day === preferred) ? preferred : snapshots.at(-1)?.day || '';
  const groups = snapshots.at(-1)?.groups || [];
  $('group').innerHTML = '<option value="all">Tất cả nhóm</option>' + groups.map(g => `<option value="${esc(g.code)}">${esc(g.name)}</option>`).join('');
  $('chartMetric').innerHTML = '<option value="total">Điểm tổng hợp</option>' + groups.map(g => `<option value="${esc(g.code)}">${esc(g.name)}</option>`).join('');
  fillBaseline(); render();
}
function fillBaseline() {
  const current = snapshots.find(s => s.day === $('current').value);
  const options = snapshots.filter(s => s.day !== current?.day && s.period.year === current?.period.year);
  $('baseline').innerHTML = '<option value="">Chưa chọn đối chiếu</option>' + options.map(s => `<option value="${esc(s.day)}">${dateLabel(s.day)}</option>`).reverse().join('');
  $('baseline').value = options.filter(s => s.day < current.day).at(-1)?.day || '';
}
function render() {
  const current = snapshots.find(s => s.day === $('current').value), baseline = snapshots.find(s => s.day === $('baseline').value);
  if (!current) { notify(pages ? 'Chưa có số liệu được công bố. Đang chờ lần lấy số liệu đầu tiên.' : 'Chưa có số liệu chất lượng phục vụ. Bấm Cập nhật số liệu để lấy dữ liệu Hà Nội.'); $('summary').innerHTML = ''; $('groups').innerHTML = ''; $('metrics').innerHTML = ''; $('departments').innerHTML = ''; $('alerts').innerHTML = '<p class="empty">Chưa có dữ liệu.</p>'; $('updated').textContent = 'Chưa có số liệu'; $('export').disabled = true; return; }
  $('export').disabled = false;
  const warnings = [];
  if (offline && !pages) warnings.push('Đang xem bản đã lưu. Mở ứng dụng qua địa chỉ localhost để cập nhật trực tiếp.');
  if (lastError) warnings.push(`Lần cập nhật gần nhất thất bại: ${lastError}. Đang giữ số liệu đã lưu.`);
  if (today && current.day === snapshots.at(-1).day && current.day < today) warnings.push(`Chưa có số liệu ngày ${dateLabel(today)}.`);
  if (!baseline) warnings.push('Chưa có ngày đối chiếu. Các cảnh báo tăng giảm sẽ xuất hiện khi đã lưu ít nhất hai ngày trong cùng năm.');
  notify(warnings.join(' '));
  $('updated').textContent = `Lấy số liệu lúc ${new Date(current.capturedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;
  $('period').textContent = `Kỳ số liệu: năm ${current.period.year} · Ngày lưu: ${dateLabel(current.day)}`;
  const gap = baseline ? Math.abs((Date.parse(current.day) - Date.parse(baseline.day)) / 86400000) : 0;
  $('comparison').textContent = baseline ? `So với ${dateLabel(baseline.day)} · Cách ${gap} ngày` : 'Chưa có đối chiếu';
  const flattened = current.groups.flatMap(g => g.metrics.map(m => {
    const prior = baseline?.groups.find(b => b.code === g.code)?.metrics.find(b => b.code === m.code);
    return { ...m, group: g, before: value(prior), after: value(m), delta: diff(value(m), value(prior)) };
  }));
  const groupChanges = current.groups.map(g => ({ name: g.name, delta: diff(g.score, baseline?.groups.find(b => b.code === g.code)?.score), unit: 'điểm', direction: 'up' }));
  const totalDelta = diff(current.totalScore, baseline?.totalScore);
  const changes = [{ name: 'Điểm tổng hợp', delta: totalDelta, unit: 'điểm', direction: 'up' }, ...groupChanges, ...flattened.map(m => ({ name: m.name, delta: m.delta, unit: m.unit === '%' ? 'điểm %' : m.unit, direction: m.direction }))].filter(m => num(m.delta) && m.delta !== 0 && Math.abs(m.delta) >= threshold() && m.direction !== 'neutral');
  const drops = changes.filter(m => tone(m.delta, m.direction) === 'bad');
  $('summary').innerHTML = [
    ['Điểm tổng hợp', `${fmt(current.totalScore)}<small> / ${fmt(current.totalMaxScore)}</small>`, deltaHTML(totalDelta)],
    ['Xếp hạng toàn quốc', `${fmt(current.rank)}<small> / ${fmt(current.provinceCount)}</small>`, baseline ? deltaHTML(diff(baseline.rank, current.rank), 'bậc') : 'Theo điểm tổng hợp'],
    ['Ngày đã lưu', fmt(snapshots.filter(s => s.period.year === current.period.year).length), `${flattened.length} chỉ tiêu · 6 nhóm`],
    ['Biến động cần chú ý', fmt(changes.length), `<span class="bad">${drops.length} suy giảm</span> · ${changes.length - drops.length} cải thiện`],
  ].map(([title, v, detail]) => `<article><span>${title}</span><strong>${v}</strong><small>${detail}</small></article>`).join('');
  $('groups').innerHTML = current.groups.map((g, i) => `<article class="group" style="--accent:${colors[i]}"><h3>${esc(g.name)}</h3><strong>${fmt(g.score)}</strong><small> / ${fmt(g.maxScore)}</small><div class="track"><div style="width:${num(g.ratio) ? Math.max(0, Math.min(100, g.ratio)) : 0}%"></div></div>${deltaHTML(groupChanges[i].delta)}</article>`).join('');
  $('alerts').innerHTML = !baseline ? '<p class="empty">Chờ ngày lưu tiếp theo để xác định biến động.</p>' : changes.length ? changes.sort((a, b) => (tone(a.delta, a.direction) === 'bad' ? -1 : 1) - (tone(b.delta, b.direction) === 'bad' ? -1 : 1) || Math.abs(b.delta) - Math.abs(a.delta)).map(m => `<div class="alert ${tone(m.delta, m.direction)}"><strong>${esc(m.name)}</strong><p>${deltaText(m.delta, m.unit)} · ${tone(m.delta, m.direction) === 'bad' ? 'Suy giảm' : 'Cải thiện'}</p></div>`).join('') : '<p class="empty">Không có biến động vượt ngưỡng đã đặt.</p>';
  rows = flattened.filter(m => ($('group').value === 'all' || m.group.code === $('group').value) && (!$('onlyChanged').checked || num(m.delta) && m.delta !== 0));
  $('count').textContent = `${rows.length} / ${flattened.length} chỉ tiêu`;
  $('metrics').innerHTML = rows.map(m => {
    const evaluation = !num(m.delta) ? 'Chưa có đối chiếu' : m.delta === 0 ? 'Không đổi' : m.direction === 'neutral' ? 'Biến động số lượng / cơ cấu' : Math.abs(m.delta) < threshold() ? 'Dưới ngưỡng' : tone(m.delta, m.direction) === 'good' ? 'Cải thiện' : 'Suy giảm';
    return `<tr><td><small>${esc(m.group.name)}</small>${esc(m.name)}${m.dataQualityMessage ? `<small class="warning">Nguồn ghi chú: ${esc(m.dataQualityMessage)}</small>` : ''}</td><td>${fmt(m.before)}${num(m.before) ? ' ' + esc(m.unit) : ''}</td><td>${fmt(m.after)}${num(m.after) ? ' ' + esc(m.unit) : ''}</td><td>${deltaHTML(m.delta, m.unit === '%' ? 'điểm %' : m.unit, m.direction)}</td><td>${fmt(m.score)} / ${fmt(m.maxScore)}</td><td>${fmt(m.numerator)} / ${fmt(m.denominator)}</td><td class="${num(m.delta) && Math.abs(m.delta) >= threshold() ? tone(m.delta, m.direction) : 'neutral'}">${evaluation}</td></tr>`;
  }).join('') || '<tr><td colspan="7">Không có chỉ tiêu phù hợp.</td></tr>';
  const term = $('search').value.toLocaleLowerCase('vi');
  $('departments').innerHTML = current.departments.filter(d => d.name.toLocaleLowerCase('vi').includes(term)).map(d => {
    const prior = baseline?.departments.find(p => p.code === d.code);
    return `<tr><td>${esc(d.name)}</td><td>${fmt(prior?.score)}</td><td>${fmt(d.score)}</td><td>${deltaHTML(diff(d.score, prior?.score))}</td></tr>`;
  }).join('') || '<tr><td colspan="4">Không có đơn vị phù hợp.</td></tr>';
  $('footer').textContent = `Số liệu năm ${current.period.year}, lưu theo ngày tại múi giờ Việt Nam. Cảnh báo tỷ lệ tính bằng điểm phần trăm; điểm nhóm tính bằng điểm. Thời gian giải quyết tăng được tính là suy giảm; số lượng và cơ cấu chỉ ghi nhận biến động. Bản lưu trong cùng ngày là lần cập nhật thành công mới nhất. ${pages ? 'Lịch lấy số liệu trên máy cá nhân: 08:17 và 17:17 giờ Việt Nam; chỉ cập nhật khi máy hoạt động và có mạng.' : 'Tự lưu ngày mới khi ứng dụng đang chạy.'}`;
  drawChart();
}
function drawChart() {
  const current = snapshots.find(s => s.day === $('current').value);
  if (!current) return;
  const points = snapshots.filter(s => s.period.year === current.period.year).map(s => ({ day: s.day, v: $('chartMetric').value === 'total' ? s.totalScore : s.groups.find(g => g.code === $('chartMetric').value)?.score })).filter(p => num(p.v));
  const canvas = $('chart'), rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(240 * dpr);
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const w = rect.width, h = 240, left = 45, right = Math.max(left + 1, w - 24), top = 35, bottom = 201;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.font = '12px Segoe UI';
  if (!points.length) return;
  const maxScore = $('chartMetric').value === 'total' ? current.totalMaxScore : current.groups.find(g => g.code === $('chartMetric').value)?.maxScore;
  const max = Math.max(maxScore || 100, ...points.map(p => p.v), 1);
  for (let i = 0; i <= 4; i++) { const y = bottom - (bottom - top) * i / 4; ctx.strokeStyle = '#e9edef'; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); ctx.fillStyle = '#71858b'; ctx.fillText(fmt(max * i / 4), 7, y + 4); }
  const start = Date.parse(points[0].day), end = Date.parse(points.at(-1).day);
  const x = p => end === start ? (left + right) / 2 : left + (Date.parse(p.day) - start) / (end - start) * (right - left);
  const y = p => bottom - p.v / max * (bottom - top);
  // Actual dates determine spacing; gaps are dashed, never filled with invented values.
  for (let i = 1; i < points.length; i++) { ctx.strokeStyle = '#267f83'; ctx.lineWidth = 2; ctx.setLineDash(Date.parse(points[i].day) - Date.parse(points[i - 1].day) > 86400000 ? [4, 4] : []); ctx.beginPath(); ctx.moveTo(x(points[i - 1]), y(points[i - 1])); ctx.lineTo(x(points[i]), y(points[i])); ctx.stroke(); }
  ctx.setLineDash([]);
  points.forEach(p => { ctx.fillStyle = p.day === current.day ? '#bb4b63' : '#267f83'; ctx.beginPath(); ctx.arc(x(p), y(p), 4, 0, Math.PI * 2); ctx.fill(); });
  const selected = points.find(p => p.day === current.day);
  if (selected) { ctx.fillStyle = '#263238'; ctx.textAlign = 'center'; ctx.fillText(fmt(selected.v), x(selected), y(selected) - 12); }
  ctx.fillStyle = '#71858b'; ctx.textAlign = 'left'; ctx.fillText(dateLabel(points[0].day), left, 225);
  if (points.length > 1) { ctx.textAlign = 'right'; ctx.fillText(dateLabel(points.at(-1).day), right, 225); }
  $('chartDates').textContent = points.length === 1 ? `Mới có số liệu ngày ${dateLabel(points[0].day)}.` : `${points.length} ngày đã lưu · Đường đứt: ngày chưa có bản lưu.`;
  canvas.onmousemove = e => { const mx = e.clientX - rect.left; const nearest = [...points].sort((a, b) => Math.abs(x(a) - mx) - Math.abs(x(b) - mx))[0]; canvas.title = `${dateLabel(nearest.day)}: ${fmt(nearest.v)} điểm`; };
}
$('current').addEventListener('change', () => { fillBaseline(); render(); });
for (const id of ['baseline', 'group', 'onlyChanged', 'threshold', 'search']) $(id).addEventListener('input', () => { if (id === 'threshold') { try { localStorage.setItem('quality-threshold', String(threshold())); } catch {} } render(); });
$('chartMetric').addEventListener('change', drawChart);
window.addEventListener('resize', drawChart);
$('refresh').addEventListener('click', async () => {
  if (pages) {
    if (offline) { location.reload(); return; }
    $('refresh').disabled = true;
    try { await loadPublished(); }
    catch (error) { lastError = error.message; render(); }
    finally { $('refresh').disabled = false; }
    return;
  }
  if (offline) { notify('Mở ứng dụng qua http://127.0.0.1:8766 để cập nhật trực tiếp.'); return; }
  $('refresh').disabled = true; $('refresh').textContent = 'Đang lấy số liệu...';
  try { const response = await fetch('/api/collect', { method: 'POST' }); const data = await response.json(); if (!response.ok) throw new Error(data.error); snapshots = data.snapshots; today = data.today; lastError = ''; populate(); }
  catch (error) { lastError = error.message; render(); notify(`Cập nhật thất bại: ${error.message}. Dữ liệu đã lưu được giữ lại.`); }
  finally { $('refresh').disabled = false; $('refresh').textContent = '↻ Cập nhật số liệu'; }
});
$('export').addEventListener('click', () => {
  const records = [['Nhóm', 'Chỉ tiêu', 'Ngày đối chiếu', 'Ngày theo dõi', 'Giá trị đối chiếu', 'Giá trị hiện tại', 'Biến động', 'Đơn vị', 'Điểm', 'Điểm tối đa', 'Tử số', 'Mẫu số', 'Ghi chú nguồn'], ...rows.map(m => [m.group.name, m.name, $('baseline').value, $('current').value, m.before, m.after, m.delta, m.unit, m.score, m.maxScore, m.numerator, m.denominator, m.dataQualityMessage])];
  const csvCell = v => { let s = String(v ?? ''); if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const blob = new Blob(['\ufeff' + records.map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `chat-luong-ha-noi-${$('current').value}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
populate();
async function loadPublished() {
  const response = await fetch(`data/quality-history.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Không tải được số liệu đã công bố');
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('Số liệu công bố không hợp lệ');
  snapshots = data; lastError = ''; populate($('current').value);
}
if (!offline && pages) loadPublished().catch(error => { lastError = error.message; render(); });
if (!offline && !pages) fetch('/api/history').then(async response => { if (!response.ok) throw new Error('Không tải được lịch sử'); return response.json(); }).then(data => { snapshots = data.snapshots; today = data.today; lastError = data.lastError || ''; populate(); }).catch(error => { lastError = error.message; render(); });
