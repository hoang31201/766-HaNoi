(() => {
  const $ = id => document.getElementById(id), model = window.BranchModel, mapping = window.BRANCH_ASSIGNMENTS;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const fmt = v => finite(v) ? v.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  const dayLabel = d => d?.split('-').reverse().join('/') || '—';
  const href = (day, id) => `#branches?day=${encodeURIComponent(day)}${id ? '&branch=' + encodeURIComponent(id) : ''}`;
  const delta = v => finite(v) ? `<span class="${v < 0 ? 'bad' : v > 0 ? 'good' : 'neutral'}">${v > 0 ? '+' : ''}${fmt(v)}</span>` : '<span class="neutral">—</span>';
  const scoreCell = m => `<span class="branch-score ${finite(m.score) && m.max ? m.score / m.max < .5 ? 'bad' : m.score / m.max < .7 ? 'branch-yellow' : '' : 'neutral'}">${fmt(m.score)}</span>`;
  let context, chart, lastBranch = '';
  function render(state) {
    context = state;
    const active = location.hash.split('?')[0] === '#branches';
    $('branchPage').hidden = !active;
    if (!active) { chart?.destroy(); chart = null; return; }
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const id = params.get('branch');
    if (id !== lastBranch) { $('branchSearch').value = ''; lastBranch = id; }
    const current = state.current;
    const groups = current?.groups || state.snapshots.at(-1)?.groups || [];
    const selected = $('branchGroup').value || 'all';
    $('branchGroup').innerHTML = '<option value="all">Điểm tổng hợp</option>' + groups.map(g => `<option value="${esc(g.code)}">${esc(g.name)}</option>`).join('');
    if (groups.some(g => g.code === selected)) $('branchGroup').value = selected;
    const group = $('branchGroup').value;
    $('branchBack').href = href(current?.day || params.get('day') || '');
    $('branchBack').hidden = !id;
    $('branchDetail').hidden = !id;
    $('branchList').hidden = !!id;
    const prior = state.snapshots.find(s => s.day === (current ? model.previousDay(current.day) : ''));
    const comparable = model.comparable(current, prior, mapping);
    const rank = model.ranking(current, mapping, group);
    const priorRank = comparable ? model.ranking(prior, mapping, group) : [];
    const sameRankSet = comparable && rank.filter(r => r.complete).map(r => r.id).sort().join() === priorRank.filter(r => r.complete).map(r => r.id).sort().join();
    const count = rank.filter(r => r.complete).length;
    $('branchCoverage').textContent = `${count}/12 chi nhánh đủ điểm · 126 xã/phường · Áp dụng từ 01/10/2026`;
    const notes = [];
    if (!current) notes.push('Chưa có bản lưu của ngày đã chọn.');
    if (current && !comparable) notes.push(`Chưa đủ đối chiếu ngày ${dayLabel(model.previousDay(current.day))}.`);
    if (['unchanged', 'incomplete'].includes(current?.freshness?.status)) notes.push('Đang chờ xác minh dữ liệu nguồn mới; chưa đánh giá biến động.');
    for (const s of [current, prior].filter(Boolean)) if (s.source) notes.push(`${dayLabel(s.day)}: ${s.source.name}.`);
    if (comparable && (current.source || prior.source)) notes.push('Biến động có nguồn phụ chỉ mang tính tham khảo.');
    if (count < 12) notes.push('Thứ hạng tạm trong các chi nhánh đủ dữ liệu; không loại xã/phường thiếu điểm khỏi mẫu số.');
    $('branchNotice').textContent = notes.join(' '); $('branchNotice').hidden = !notes.length;
    $('updated').textContent = current ? `Bản lưu ${dayLabel(current.day)} · ${new Date(current.capturedAt).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })}` : 'Chưa có số liệu';
    document.querySelector('header .actions a').href = current?.source?.url || 'https://dichvucong.gov.vn/danh-gia-chat-luong-phuc-vu';
    $('notice').hidden = !state.lastError; $('notice').textContent = state.lastError || '';
    $('branchSource').textContent = 'Điểm trung bình các xã/phường, mỗi đơn vị tính một lần. Phân công theo tên điểm hỗ trợ trong PLQĐ127.pdf; áp dụng từ 01/10 theo xác nhận của người dùng. Không phải bộ điểm 766 riêng của chi nhánh. Đồng hạng theo điểm hiển thị 2 chữ số thập phân.';
    const term = $('branchSearch').value.trim().toLocaleLowerCase('vi');
    $('branchRows').innerHTML = rank.filter(r => (`Chi nhánh ${r.id}`).toLocaleLowerCase('vi').includes(term)).map(r => {
      const old = priorRank.find(p => p.id === r.id), change = model.change(r, old);
      const watches = r.entries.filter(e => finite(e.score) && e.max && e.score / e.max < .7).length;
      const rankChange = sameRankSet && finite(r.rank) && finite(old?.rank) ? old.rank - r.rank : null;
      return `<tr><td>${r.rank ?? '—'}</td><td><a href="${href(current?.day || '', r.id)}">Chi nhánh ${r.id}</a></td><td>${scoreCell(r)}${r.max ? `<small>/ ${fmt(r.max)}</small>` : ''}</td><td>${delta(change)}</td><td>${finite(rankChange) ? `<span class="${rankChange < 0 ? 'bad' : rankChange > 0 ? 'good' : 'neutral'}">${rankChange > 0 ? '+' : ''}${rankChange} bậc</span>` : '—'}</td><td>${r.coverage}/${r.count}</td><td>${watches ? `<span class="branch-yellow">${watches} dưới 70%</span>` : '—'}</td></tr>`;
    }).join('') || '<tr><td colspan="7">Không có chi nhánh phù hợp.</td></tr>';
    if (!id) { chart?.destroy(); chart = null; document.querySelector('h1').textContent = 'Xếp hạng địa bàn chi nhánh'; return; }
    const branch = mapping.branches.find(b => b.id === id);
    document.querySelector('h1').textContent = `Chi nhánh ${id} · Điểm địa bàn`;
    if (!branch) { $('branchDetail').hidden = true; $('branchNotice').hidden = false; $('branchNotice').textContent = 'Chi nhánh không tồn tại trong bảng phân công.'; return; }
    const aggregate = model.aggregate(branch, current, mapping, group);
    const oldAggregate = comparable ? model.aggregate(branch, prior, mapping, group) : null;
    $('branchKpis').innerHTML = `<span><small>${group === 'all' ? 'Điểm trung bình địa bàn' : esc(groups.find(g => g.code === group)?.name)}</small><strong>${fmt(aggregate.score)} <small>/ ${fmt(aggregate.max)}</small></strong></span><span><small>So với ${dayLabel(current ? model.previousDay(current.day) : '')}</small><strong>${delta(model.change(aggregate, oldAggregate))}</strong></span><span><small>Xã/phường đủ điểm</small><strong>${aggregate.coverage}/${aggregate.count}</strong></span>`;
    $('branchGroups').innerHTML = groups.map(g => { const m = model.aggregate(branch, current, mapping, g.code); return `<article class="group"><h3>${esc(g.name)}</h3><strong>${fmt(m.score)}</strong><small> / ${fmt(m.max)}</small><p class="neutral">${m.coverage}/${m.count} xã/phường</p></article>`; }).join('');
    $('branchUnitHead').innerHTML = '<th>STT</th><th>Xã/phường</th><th>Điểm tổng</th>' + groups.map(g => `<th>${esc(g.name)}<small>/ ${fmt(g.maxScore)}</small></th>`).join('') + '<th>Biến động</th>';
    const entries = branch.codes.map(code => {
      const unit = current?.departments.find(u => u.code === code);
      const known = unit || state.snapshots.flatMap(s => s.departments || []).find(u => u.code === code);
      return { code, unit, name: known?.name || code, ...model.measure(unit, current, group) };
    }).sort((a, b) => (finite(a.score) ? 0 : 1) - (finite(b.score) ? 0 : 1) || (b.score ?? 0) - (a.score ?? 0) || a.name.localeCompare(b.name, 'vi'));
    $('branchUnitRows').innerHTML = entries.filter(e => e.name.toLocaleLowerCase('vi').includes(term)).map((e, i) => {
      const old = comparable ? model.measure(prior.departments.find(u => u.code === e.code), prior, group) : null;
      return `<tr><td>${i + 1}</td><td><a href="#history?day=${encodeURIComponent(current?.day || '')}&unit=${encodeURIComponent(e.code)}&fromBranch=${encodeURIComponent(id)}">${esc(e.name)}</a></td><td>${scoreCell(model.measure(e.unit, current))}</td>${groups.map(g => `<td${g.code === group ? ' class="selected-day"' : ''}>${scoreCell(model.measure(e.unit, current, g.code))}</td>`).join('')}<td>${delta(model.change(e, old))}</td></tr>`;
    }).join('') || `<tr><td colspan="${groups.length + 4}">Không có xã/phường phù hợp.</td></tr>`;
    $('branchUnitCount').textContent = `${entries.filter(e => e.name.toLocaleLowerCase('vi').includes(term)).length}/${branch.codes.length} xã/phường`;
    drawTrend(branch, state, group, groups);
  }
  function drawTrend(branch, state, group, groups) {
    chart?.destroy(); chart = null;
    if (!window.Chart || !state.current) return;
    const points = [], end = state.current.day;
    for (let day = mapping.effectiveFrom; day <= end; day = new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10)) {
      const s = state.snapshots.find(s => s.day === day && model.samePeriod(s, state.current));
      points.push({ day, score: ['unchanged', 'incomplete'].includes(s?.freshness?.status) ? null : model.aggregate(branch, s, mapping, group).score });
    }
    $('branchTrendNote').textContent = `${points.filter(p => finite(p.score)).length} ngày đủ dữ liệu · Khoảng trống: chưa có số liệu hợp lệ.`;
    chart = new Chart($('branchChart'), { type: 'line', data: { labels: points.map(p => dayLabel(p.day)), datasets: [{ label: group === 'all' ? 'Điểm tổng hợp' : groups.find(g => g.code === group)?.name, data: points.map(p => p.score), borderColor: '#136d66', pointRadius: 4, tension: 0, spanGaps: false }] }, options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, suggestedMax: group === 'all' ? state.current.totalMaxScore : groups.find(g => g.code === group)?.maxScore } } } });
  }
  $('branchGroup').addEventListener('change', () => context && render(context));
  $('branchSearch').addEventListener('input', () => context && render(context));
  window.renderBranchPage = render;
})();
