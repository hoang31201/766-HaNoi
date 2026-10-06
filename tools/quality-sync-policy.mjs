import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { vietnamDay } from './telegram-quality-report.mjs';

export function validDailySnapshot(record, day) {
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  return !!record && record.day === day && !record.source && record.department?.code === 'H26'
    && Number.isFinite(Date.parse(record.capturedAt)) && vietnamDay(new Date(record.capturedAt)) === day
    && record.period?.year === Number(day.slice(0, 4)) && record.period?.timeType === 'year'
    && finite(record.totalScore) && finite(record.totalMaxScore) && record.totalMaxScore > 0
    && Array.isArray(record.groups) && record.groups.length === 6
    && new Set(record.groups.map(group => group.code)).size === 6
    && record.groups.every(group => finite(group.score) && finite(group.maxScore) && group.maxScore > 0)
    && Array.isArray(record.departments) && record.departments.length > 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const record = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
    process.exitCode = validDailySnapshot(record, process.argv[3]) ? 0 : 1;
  } catch { process.exitCode = 1; }
}
