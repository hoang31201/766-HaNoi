(() => {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const number = v => typeof v === 'number' && Number.isFinite(v);
  const fmt = v => number(v) ? v.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : '—';
  const date = v => v.split('-').reverse().join('/');
  let context, chart, activeTab = 'overview', range = 'all', currentRows = [], lastCode = '';
  const model = window.UnitLeaderModel;
  const labels = { temporary: 'Số liệu tạm', empty: 'Không phát sinh', unknown: 'Chưa có đối chiếu', red: 'Suy giảm vượt ngưỡng', yellow: 'Suy giảm nhẹ', normal: 'Trong ngưỡng' };
  const badge = status => `<span class="status-tag ${status === 'red' ? 'red' : status === 'yellow' ? 'yellow' : status === 'normal' ? 'green' : 'unknown'}">${labels[status]}</span>`;
  function showTab(tab) {
    activeTab = tab;
    $('export').hidden = tab !== 'criteria';
    for (const [key, title] of [['overview', 'Overview'], ['criteria', 'Criteria'], ['trend', 'Trend']]) {
      $(`unit${title}Panel`).hidden = key !== tab;
      $(`unit${title}Tab`).setAttribute('aria-selected', String(key === tab));
      $(`unit${title}Tab`).tabIndex = key === tab ? 0 : -1;
    }
    if (tab === 'trend') draw();
  }
  const metricValue = m => m?.unit === '%' ? (m.denominator === 0 ? null : m.ratio) : m?.value;
  const delta = (a, b) => number(a) && number(b) ? Math.round((a - b) * 100) / 100 : null;
  const metricKey = (g, m) => `${g}:${m}`;
  window.renderUnitDetail = state => {
    context = state;
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const code = params.get('unit');
    window.unitDetailExport = null;
    const unit = state.current?.departments.find(d => d.code === code);
    const selection = $('unitChooser').value;
    $('unitChooser').innerHTML = '<option value="">Chọn đơn vị...</option>' + ['AGENCY', 'COMMUNE', 'OTHER'].map(type => `<optgroup label="${type === 'AGENCY' ? 'Sở, ngành và cơ quan' : type === 'COMMUNE' ? 'Xã, phường' : 'Khác'}">${(state.current?.departments || []).filter(d => type === 'OTHER' ? !['AGENCY', 'COMMUNE'].includes(d.type) : d.type === type).sort((a, b) => a.name.localeCompare(b.name, 'vi')).map(d => `<option value="${esc(d.code)}">${esc(d.name)}</option>`).join('')}</optgroup>`).join('');
    $('unitChooser').value = code || selection;
    $('unitCapture').textContent = state.current ? `${date(state.current.day)} · ${state.current.importedAt ? 'Bản nhập từ nguồn phụ' : new Date(state.current.capturedAt).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })}` : 'Chưa có dữ liệu';
    document.querySelector('.shell').classList.toggle('unit-view', !!code);
    $('unitPage').hidden = !code;
    if (!code) { chart?.destroy(); chart = null; return; }
    if (code !== lastCode) { activeTab = 'overview'; lastCode = code; }
    $('historyPage').hidden = true;
    document.querySelector('h1').textContent = unit?.name || 'Chi tiết đơn vị';
    document.title = `${unit?.name || 'Chi tiết đơn vị'} · Hà Nội`;
    $('unitBack').href = `#units?day=${encodeURIComponent(state.current?.day || '')}`;
    if (params.get('fromBranch')) $('unitBack').href = `#branches?day=${encodeURIComponent(state.current?.day || '')}&branch=${encodeURIComponent(params.get('fromBranch'))}`;
    if (!unit) { for (const id of ['unitKpis', 'unitGroupSummary', 'unitQualityNote', 'unitPriorityCount']) $(id).textContent = ''; $('unitPriorities').innerHTML = '<tr><td colspan="5">Đơn vị không có trong bản lưu này.</td></tr>'; $('unitDetailRows').innerHTML = '<tr><td colspan="5">Đơn vị không có trong bản lưu này.</td></tr>'; $('unitMetric').innerHTML = ''; chart?.destroy(); chart = null; showTab('overview'); return; }
    try { localStorage.setItem('quality-leader-unit', code); } catch {}
    const prior = state.baseline?.departments.find(d => d.code === code);
    const groups = Object.values(unit.groupDetails || {}).filter(Boolean);
    $('unitGroupSummary').innerHTML = state.current.groups.map(g => {
      const change = delta(unit.groupScores?.[g.code]?.score, prior?.groupScores?.[g.code]?.score);
      return `<article class="group"><h3>${esc(g.name)}</h3><strong>${fmt(unit.groupScores?.[g.code]?.score)}</strong><small> / ${fmt(unit.groupScores?.[g.code]?.maxScore)}</small><p class="${number(change) && change < 0 ? 'bad' : 'neutral'}">${number(change) ? (change > 0 ? '+' : '') + fmt(change) + ' điểm' : 'Chưa có đối chiếu'}</p></article>`;
    }).join('');
    const change = delta(unit.score, prior?.score);
    const term = $('unitMetricSearch').value.trim().toLocaleLowerCase('vi');
    const selectedGroup = $('group').value;
    const rows = model.analyze(unit, prior, state.threshold); currentRows = rows;
    const peer = model.rank(unit, state.current.departments), drops = rows.filter(r => ['red', 'yellow'].includes(r.status));
    $('unitKpis').innerHTML = `<span><small>Điểm tổng hợp</small><strong>${fmt(unit.score)} <small>/ ${fmt(state.current.totalMaxScore)}</small></strong></span><span><small>So với ${state.baseline ? date(state.baseline.day) : 'hôm qua'}</small><strong class="${number(change) && change < 0 ? 'bad' : 'neutral'}">${number(change) ? (change > 0 ? '+' : '') + fmt(change) + ' điểm' : 'Chưa đủ dữ liệu'}</strong></span><span><small>Thứ hạng trong ${unit.type === 'COMMUNE' ? 'xã, phường' : unit.type === 'AGENCY' ? 'sở, ngành' : 'nhóm đơn vị'}</small><strong>${fmt(peer.rank)} <small>/ ${peer.count}</small></strong></span><span><small>Tiêu chí suy giảm</small><strong>${prior?.groupDetails ? drops.length : '—'}</strong><small>${prior?.groupDetails ? drops.filter(r => r.status === 'red').length + ' vượt ngưỡng' : 'Chưa có đối chiếu chi tiết'}</small></span>`;
    const priorities = model.priorities(rows);
    $('unitPriorityCount').textContent = `${priorities.length} tiêu chí`;
    $('unitPriorityNote').textContent = !prior?.groupDetails ? 'Chưa đủ dữ liệu để đối chiếu. Danh sách dưới là tiêu chí còn thiếu điểm, không phải cảnh báo suy giảm.' : drops.length ? `${drops.length} tiêu chí suy giảm. Ngưỡng cảnh báo: ${state.threshold} điểm hoặc điểm phần trăm (ngày đối với thời gian xử lý).` : 'Chưa ghi nhận suy giảm đủ điều kiện; danh sách dưới là tiêu chí còn thiếu điểm, không phải cảnh báo giảm.';
    $('unitPriorities').innerHTML = priorities.map(r => `<tr><td><small>${esc(r.g.name)}</small><button class="metric-link" data-inspect="${esc(r.key)}">${esc(r.m.name)}</button></td><td>${fmt(r.m.score)} / ${fmt(r.m.maxScore)}</td><td>${['red', 'yellow'].includes(r.status) ? (number(r.scoreDelta) && r.scoreDelta !== 0 ? fmt(r.scoreDelta) + ' điểm' : fmt(r.rateDelta) + (r.m.unit === '%' ? ' điểm %' : ' ' + esc(r.m.unit))) : r.status === 'unknown' ? 'Chưa đủ đối chiếu' : 'Chưa ghi nhận suy giảm'}</td><td>${fmt(r.deficit)} điểm</td><td>${['red', 'yellow'].includes(r.status) ? badge(r.status) : '<span class="status-tag unknown">Chưa đạt tối đa</span>'}</td></tr>`).join('') || '<tr><td colspan="5">Không có tiêu chí cần ưu tiên từ dữ liệu hiện có.</td></tr>';
    $('unitQualityNote').textContent = `${groups.length}/6 nhóm có chi tiết · ${rows.filter(r => r.status === 'temporary').length} tiêu chí có số liệu tạm · ${rows.filter(r => r.status === 'empty').length} tiêu chí không phát sinh. Xếp hạng do ứng dụng tính trong cùng nhóm, các đơn vị bằng điểm cùng hạng.`;
    for (const record of [unit, prior].filter(d => number(d?.sourceScoreDiscrepancy))) $('unitQualityNote').textContent += ` Nguồn phụ có điểm tổng lệch tổng 6 nhóm ${fmt(record.sourceScoreDiscrepancy)} điểm; số liệu giữ nguyên theo nguồn, cần xác minh.`;
    const filtered = rows.filter(r => (selectedGroup === 'all' || r.g.code === selectedGroup) && r.m.name.toLocaleLowerCase('vi').includes(term) && ($('unitStatus').value === 'all' || r.status === $('unitStatus').value) && (!$('onlyChanged').checked || (number(r.scoreDelta) && r.scoreDelta !== 0) || (number(r.rateDelta) && r.rateDelta !== 0)));
    window.unitDetailExport = [['Đơn vị', 'Ngày', 'Nhóm', 'Tiêu chí', 'Điểm', 'Điểm tối đa', 'Tỷ lệ / giá trị', 'Tử số', 'Mẫu số', 'Thay đổi điểm', 'Thay đổi tỷ lệ / giá trị', 'Trạng thái', 'Ghi chú'], ...filtered.map(r => [unit.name, state.current.day, r.g.name, r.m.name, r.m.score, r.m.maxScore, metricValue(r.m), r.m.numerator, r.m.denominator, r.scoreDelta, r.rateDelta, labels[r.status], r.m.dataQualityMessage])];
    $('unitDetailCount').textContent = `${filtered.length} / ${rows.length} chỉ tiêu`;
    $('unitDetailRows').innerHTML = filtered.map(r => `<tr><td><small>${esc(r.g.name)}</small><details><summary>${esc(r.m.name)}</summary><div class="metric-evidence"><p>Giá trị: ${r.m.denominator === 0 ? 'Không phát sinh' : fmt(metricValue(r.m)) + ' ' + esc(r.m.unit)}</p><p>Tử số / mẫu số: ${fmt(r.m.numerator)} / ${fmt(r.m.denominator)}</p>${r.m.dataQualityMessage ? `<p class="warning">${esc(r.m.dataQualityMessage)}</p>` : ''}<button class="metric-link" data-metric="${esc(r.key)}">Xem diễn biến</button></div></details></td><td>${fmt(r.m.score)} / ${fmt(r.m.maxScore)}</td><td>${fmt(r.scoreDelta)} điểm</td><td>${fmt(r.rateDelta)} ${r.m.unit === '%' ? 'điểm %' : esc(r.m.unit)}</td><td>${badge(r.status)}</td></tr>`).join('') || '<tr><td colspan="5">Chưa có chỉ tiêu phù hợp trong bản lưu này.</td></tr>';
    const selected = $('unitMetric').value;
    $('unitMetric').innerHTML = '<option value="total">Điểm tổng hợp</option>' + state.current.groups.map(g => `<option value="group:${esc(g.code)}">${esc(g.name)} (điểm)</option>`).join('') + rows.map(r => `<option value="${esc(r.key)}">${esc(r.m.name)} (${esc(r.m.unit)})</option>`).join('');
    if ([...$('unitMetric').options].some(o => o.value === selected)) $('unitMetric').value = selected;
    $('unitDetailNote').textContent = groups.length ? `Kỳ lũy kế năm ${state.current.period.year}. Biến động giữa các bản lưu không phải số hồ sơ phát sinh trong ngày. ${rows.filter(r => r.status === 'temporary').length} chỉ tiêu có số liệu tạm. ${prior && !prior.groupDetails ? 'Ngày đối chiếu chưa lưu chi tiết tiêu chí.' : ''}` : 'Bản lưu này chỉ có điểm nhóm, chưa có chi tiết tiêu chí. Chọn ngày đã cào chi tiết.';
    showTab(activeTab);
  };
  function draw() {
    chart?.destroy(); chart = null;
    if (!context || !window.Chart) return;
    const code = new URLSearchParams(location.hash.split('?')[1] || '').get('unit');
    if (!code) return;
    const key = $('unitMetric').value;
    const [groupCode, metricCode] = key.split(':');
    const minimum = range === 'all' ? -Infinity : Date.parse(context.current.day) - (Number(range) - 1) * 86400000;
    const data = context.snapshots.filter(s => s.period.year === context.current?.period.year && s.day <= context.current.day && Date.parse(s.day) >= minimum).map(s => {
      const d = s.departments.find(u => u.code === code);
      const m = d?.groupDetails?.[groupCode]?.metrics.find(v => v.code === metricCode);
      return { day: s.day, value: key === 'total' ? d?.score : groupCode === 'group' ? d?.groupScores?.[metricCode]?.score : metricValue(m) };
    });
    const count = data.filter(d => number(d.value)).length;
    $('unitTrendCount').textContent = `${count} ngày đủ số liệu${count < 2 ? ' · Chưa đủ để đánh giá xu hướng' : ''}`;
    const start = Date.parse(data[0]?.day || context.current.day);
    const unitLabel = key === 'total' || groupCode === 'group' ? 'điểm' : currentRows.find(r => r.key === key)?.m.unit || '';
    chart = new Chart($('unitMetricChart'), { type: 'line', data: { datasets: [{ label: $('unitMetric').selectedOptions[0]?.textContent, data: data.map(d => ({ x: (Date.parse(d.day) - start) / 86400000, y: number(d.value) ? d.value : null })), borderColor: '#26798a', backgroundColor: '#26798a', pointRadius: 4, spanGaps: false, segment: { borderDash: c => c.p1.parsed.x - c.p0.parsed.x > 1 ? [5, 5] : undefined } }] }, options: { responsive: true, maintainAspectRatio: false, animation: false, parsing: false, scales: { y: { title: { display: true, text: unitLabel } }, x: { type: 'linear', ticks: { stepSize: 1, callback: v => data.some(d => (Date.parse(d.day) - start) / 86400000 === v) ? date(new Date(start + v * 86400000).toISOString().slice(0, 10)) : '', maxTicksLimit: 6 } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { title: items => date(new Date(start + items[0].parsed.x * 86400000).toISOString().slice(0, 10)), label: item => `${fmt(item.parsed.y)} ${unitLabel}` } } } } });
  }
  $('unitMetric').addEventListener('change', draw);
  for (const id of ['unitMetricSearch', 'unitStatus']) $(id).addEventListener('input', () => context && window.renderUnitDetail(context));
  $('unitDetailRows').addEventListener('click', event => { const button = event.target.closest('[data-metric]'); if (button) { $('unitMetric').value = button.dataset.metric; showTab('trend'); } });
  $('unitPriorities').addEventListener('click', event => { const button = event.target.closest('[data-inspect]'); if (button) { $('group').value = 'all'; $('unitStatus').value = 'all'; $('onlyChanged').checked = false; $('unitMetricSearch').value = currentRows.find(r => r.key === button.dataset.inspect)?.m.name || ''; activeTab = 'criteria'; window.renderUnitDetail(context); } });
  document.querySelector('.unit-tabs').addEventListener('click', event => { const button = event.target.closest('[data-unit-tab]'); if (button) showTab(button.dataset.unitTab); });
  document.querySelector('.unit-tabs').addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const tabs = ['overview', 'criteria', 'trend']; const index = tabs.indexOf(activeTab); showTab(event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[2] : tabs[(index + (event.key === 'ArrowRight' ? 1 : 2)) % 3]); document.querySelector(`[data-unit-tab="${activeTab}"]`).focus(); });
  document.querySelector('.range-buttons').addEventListener('click', event => { const button = event.target.closest('[data-unit-range]'); if (button) { range = button.dataset.unitRange; document.querySelectorAll('[data-unit-range]').forEach(b => b.setAttribute('aria-pressed', String(b === button))); draw(); } });
  $('unitChooser').addEventListener('change', () => { if (!$('unitChooser').value) location.hash = 'overview'; else if (context?.current) location.hash = `history?day=${context.current.day}&unit=${encodeURIComponent($('unitChooser').value)}`; });
})();
