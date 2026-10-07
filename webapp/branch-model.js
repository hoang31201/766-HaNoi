(function () {
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const round = v => Math.round((v + Number.EPSILON) * 100) / 100;
  function validate(mapping) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(mapping?.effectiveFrom || '') || mapping?.branches?.length !== 12) throw new Error('Bảng phân công không hợp lệ');
    const ids = new Set(), codes = new Set();
    for (const b of mapping.branches) {
      if (!b.codes?.length || ids.has(b.id)) throw new Error('Chi nhánh thiếu địa bàn hoặc bị trùng');
      ids.add(b.id);
      for (const code of b.codes) {
        if (codes.has(code)) throw new Error('Địa bàn bị phân công trùng: ' + code);
        codes.add(code);
      }
    }
    if (codes.size !== 126) throw new Error('Chưa đủ 126 xã/phường');
  }
  function measure(unit, snapshot, group = 'all') {
    if (unit?.type !== 'COMMUNE') return { score: null, max: null };
    const score = group === 'all' ? unit.score : unit.groupScores?.[group]?.score;
    const max = group === 'all' ? snapshot?.totalMaxScore : unit.groupScores?.[group]?.maxScore;
    return { score: finite(score) ? score : null, max: finite(max) && max > 0 ? max : null };
  }
  function aggregate(branch, snapshot, mapping, group = 'all') {
    const units = new Map((snapshot?.departments || []).map(u => [u.code, u]));
    const entries = branch.codes.map(code => ({ code, unit: units.get(code), ...measure(units.get(code), snapshot, group) }));
    const coverage = entries.filter(e => finite(e.score) && finite(e.max)).length;
    const scales = new Set(entries.map(e => e.max));
    const eligible = snapshot?.day >= mapping.effectiveFrom && (!mapping.effectiveTo || snapshot.day <= mapping.effectiveTo);
    const complete = eligible && coverage === entries.length && scales.size === 1;
    return { id: branch.id, entries, coverage, count: entries.length, complete: !!complete,
      score: complete ? entries.reduce((sum, e) => sum + e.score, 0) / entries.length : null,
      max: complete ? entries[0].max : null, eligible: !!eligible };
  }
  function ranking(snapshot, mapping, group = 'all') {
    validate(mapping);
    const rows = mapping.branches.map(b => aggregate(b, snapshot, mapping, group));
    rows.sort((a, b) => (finite(a.score) ? 0 : 1) - (finite(b.score) ? 0 : 1) || (round(b.score ?? 0) - round(a.score ?? 0)) || a.id.localeCompare(b.id));
    let lastScore, lastRank;
    rows.forEach((r, i) => {
      if (!finite(r.score)) { r.rank = null; return; }
      const score = round(r.score);
      r.rank = score === lastScore ? lastRank : i + 1;
      lastScore = score; lastRank = r.rank;
    });
    return rows;
  }
  const previousDay = day => new Date(Date.parse(day + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  const samePeriod = (a, b) => !!a?.period && !!b?.period && ['year', 'timeType', 'month', 'quarter', 'from', 'to'].every(k => a.period[k] === b.period[k]);
  function comparable(current, prior, mapping) {
    return !!(current && prior && current.day >= mapping.effectiveFrom && prior.day >= mapping.effectiveFrom
      && prior.day === previousDay(current.day) && samePeriod(current, prior)
      && ![current, prior].some(s => ['unchanged', 'incomplete'].includes(s.freshness?.status)));
  }
  function change(current, prior) {
    return finite(current?.score) && finite(prior?.score) && current.max === prior.max ? round(current.score - prior.score) : null;
  }
  (typeof window === 'undefined' ? globalThis : window).BranchModel = { validate, measure, aggregate, ranking, comparable, change, previousDay, samePeriod };
})();
