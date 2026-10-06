(function () {
  const $ = id => document.getElementById(id), model = window.QualityMapModel;
  const number = n => typeof n === 'number' && Number.isFinite(n);
  const fmt = n => number(n) ? new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(n) : '—';
  const date = day => day?.split('-').reverse().join('/') || '—';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const palette = { red: '#c84455', yellow: '#e2b441', green: '#4d9476', unknown: '#b9c3c9' };
  const labels = { red: 'Cần chú ý', yellow: 'Theo dõi', green: 'Trong ngưỡng', unknown: 'Chưa đủ số liệu' };
  let map, regions, outline, allBounds, context, entries = [], selected = '', bars, trend;
  const layers = new Map();
  const change = n => number(n) ? `${n > 0 ? '+' : ''}${fmt(n)} điểm` : 'Chưa có đối chiếu';
  const score = v => `${fmt(v.score)} / ${fmt(v.maxScore)}`;
  function options() {
    const red = $('mapRed').value === '' ? 50 : Number($('mapRed').value), yellow = $('mapYellow').value === '' ? 70 : Number($('mapYellow').value);
    const invalid = !Number.isFinite(red) || !Number.isFinite(yellow) || red < 0 || yellow > 100 || red >= yellow;
    return { mode: $('mapMode').value, threshold: context.threshold, totalMax: context.current.totalMaxScore, priorMax: context.baseline?.totalMaxScore,
      red: invalid ? 50 : red, yellow: invalid ? 70 : yellow, invalid };
  }
  function initialize() {
    if (!window.L || !window.HANOI_BOUNDARIES || !window.Chart || !model) {
      $('mapNotice').hidden = false; $('mapNotice').textContent = 'Không tải được bản đồ hoặc thư viện. Số liệu trong bảng vẫn có thể xem bình thường.'; return false;
    }
    if (map) return true;
    map = L.map('hanoiMap', { scrollWheelZoom: false, minZoom: 7, maxZoom: 16, zoomSnap: 0.25, zoomAnimation: false, fadeAnimation: false });
    map.zoomControl.setPosition('topleft');
    $('hanoiMap').querySelector('.leaflet-control-zoom-in').title = 'Phóng to'; $('hanoiMap').querySelector('.leaflet-control-zoom-out').title = 'Thu nhỏ';
    L.control.scale({ imperial: false }).addTo(map);
    map.attributionControl.addAttribution('<a href="https://github.com/thanglequoc/vietnamese-provinces-database">Ranh giới: VPDB · MIT</a>');
    outline = L.geoJSON(window.HANOI_BOUNDARIES.city, { interactive: false, style: { color: '#526970', weight: 2, fillColor: '#e8edef', fillOpacity: 0.25 } }).addTo(map);
    allBounds = outline.getBounds();
    map.fitBounds(allBounds, { padding: [22, 22], animate: false });
    window.lucide?.createIcons();
    new ResizeObserver(() => { map.invalidateSize(); map.fitBounds(layers.get(selected)?.getBounds() || allBounds, { padding: [22, 22], maxZoom: selected ? 13 : 16, animate: false }); }).observe($('hanoiMap'));
    return true;
  }
  function popup(entry) {
    const { unit, feature, value } = entry;
    const content = document.createElement('div'); content.className = 'kpi-popup';
    content.innerHTML = `<h3>${escape(feature.properties.name)}</h3><p>${date(context.current.day)} · ${escape(context.groupName)}</p><strong>${score(value)}</strong><p>${change(value.delta)}</p><span class="status-tag ${value.status}">${labels[value.status]}</span><p>Điểm tổng hợp: ${fmt(unit?.score)} / ${fmt(context.current.totalMaxScore)}</p>`;
    if (unit) {
      const button = document.createElement('button'); button.textContent = 'Xem KPI địa bàn';
      button.addEventListener('click', () => selectUnit(unit.code, false)); content.append(button);
      const link = document.createElement('a'); link.textContent = 'Chi tiết tiêu chí'; link.href = `#history?day=${encodeURIComponent(context.current.day)}&unit=${encodeURIComponent(unit.code)}`; content.append(document.createElement('br'), link);
    }
    return content;
  }
  function selectUnit(code, openPopup = true) {
    selected = code; $('mapUnit').value = code;
    const layer = layers.get(code);
    if (layer) { map.fitBounds(layer.getBounds(), { padding: [30, 30], maxZoom: 13, animate: false }); if (openPopup) layer.openPopup(); }
    highlight();
    detail();
  }
  function highlight() {
    regions?.eachLayer(layer => { const active = layer.feature.properties.unitCode === selected; layer.setStyle({ weight: active ? 3 : 1, color: active ? '#263c43' : '#fff' }); });
  }
  function detail() {
    const entry = entries.find(e => e.unit?.code === selected), unit = entry?.unit;
    const { current, baseline, group, snapshots } = context;
    const opts = options();
    const cityUnit = s => s ? { score: s.totalScore, groupScores: Object.fromEntries(s.groups.map(g => [g.code, g])) } : null;
    const value = entry?.value || model.evaluate(cityUnit(current), cityUnit(baseline), group, opts);
    $('mapDetailTitle').textContent = entry?.feature.properties.name || 'Toàn Hà Nội';
    $('mapDetailDay').textContent = date(current.day);
    $('mapKpis').innerHTML = `<div><span>${escape(context.groupName)}</span><strong>${score(value)}</strong></div><div><span>So với ${date(baseline?.day)}</span><strong class="${number(value.delta) && value.delta < 0 ? 'bad' : 'neutral'}">${change(value.delta)}</strong></div>`;
    $('mapDetail').innerHTML = `<span class="status-tag ${value.status}">${labels[value.status]}</span><span>${fmt(value.ratio)}% điểm tối đa${entry ? ` · ${fmt(entry.feature.properties.areaKm2)} km²` : ''}</span>`;
    const groupValues = current.groups.map(g => ({ name: g.name, ...model.points(unit || cityUnit(current), g.code) }));
    bars?.destroy();
    bars = new Chart($('unitGroupsChart'), {
      type: 'bar', data: { labels: groupValues.map(g => g.name), datasets: [{ data: groupValues.map(g => number(g.score) && g.maxScore > 0 ? g.score / g.maxScore * 100 : null), backgroundColor: ['#26798a', '#46865a', '#7662a0', '#b68127', '#bc5268', '#388c89'], borderRadius: 2 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${score(groupValues[c.dataIndex])} điểm` } } }, scales: { x: { min: 0, max: 100, ticks: { callback: v => v + '%' } }, y: { grid: { display: false }, ticks: { font: { size: 10 } } } } }
    });
    const history = snapshots.filter(s => s.period.year === current.period.year && s.day <= current.day).sort((a, b) => a.day.localeCompare(b.day));
    const historyPoints = history.map(s => ({ day: s.day, value: model.points(unit ? s.departments.find(d => d.code === unit.code) : cityUnit(s), group, s.totalMaxScore).score }));
    // Numeric day coordinates preserve real gaps, including days without any snapshot.
    const start = Date.parse(historyPoints[0]?.day || current.day), dayMs = 86400000;
    trend?.destroy();
    trend = new Chart($('unitTrendChart'), {
      type: 'line', data: { datasets: [{ data: historyPoints.map(p => ({ x: (Date.parse(p.day) - start) / dayMs, y: number(p.value) ? p.value : null })), borderColor: '#26798a', backgroundColor: '#26798a', pointRadius: 4, borderWidth: 2, spanGaps: false, segment: { borderDash: c => c.p1.parsed.x - c.p0.parsed.x > 1 ? [4, 4] : undefined } }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, tooltip: { callbacks: { title: items => date(new Date(start + items[0].parsed.x * dayMs).toISOString().slice(0, 10)), label: item => `${fmt(item.parsed.y)} điểm` } } }, scales: { x: { type: 'linear', ticks: { maxTicksLimit: 3, stepSize: 1, callback: v => historyPoints.some(p => (Date.parse(p.day) - start) / dayMs === v) ? date(new Date(start + v * dayMs).toISOString().slice(0, 10)).slice(0, 5) : '' }, grid: { display: false } }, y: { min: 0, max: value.maxScore || 100, ticks: { maxTicksLimit: 4 } } } }
    });
    const count = historyPoints.filter(p => number(p.value)).length;
    $('mapTrendNote').textContent = count === 0 ? 'Chưa có điểm nhóm này trong các bản lưu.' : count === 1 ? 'Mới có 1 ngày đủ số liệu; chưa xác định được xu hướng.' : `${count} ngày đủ số liệu · Đường đứt: ngày chưa có bản lưu.`;
  }
  function render() {
    if (!context?.current) {
      regions?.clearLayers(); bars?.destroy(); trend?.destroy(); bars = trend = null;
      selected = ''; map?.closePopup(); $('mapUnit').innerHTML = '<option value="">Toàn Hà Nội</option>';
      $('mapDetailTitle').textContent = 'Toàn Hà Nội';
      for (const id of ['mapCoverage', 'mapLegend', 'mapKpis', 'mapDetail', 'mapAlerts', 'mapAlertCount', 'mapTrendNote', 'mapDetailDay', 'mapRule']) $(id).textContent = '';
      $('mapNotice').hidden = false; $('mapNotice').textContent = 'Chưa có số liệu để tô màu địa bàn.'; return;
    }
    if (!initialize()) return;
    $('mapGroup').innerHTML = '<option value="all">Tất cả nhóm</option>' + context.current.groups.map(g => `<option value="${escape(g.code)}">${escape(g.name)}</option>`).join('');
    $('mapGroup').value = context.group;
    const opts = options(), messages = [];
    if (opts.invalid && opts.mode === 'score') messages.push('Ngưỡng phải nằm trong 0–100% và ngưỡng vàng phải lớn hơn ngưỡng đỏ. Đang dùng mặc định: đỏ dưới 50%, vàng dưới 70%.');
    const paired = model.join(window.HANOI_BOUNDARIES.features, context.current.departments);
    entries = paired.map(e => ({ ...e, value: model.evaluate(e.unit, context.baseline?.departments.find(d => d.code === e.unit?.code), context.group, opts) }));
    const matched = entries.filter(e => e.unit).length;
    if (matched !== 126) messages.push(`${126 - matched} địa bàn chưa ghép được với số liệu; không gán điểm của đơn vị khác.`);
    if (opts.mode === 'delta' && !context.baseline) messages.push('Chưa có ngày đối chiếu. Địa bàn hiển thị xám, không suy đoán tăng/giảm.');
    const search = model.key($('mapSearch').value), type = $('mapType').value, status = $('mapStatus').value;
    const matches = entries.filter(e => (!search || model.key(e.feature.properties.name).includes(search)) && (type === 'all' || model.key(e.feature.properties.name).startsWith(type + ' ')) && (status === 'all' || e.value.status === status));
    const codes = new Set(matches.map(e => e.feature.id));
    if (!matches.length) messages.push('Không có địa bàn phù hợp với bộ lọc.');
    if (selected && !matches.some(e => e.unit?.code === selected)) selected = '';
    $('mapUnit').innerHTML = '<option value="">Toàn Hà Nội</option>' + matches.filter(e => e.unit).sort((a, b) => a.unit.name.localeCompare(b.unit.name, 'vi')).map(e => `<option value="${escape(e.unit.code)}">${escape(e.feature.properties.name)}</option>`).join('');
    $('mapUnit').value = selected;
    $('mapCoverage').textContent = `${matches.length} / 126 địa bàn · ${matched} đã ghép số liệu`;
    $('mapRule').textContent = opts.mode === 'score' ? `${context.groupName} · % điểm tối đa` : `Đỏ: giảm ≥ ${fmt(opts.threshold * 2)} điểm · Vàng: giảm ≥ ${fmt(opts.threshold)} điểm`;
    document.querySelectorAll('.map-thresholds label').forEach(label => { label.hidden = opts.mode !== 'score'; });
    $('mapNotice').hidden = !messages.length; $('mapNotice').textContent = messages.join(' ');
    $('mapLegend').innerHTML = Object.entries(labels).map(([key, label]) => `<span><i style="background:${palette[key]}"></i>${label} <b>${matches.filter(e => e.value.status === key).length}</b></span>`).join('');
    regions?.remove(); layers.clear();
    regions = L.geoJSON({ type: 'FeatureCollection', features: entries.map(e => ({ ...e.feature, properties: { ...e.feature.properties, unitCode: e.unit?.code } })) }, {
      style: f => { const entry = entries.find(e => e.feature.id === f.id), visible = codes.has(f.id); return { color: f.properties.unitCode === selected ? '#263c43' : '#fff', weight: f.properties.unitCode === selected ? 3 : 1, fillColor: visible ? palette[entry.value.status] : '#dce3e7', fillOpacity: visible ? 0.8 : 0.25 }; },
      onEachFeature: (feature, layer) => {
        const entry = entries.find(e => e.feature.id === feature.id);
        layer.bindTooltip(escape(feature.properties.name), { sticky: true });
        layer.on('add', () => { const element = layer.getElement(); if (element) { element.setAttribute('data-unit-code', entry.unit?.code || ''); element.setAttribute('aria-label', feature.properties.name); } });
        if (entry.unit) layers.set(entry.unit.code, layer);
        if (!codes.has(feature.id)) return;
        layer.bindPopup(() => popup(entry), { maxWidth: 290 });
        layer.on('click', () => { selected = entry.unit?.code || ''; $('mapUnit').value = selected; highlight(); detail(); });
        layer.on('mouseover', () => layer.setStyle({ weight: 2, color: '#526970' }));
        layer.on('mouseout', () => layer.setStyle({ weight: feature.properties.unitCode === selected ? 3 : 1, color: feature.properties.unitCode === selected ? '#263c43' : '#fff' }));
      }
    }).addTo(map);
    const alerts = matches.filter(e => ['red', 'yellow'].includes(e.value.status)).sort((a, b) => (a.value.status === 'red' ? 0 : 1) - (b.value.status === 'red' ? 0 : 1) || (opts.mode === 'score' ? a.value.ratio - b.value.ratio : a.value.delta - b.value.delta));
    $('mapAlertCount').textContent = `${alerts.length} địa bàn · ${context.groupName}`;
    $('mapAlerts').innerHTML = alerts.length ? alerts.map(e => `<button class="map-alert ${e.value.status}" data-code="${escape(e.unit?.code || '')}"${e.unit ? '' : ' disabled'}><span class="status-dot"></span><span>${escape(e.feature.properties.name)}</span><strong>${score(e.value)}</strong><small>${opts.mode === 'delta' ? change(e.value.delta) : fmt(e.value.ratio) + '%'}</small></button>`).join('') : '<p class="neutral">Không có địa bàn cảnh báo trong bộ lọc hiện tại.</p>';
    detail();
  }
  window.renderQualityMap = data => { context = data; render(); };
  $('mapGroup').addEventListener('change', () => { $('group').value = $('mapGroup').value; $('group').dispatchEvent(new Event('input')); });
  for (const id of ['mapMode', 'mapType', 'mapStatus', 'mapSearch', 'mapRed', 'mapYellow']) $(id).addEventListener('input', render);
  $('mapUnit').addEventListener('change', () => { if ($('mapUnit').value) selectUnit($('mapUnit').value); else { selected = ''; map?.fitBounds(allBounds, { padding: [22, 22], animate: false }); render(); } });
  $('mapFit').addEventListener('click', () => { selected = ''; map?.closePopup(); map?.fitBounds(allBounds, { padding: [22, 22], animate: false }); render(); });
  $('mapAlerts').addEventListener('click', event => { const code = event.target.closest('button[data-code]')?.dataset.code; if (code) selectUnit(code); });
})();
