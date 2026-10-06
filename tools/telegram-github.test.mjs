import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { notificationPlan, deliverReport, githubStateStore, telegramSender, checkConnection, latencyTestPlan } from './telegram-github.mjs';
import { validDailySnapshot } from './quality-sync-policy.mjs';

const snapshot = day => ({ day, capturedAt: day + 'T00:00:00Z', department: { code: 'H26' }, period: { year: 2026, timeType: 'year' }, totalScore: 60, totalMaxScore: 100, rank: 20, provinceCount: 34, groups: Array.from({ length: 6 }, (_, i) => ({ code: String(i), name: `Group ${i}`, score: 10, maxScore: 20, metrics: [] })), departments: [{ code: 'a', name: 'A', type: 'COMMUNE', score: 60 }] });
function memoryStore() {
  let value = { version: 1, deliveries: {} };
  return { load: async () => structuredClone(value), save: async state => { value = structuredClone(state); } };
}

test('06:30 boundary, stale and secondary captures never become today data', () => {
  const today = snapshot('2026-10-07');
  assert.equal(notificationPlan([today], new Date('2026-10-06T23:29:59Z')), null);
  assert.equal(notificationPlan([today], new Date('2026-10-06T23:30:00Z')).kind, 'report');
  assert.equal(notificationPlan([snapshot('2026-10-06')], new Date('2026-10-06T23:30:00Z')).kind, 'missing');
  today.capturedAt = '2026-10-06T16:00:00Z';
  assert.equal(validDailySnapshot(today, today.day), false);
  today.capturedAt = '2026-10-07T00:00:00Z'; today.source = { name: 'secondary' };
  assert.equal(validDailySnapshot(today, today.day), false);
  delete today.source; today.groups[1].code = '0';
  assert.equal(validDailySnapshot(today, today.day), false);
});

test('Missing is sent once, late data is sent once, repeated cron and pushes do not duplicate', async () => {
  const store = memoryStore(), sent = [];
  const send = async text => { sent.push(text); };
  const now = new Date('2026-10-06T23:30:00Z');
  const missing = notificationPlan([], now);
  assert.equal(await deliverReport(missing, store, send, '-1:'), 'sent');
  assert.equal(await deliverReport(missing, store, send, '-1:'), 'already-sent');
  const report = notificationPlan([snapshot('2026-10-07')], new Date('2026-10-07T01:00:00Z'));
  assert.equal(await deliverReport(report, store, send, '-1:'), 'sent');
  assert.equal(await deliverReport(report, store, send, '-1:'), 'already-sent');
  assert.equal(await deliverReport(missing, store, send, '-1:'), 'already-reported');
  assert.equal(sent.length, 3);
  const next = notificationPlan([], new Date('2026-10-07T23:30:00Z'));
  assert.equal(await deliverReport(next, store, send, '-1:'), 'sent');
});

test('Uncertain API outcome is persisted and blocks automatic resend', async () => {
  const store = memoryStore(), plan = notificationPlan([], new Date('2026-10-06T23:30:00Z'));
  let calls = 0;
  await assert.rejects(deliverReport(plan, store, async () => { calls++; throw new Error('Timeout'); }, '-1:'));
  assert.equal((await store.load()).deliveries['2026-10-07-missing'].pending, 0);
  await assert.rejects(deliverReport(plan, store, async () => { calls++; }, '-1:'), /Uncertain/);
  assert.equal(calls, 1);
});

test('Failure to persist pending state prevents sending, and recipient changes are rejected', async () => {
  const plan = notificationPlan([], new Date('2026-10-06T23:30:00Z'));
  let calls = 0;
  await assert.rejects(deliverReport(plan, { load: async () => ({ deliveries: {} }), save: async () => { throw new Error('Denied'); } }, async () => { calls++; }, '-1:'));
  assert.equal(calls, 0);
  const store = memoryStore();
  await deliverReport(plan, store, async () => {}, '-1:');
  await assert.rejects(deliverReport(plan, store, async () => {}, '-2:'), /Recipient changed/);
});

test('Telegram errors never reveal bot token or transport URL', async () => {
  const token = '123456:fake_test_token';
  const sender = telegramSender({ token, chatId: '-1', fetchImpl: async () => { throw new Error(`https://api.telegram.org/bot${token}`); } });
  await assert.rejects(sender('text'), error => !error.message.includes(token) && !error.message.includes('https://'));
});

test('GitHub state uses a separate branch and optimistic file SHA updates', async () => {
  const calls = [];
  const responses = [new Response('', { status: 404 }), Response.json({ object: { sha: 'main-sha' } }), Response.json({}), new Response('', { status: 404 }), Response.json({ content: { sha: 'state-1' } }), Response.json({ content: { sha: 'state-2' } })];
  const store = githubStateStore({ token: 'fake', repository: 'owner/repo', fetchImpl: async (url, options) => { calls.push({ url, options }); return responses.shift(); } });
  const state = await store.load();
  await store.save(state); await store.save(state);
  assert.equal(JSON.parse(calls[2].options.body).ref, 'refs/heads/telegram-delivery-state');
  assert.equal(JSON.parse(calls[4].options.body).branch, 'telegram-delivery-state');
  assert.equal(JSON.parse(calls[5].options.body).sha, 'state-1');
});

test('Connection verification checks the bot, group and permissions without sending messages', async () => {
  const calls = [];
  const results = [{ username: 'HNi766_bot', id: 123 }, { id: -1, type: 'supergroup', permissions: { can_send_messages: true } }, { status: 'member' }];
  const message = await checkConnection({ token: 'fake', chatId: '-1', store: memoryStore(), fetchImpl: async url => { calls.push(url.split('/').at(-1)); return Response.json({ ok: true, result: results.shift() }); } });
  assert.deepEqual(calls, ['getMe', 'getChat', 'getChatMember']);
  assert.match(message, /no message sent/);
});

test('Manual latency test sends one message and reruns do not resend it', async () => {
  const plan = latencyTestPlan('2026-10-06T18:00:00Z', '123', new Date('2026-10-06T18:00:20Z'));
  assert.equal(plan.messages.length, 1);
  assert.match(plan.messages[0], /20\.0 giây/);
  let sends = 0;
  const store = memoryStore();
  await deliverReport(plan, store, async () => { sends++; }, '-1:');
  const rerun = latencyTestPlan('2026-10-06T18:00:00Z', '123', new Date('2026-10-06T18:00:40Z'));
  assert.equal(await deliverReport(rerun, store, async () => { sends++; }, '-1:'), 'already-sent');
  assert.equal(sends, 1);
  assert.throws(() => latencyTestPlan('invalid', '123'), /Invalid/);
  assert.throws(() => latencyTestPlan('2026-10-01T00:00:00Z', '123'), /Invalid/);
});

test('Workflow only uses repository history and local hourly schedule stops crawling after publication', async () => {
  const workflow = await fs.readFile(new URL('../.github/workflows/telegram-report.yml', import.meta.url), 'utf8');
  assert.match(workflow, /30 23 \* \* \*/);
  assert.match(workflow, /35 0-16 \* \* \*/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /secrets\.TELEGRAM_BOT_TOKEN/);
  assert.doesNotMatch(workflow, /crawl-quality|pull_request/);
  const schedule = await fs.readFile(new URL('./install-quality-sync.ps1', import.meta.url), 'utf8');
  assert.match(schedule, /5\.\.23/);
  const sync = await fs.readFile(new URL('./sync-quality-local.ps1', import.meta.url), 'utf8');
  assert.match(sync, /origin\/main:history\/quality/);
  assert.match(sync, /already published; no additional crawl/);
});
