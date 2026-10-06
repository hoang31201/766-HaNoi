import { collect } from './quality-data.mjs';
try {
  const result = await collect();
  console.log(`Da luu ${result.day}: ${result.totalScore}/${result.totalMaxScore} diem; ${result.groups.length} nhom; ${result.groups.reduce((n, g) => n + g.metrics.length, 0)} chi tieu.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
