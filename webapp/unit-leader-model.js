(function () {
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const value = m => m?.unit === '%' ? (m.denominator === 0 ? null : m.ratio) : m?.value;
  const diff = (a, b) => finite(a) && finite(b) ? Math.round((a - b) * 100) / 100 : null;
  function analyze(unit, prior, threshold) {
    const previous = Object.values(prior?.groupDetails || {}).filter(Boolean);
    return Object.values(unit?.groupDetails || {}).filter(Boolean).flatMap(g => g.metrics.map(m => {
      const old = previous.find(p => p.code === g.code)?.metrics.find(p => p.code === m.code);
      const scoreDelta = m.maxScore === old?.maxScore ? diff(m.score, old?.score) : null;
      const rateDelta = diff(value(m), value(old));
      const temporary = !!(m.dataQualityStatus || old?.dataQualityStatus);
      const comparable = !temporary && m.denominator !== 0 && old?.denominator !== 0;
      const scoreDrop = comparable && m.direction !== 'neutral' && finite(scoreDelta) && scoreDelta < 0;
      const rateDrop = comparable && m.direction !== 'neutral' && finite(rateDelta) && (m.direction === 'down' ? rateDelta > 0 : rateDelta < 0);
      const severity = Math.max(scoreDrop ? -scoreDelta : 0, rateDrop ? Math.abs(rateDelta) : 0);
      const status = temporary ? 'temporary' : m.denominator === 0 ? 'empty' : !comparable || (!finite(scoreDelta) && !finite(rateDelta)) ? 'unknown' : severity >= threshold && severity > 0 ? 'red' : severity > 0 ? 'yellow' : 'normal';
      const deficit = !temporary && m.denominator !== 0 && m.direction !== 'neutral' && finite(m.score) && finite(m.maxScore) && m.maxScore > 0 ? Math.max(0, Math.round((m.maxScore - m.score) * 100) / 100) : null;
      return { g, m, old, scoreDelta, rateDelta, status, deficit, severity, key: `${g.code}:${m.code}` };
    }));
  }
  function priorities(rows) {
    const drops = rows.filter(r => ['red', 'yellow'].includes(r.status)).sort((a, b) => (b.status === 'red') - (a.status === 'red') || b.severity - a.severity || (b.deficit || 0) - (a.deficit || 0));
    const deficits = rows.filter(r => !drops.includes(r) && r.deficit > 0).sort((a, b) => b.deficit - a.deficit);
    return [...drops, ...deficits].slice(0, 5);
  }
  function rank(unit, departments) {
    const peers = departments.filter(d => d.type === unit.type && finite(d.score));
    return { rank: finite(unit.score) && peers.length ? 1 + peers.filter(d => d.score > unit.score).length : null, count: peers.length };
  }
  window.UnitLeaderModel = { value, diff, analyze, priorities, rank };
})();
