(function (scope) {
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const key = name => String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/^ubnd\s+/, '').replace(/\s+/g, ' ').trim();
  const points = (unit, group, totalMax = 100) => group === 'all' ? { score: unit?.score, maxScore: totalMax } : unit?.groupScores?.[group] || {};
  function evaluate(unit, prior, group, options = {}) {
    const value = points(unit, group, options.totalMax), before = points(prior, group, options.priorMax);
    const ratio = finite(value.score) && finite(value.maxScore) && value.maxScore > 0 ? value.score / value.maxScore * 100 : null;
    const delta = finite(value.score) && finite(before.score) && finite(value.maxScore) && value.maxScore > 0 && value.maxScore === before.maxScore ? Math.round((value.score - before.score) * 100) / 100 : null;
    let status = 'unknown';
    if (options.mode === 'delta') {
      if (delta !== null) status = delta <= -2 * options.threshold ? 'red' : delta <= -options.threshold ? 'yellow' : 'green';
    } else if (ratio !== null) status = ratio < options.red ? 'red' : ratio < options.yellow ? 'yellow' : 'green';
    return { ...value, before: before.score, ratio, delta, status };
  }
  function join(features, departments) {
    const indexes = new Map();
    for (const unit of departments.filter(d => d.type === 'COMMUNE')) {
      const name = key(unit.name);
      indexes.set(name, indexes.has(name) ? null : unit);
    }
    return features.map(feature => ({ feature, unit: indexes.get(key(feature.properties.name)) || null }));
  }
  const api = { key, points, evaluate, join };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.QualityMapModel = api;
})(typeof window === 'undefined' ? globalThis : window);
