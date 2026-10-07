import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { buildReport, formatTelegramHtml, readHistory, vietnamDay } from './telegram-quality-report.mjs';
import { validDailySnapshot, hasNewSourceData } from './quality-sync-policy.mjs';

export function latencyTestPlan(requestedAt, runId, now = new Date()) {
  const requested = Date.parse(requestedAt);
  const elapsed = now.getTime() - requested;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(requestedAt || '') || !Number.isFinite(requested) || elapsed < -60000 || elapsed > 86400000 || !/^\d{1,30}$/.test(runId || '')) throw new Error('Invalid latency test request.');
  const time = date => date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
  return { day: vietnamDay(now), kind: `latency-${runId}`, messages: [`<b>KIỂM TRA ĐỘ TRỄ TỪ GITHUB</b>\nYêu cầu lúc: ${time(new Date(requested))}\nGitHub xử lý lúc: ${time(now)}\nThời gian từ yêu cầu đến xử lý: ${Math.max(0, elapsed / 1000).toFixed(1)} giây.\nĐây là tin thử, không phải báo cáo hằng ngày.`] };
}

export function notificationPlan(snapshots, now = new Date()) {
  const day = vietnamDay(now);
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  if (clock < '06:30') return null;
  const current = snapshots.find(snapshot => snapshot.day === day && validDailySnapshot(snapshot, day));
  if (!current || !hasNewSourceData(current, snapshots)) return {
    day, kind: 'missing', messages: [formatTelegramHtml(`BÁO CÁO 766 HÀ NỘI | ${day.split('-').reverse().join('/')}\nChưa ghi nhận dữ liệu mới từ nguồn${current ? '; số liệu chi tiết chưa thay đổi hoặc chưa đủ để xác minh' : ''}.\nMáy cào sẽ thử lại mỗi 1 giờ khi máy đang bật, đã đăng nhập và có Internet.\nBot sẽ tự gửi báo cáo khi phát hiện số liệu nguồn thay đổi.`)],
  };
  const report = buildReport(snapshots.filter(snapshot => snapshot.day !== day || snapshot === current), day);
  return { ...report, deliveryKey: `${day}-report-fresh`, messages: report.messages.map(formatTelegramHtml) };
}

export async function deliverReport(plan, store, send, recipient) {
  if (!plan) return 'before-report-time';
  const state = await store.load();
  const key = plan.deliveryKey || `${plan.day}-${plan.kind}`;
  const recipientKey = crypto.createHash('sha256').update(recipient).digest('hex');
  if (state.recipientKey && state.recipientKey !== recipientKey) throw new Error('Recipient changed; review delivery state before sending.');
  state.recipientKey = recipientKey;
  state.deliveries ??= {};
  // Any uncertain request blocks later sends, including a new day, until reviewed.
  if (Object.values(state.deliveries).some(entry => entry.pending !== null && entry.pending !== undefined)) throw new Error('Uncertain Telegram delivery; check the group and review state before retrying.');
  if (plan.kind === 'missing' && state.deliveries[`${plan.day}-report-fresh`]?.complete) return 'already-reported';
  let delivery = state.deliveries[key];
  if (delivery?.complete) return 'already-sent';
  const digest = crypto.createHash('sha256').update(JSON.stringify(plan.messages)).digest('hex');
  if (delivery && delivery.digest !== digest) throw new Error('Report changed during partial delivery; manual review required.');
  delivery ??= { digest, sent: [], pending: null, complete: false };
  state.deliveries[key] = delivery;
  for (let index = 0; index < plan.messages.length; index++) {
    if (delivery.sent.includes(index)) continue;
    delivery.pending = index;
    await store.save(state);
    await send(plan.messages[index]);
    delivery.sent.push(index);
    delivery.pending = null;
    delivery.complete = delivery.sent.length === plan.messages.length;
    await store.save(state);
  }
  return 'sent';
}

export function githubStateStore({ token, repository, fetchImpl = fetch }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('Invalid GitHub repository.');
  const base = `https://api.github.com/repos/${repository}`;
  const branch = 'telegram-delivery-state';
  const file = '/contents/telegram-state.json';
  let sha;
  async function request(route, options = {}, allowMissing = false) {
    let response;
    try {
      response = await fetchImpl(base + route, { ...options, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000) });
    } catch { throw new Error('GitHub state request failed; no automatic Telegram resend.'); }
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub state request failed (${response.status}).`);
    try { return await response.json(); } catch { throw new Error('Invalid GitHub state response.'); }
  }
  return {
    async load() {
      if (!await request(`/git/ref/heads/${branch}`, {}, true)) {
        const main = await request('/git/ref/heads/main');
        await request('/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: main.object.sha }) });
      }
      const data = await request(`${file}?ref=${branch}`, {}, true);
      if (!data) return { version: 1, deliveries: {} };
      sha = data.sha;
      let state;
      try { state = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8')); } catch { throw new Error('Invalid saved delivery state.'); }
      if (state.version !== 1 || !state.deliveries || typeof state.deliveries !== 'object' || Array.isArray(state.deliveries)) throw new Error('Invalid delivery state schema.');
      return state;
    },
    async save(state) {
      const result = await request(file, { method: 'PUT', body: JSON.stringify({ message: 'Record Telegram delivery state', branch, ...(sha ? { sha } : {}), content: Buffer.from(JSON.stringify(state, null, 2)).toString('base64') }) });
      sha = result.content.sha;
    },
  };
}

export function telegramSender({ token, chatId, threadId, fetchImpl = fetch }) {
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token || '') || !/^-\d+$/.test(chatId || '') || threadId && !/^\d+$/.test(threadId)) throw new Error('Missing or invalid Telegram secrets.');
  return async text => {
    let response;
    try {
      response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...(threadId ? { message_thread_id: Number(threadId) } : {}) }), signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error('Rejected');
    } catch { throw new Error('Telegram delivery failed or uncertain; check the group before retrying.'); }
  };
}

export async function checkConnection({ token, chatId, store, fetchImpl = fetch }) {
  // Never print API objects: chat metadata and token-bearing transport errors are private.
  async function check(method, body) {
    try {
      const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error('Rejected');
      return result.result;
    } catch { throw new Error(`Telegram connection check failed at ${method}; credentials were not logged.`); }
  }
  const bot = await check('getMe', {});
  if (bot.username?.toLowerCase() !== 'hni766_bot') throw new Error('Unexpected Telegram bot.');
  const chat = await check('getChat', { chat_id: chatId });
  if (!['group', 'supergroup'].includes(chat.type) || String(chat.id) !== chatId) throw new Error('Unexpected Telegram recipient.');
  const member = await check('getChatMember', { chat_id: chatId, user_id: bot.id });
  if (!['member', 'administrator', 'creator', 'restricted'].includes(member.status) || member.status === 'restricted' && !member.can_send_messages || member.status === 'member' && chat.permissions?.can_send_messages === false) throw new Error('Bot cannot send messages in this group.');
  const state = await store.load();
  await store.save(state);
  return 'Telegram connection and durable GitHub state verified; no message sent.';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const testingLatency = process.argv.includes('--latency-test');
    if (testingLatency && process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') throw new Error('Latency tests require explicit manual dispatch.');
    const plan = testingLatency ? latencyTestPlan(process.env.REQUESTED_AT, process.env.GITHUB_RUN_ID) : notificationPlan(await readHistory(['history/quality']));
    if (process.argv.includes('--preview')) console.log(JSON.stringify(plan));
    else if (!plan && !process.argv.includes('--check-connection')) console.log('Before 06:30 Vietnam time; no message.');
    else {
      const { GITHUB_TOKEN, GITHUB_REPOSITORY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_THREAD_ID } = process.env;
      if (!GITHUB_TOKEN) throw new Error('Missing GitHub state token.');
      const telegram = telegramSender({ token: TELEGRAM_BOT_TOKEN, chatId: TELEGRAM_CHAT_ID, threadId: TELEGRAM_THREAD_ID });
      const sender = async text => {
        const startedAt = new Date();
        await telegram(text);
        if (testingLatency) {
          const confirmedAt = new Date();
          console.log('LATENCY_METRICS ' + JSON.stringify({ requestedAt: process.env.REQUESTED_AT, sendStartedAt: startedAt.toISOString(), confirmedAt: confirmedAt.toISOString(), requestToSendSeconds: (startedAt - Date.parse(process.env.REQUESTED_AT)) / 1000, telegramApiSeconds: (confirmedAt - startedAt) / 1000, totalSeconds: (confirmedAt - Date.parse(process.env.REQUESTED_AT)) / 1000 }));
        }
      };
      const store = githubStateStore({ token: GITHUB_TOKEN, repository: GITHUB_REPOSITORY });
      if (process.argv.includes('--check-connection')) console.log(await checkConnection({ token: TELEGRAM_BOT_TOKEN, chatId: TELEGRAM_CHAT_ID, store }));
      else console.log(`${plan.day} ${plan.kind}: ${await deliverReport(plan, store, sender, `${TELEGRAM_CHAT_ID}:${TELEGRAM_THREAD_ID || ''}`)}`);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
