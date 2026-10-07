import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { vietnamDay } from './telegram-quality-report.mjs';
import path from 'node:path';

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

const numericFields = ['score', 'maxScore', 'ratio', 'value', 'numerator', 'denominator'];
export const hasUnitDetails = s => s.departments?.length > 0 && s.departments.every(unit => s.groups.every(group => unit.groupDetails?.[group.code] && Array.isArray(unit.groupDetails[group.code].metrics)));
function numericData(snapshot) {
  const values = new Map();
  const add = (prefix, object, fields = numericFields) => {
    for (const field of fields) if (typeof object?.[field] === 'number' && Number.isFinite(object[field])) values.set(`${prefix}/${field}`, object[field]);
  };
  add('city', snapshot, ['totalScore', 'totalMaxScore']);
  for (const group of snapshot.groups || []) {
    add(`city/${group.code}`, group);
    for (const metric of group.metrics || []) add(`city/${group.code}/${metric.code}`, metric);
  }
  for (const unit of snapshot.departments || []) {
    add(`unit/${unit.code}`, unit, ['score']);
    for (const [code, group] of Object.entries(unit.groupScores || {})) add(`unit/${unit.code}/${code}`, group);
    for (const [code, group] of Object.entries(unit.groupDetails || {})) {
      add(`unit/${unit.code}/${code}`, group);
      for (const metric of group?.metrics || []) add(`unit/${unit.code}/${code}/${metric.code}`, metric);
    }
  }
  return values;
}

export function sourceFreshness(current, snapshots) {
  const baseline = snapshots.filter(s => !s.source && s.department?.code === 'H26' && s.day < current.day && s.period?.year === current.period?.year && s.period?.timeType === current.period?.timeType).sort((a, b) => b.day.localeCompare(a.day))[0];
  if (!baseline) return { status: 'no-baseline', baselineDay: null, compared: 0, changed: 0 };
  const before = numericData(baseline), after = numericData(current);
  const differences = [], common = [...after.keys()].filter(key => before.has(key));
  for (const key of common) if (before.get(key) !== after.get(key)) differences.push({ field: key, before: before.get(key), after: after.get(key) });
  const complete = before.size === after.size && common.length === before.size && hasUnitDetails(baseline) && hasUnitDetails(current);
  return { status: differences.length ? 'changed' : complete ? 'unchanged' : 'incomplete', baselineDay: baseline.day, compared: common.length, changed: differences.length, differences: differences.slice(0, 10) };
}

export function hasNewSourceData(record, snapshots) {
  if (!validDailySnapshot(record, record.day)) return false;
  return ['changed', 'no-baseline'].includes(sourceFreshness(record, snapshots).status);
}

async function readSnapshots(directory) {
  const files = (await fs.readdir(directory)).filter(file => /^\d{4}-\d{2}-\d{2}\.json$/.test(file));
  return Promise.all(files.map(async file => JSON.parse(await fs.readFile(path.join(directory, file), 'utf8'))));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const record = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
    const valid = validDailySnapshot(record, process.argv[3]);
    const history = process.argv[4] ? await readSnapshots(process.argv[4]) : [];
    if (process.argv.includes('--annotate') && valid) {
      record.freshness = sourceFreshness(record, history);
      await fs.writeFile(process.argv[2], JSON.stringify(record, null, 2));
      console.log(JSON.stringify(record.freshness));
    }
    process.exitCode = valid && (!process.argv.includes('--ready') || hasUnitDetails(record) && hasNewSourceData(record, history)) ? 0 : 1;
  } catch { process.exitCode = 1; }
}
