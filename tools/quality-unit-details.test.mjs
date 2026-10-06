import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDepartmentScores, groups } from './quality-data.mjs';

test('Detail capture joins unit IDs, normalizes progress scores and uses online detail', () => {
  const units = [{ departmentId: 'a', departmentCode: 'H26.1', departmentName: 'A', childGroup: 'AGENCY', totalScore: 50 }];
  const raw = Object.fromEntries(groups.map(g => [g.endpoint, { evaluation: [{ departmentId: 'a', totalScore: 0, totalMaxScore: 18, metrics: [{ code: 'TEST', name: 'Test', numerator: 0, denominator: 0, ratio: 0, score: 6, maxScore: 6, dataQualityStatus: 'TEMP' }] }] }]));
  raw['dvc-progress-tree'] = { children: [{ departmentId: 'a', score: 2, maxScore: 20, totalReceived: 10, ratio: 10, avgProcessingDays: 3 }] };
  raw.unitDetails = { a: { CLGQ: { departmentId: 'a', totalScore: 3, totalMaxScore: 12, fullCount: 2, authorityCount: 4 } } };
  const [detail] = extractDepartmentScores(units, raw, true);
  assert.equal(detail.groupDetails.TDGQ.score, 2);
  assert.equal(detail.groupDetails.CLGQ.metrics.find(m => m.code === 'FULL').ratio, 50);
  assert.equal(detail.groupDetails.CKMB.metrics[0].denominator, 0);
  assert.equal(detail.groupDetails.CKMB.metrics[0].dataQualityStatus, 'TEMP');
  assert.equal(extractDepartmentScores(units, raw)[0].groupDetails, undefined);
});

test('Missing group records remain missing instead of invented zero details', () => {
  const [unit] = extractDepartmentScores([{ departmentId: 'a', departmentCode: 'H26.1' }], {}, true);
  assert.equal(unit.groupDetails.CKMB, null);
  assert.equal(unit.groupScores.CKMB.score, null);
});
