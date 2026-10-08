import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const runtimeRequire = process.env.CODEX_NODE_DEPENDENCIES
  ? createRequire(path.join(process.env.CODEX_NODE_DEPENDENCIES, 'package.json')) : createRequire(import.meta.url);
const { chromium } = runtimeRequire('playwright');
const out = path.resolve('outputs/overview-preview');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto((process.env.QUALITY_PREVIEW_URL || 'http://127.0.0.1:8788') + '/#overview');
  await page.waitForFunction(() => document.querySelectorAll('#groups .group').length === 6);
  await page.waitForFunction(() => document.querySelector('#updated').textContent !== 'Đang tải số liệu...');
  assert.equal(await page.locator('#cityGroups details').count(), 0);
  for (const group of await page.locator('#groups .group').all()) assert.equal(await group.isVisible(), true);
  await page.screenshot({ path: path.join(out, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const group of await page.locator('#groups .group').all()) assert.equal(await group.isVisible(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(out, 'mobile.png'), fullPage: true });
  // Synthetic comparisons exist only in this browser session, never in saved data.
  const checks = await page.evaluate(() => {
    const current = snapshots.find(s => s.day === document.querySelector('#current').value);
    const previous = snapshots.find(s => s.day < current.day);
    if (!previous) throw new Error('Need two saved dates for UI regression checks');
    const original = structuredClone(snapshots);
    const result = [];
    try {
      delete current.freshness;
      document.querySelector('#baseline').value = previous.day;
      previous.totalScore = 50;
      previous.rank = 10;
      for (const [score, rank, expected] of [[51, 9, 'good'], [49, 11, 'bad'], [50, 10, 'neutral']]) {
        current.totalScore = score;
        current.rank = rank;
        current.groups.forEach((g, i) => {
          previous.groups.find(p => p.code === g.code).score = 5;
          g.score = i === 0 ? score - 45 : 5;
        });
        render();
        const total = document.querySelector('#summary article:nth-child(1) .delta');
        const ranking = document.querySelector('#summary article:nth-child(2) .delta');
        const group = document.querySelector('#groups .delta');
        result.push({ expected, totalClass: total.className, rankClass: ranking.className,
          totalColor: getComputedStyle(total).color, rankColor: getComputedStyle(ranking).color,
          groupColor: getComputedStyle(group).color });
      }
      document.querySelector('#baseline').value = '';
      render();
      result.push({ missing: document.querySelector('#summary article:first-child .delta').className });
    } finally { snapshots = original; populate(); }
    return result;
  });
  for (const check of checks.slice(0, 3)) {
    assert.ok(check.totalClass.includes(check.expected));
    assert.ok(check.rankClass.includes(check.expected));
    assert.equal(check.totalColor, check.groupColor);
    assert.equal(check.rankColor, check.groupColor);
  }
  assert.ok(checks[3].missing.includes('neutral'));
  assert.deepEqual(errors, []);
  console.log('PASS: six groups always expanded; total/rank improvement, decline, unchanged and missing comparison colors; desktop/mobile layout.');
} finally { await browser.close(); }
