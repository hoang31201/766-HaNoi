import dns from 'node:dns';
import net from 'node:net';
import tls from 'node:tls';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const host = 'dichvucong.gov.vn';
const api = `https://${host}/api/v1/reporting/evaluation/service-results`;
const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' }).format(new Date()));
const payload = JSON.stringify({ timeType: 'year', year, departmentType: 'ADMINISTRATIVE_UNIT' });
const report = { at: new Date().toISOString(), platform: process.platform, node: process.version, tests: [] };
const errorInfo = e => ({ code: e.code, message: e.message, cause: e.cause ? { code: e.cause.code, message: e.cause.message } : undefined });
async function test(name, action) {
  const start = Date.now();
  let result;
  try { result = { name, ok: true, result: await action() }; }
  catch (e) { result = { name, ok: false, error: errorInfo(e) }; }
  result.elapsedMs = Date.now() - start; report.tests.push(result); console.log(JSON.stringify(result));
  return result;
}
function connection(address, secure = false) {
  return new Promise((resolve, reject) => {
    const socket = secure ? tls.connect({ host: address, port: 443, servername: host, rejectUnauthorized: true }) : net.connect({ host: address, port: 443 });
    socket.setTimeout(10000, () => socket.destroy(Object.assign(new Error('Connection timed out after 10s'), { code: 'PROBE_TIMEOUT' })));
    socket.once('error', reject);
    socket.once(secure ? 'secureConnect' : 'connect', () => {
      resolve({ address, port: 443, ...(secure ? { protocol: socket.getProtocol(), authorized: socket.authorized } : {}) }); socket.destroy();
    });
  });
}
async function fetchApi(browserHeaders = false) {
  const response = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Connection: 'close', ...(browserHeaders ? { 'User-Agent': 'Mozilla/5.0', Origin: `https://${host}`, Referer: `https://${host}/danh-gia-chat-luong-phuc-vu` } : {}) }, body: payload, signal: AbortSignal.timeout(25000) });
  const body = await response.text();
  let data; try { data = JSON.parse(body); } catch {}
  return { status: response.status, contentType: response.headers.get('content-type'), bytes: body.length, code: data?.code, count: data?.data?.evaluation?.length, hanoiFound: data?.data?.evaluation?.some(d => d.departmentCode === 'H26') || false };
}
function curl(name, url, args = []) {
  return test(name, () => new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'curl.exe' : 'curl', ['--silent', '--show-error', '--noproxy', '*', '--connect-timeout', '25', '--max-time', '40', '--write-out', '\nDVC_META:%{json}', ...args, url], { windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; }); child.once('error', reject);
    child.once('close', code => {
      const marker = stdout.lastIndexOf('\nDVC_META:');
      let meta; try { meta = JSON.parse(stdout.slice(marker + 10)); } catch {}
      let body; try { body = JSON.parse(stdout.slice(0, marker)); } catch {}
      resolve({ exitCode: code, error: stderr.trim(), httpStatus: meta?.http_code, targetIP: meta?.remote_ip, dnsSeconds: meta?.time_namelookup, tcpSeconds: meta?.time_connect, tlsSeconds: meta?.time_appconnect, totalSeconds: meta?.time_total, tlsVerify: meta?.ssl_verify_result, code: body?.code, hanoiFound: body?.data?.evaluation?.some(d => d.departmentCode === 'H26') || false });
    });
  }));
}
await test('control-github-https', async () => { const r = await fetch('https://github.com', { signal: AbortSignal.timeout(15000) }); await r.body?.cancel(); return { status: r.status }; });
const a = await test('dns-A', () => dns.promises.resolve4(host));
const aaaa = await test('dns-AAAA', () => dns.promises.resolve6(host));
const lookup = await test('system-lookup', () => dns.promises.lookup(host, { all: true }));
const addresses = [...new Set([...(a.result || []), ...(lookup.result || []).filter(row => row.family === 4).map(row => row.address), '14.238.3.76'])];
for (const address of addresses.slice(0, 2)) {
  await test(`tcp443-${address}`, () => connection(address));
  await test(`tls443-${address}`, () => connection(address, true));
}
await test('node-fetch-default-API', () => fetchApi());
dns.setDefaultResultOrder('ipv4first');
await test('node-fetch-ipv4first-API', () => fetchApi());
await curl('curl-ipv4-home', `https://${host}/`, ['-4']);
if (aaaa.ok && aaaa.result.length) await curl('curl-ipv6-home', `https://${host}/`, ['-6']);
else report.tests.push({ name: 'curl-ipv6-home', skipped: 'No AAAA record; IPv6 cannot be used for this hostname.' });
await curl('curl-ipv4-API', api, ['-4', '-H', 'Content-Type: application/json', '-H', 'Accept: application/json', '--data-raw', payload]);
await curl('curl-known-IP-API', api, ['-4', '--resolve', `${host}:443:14.238.3.76`, '-H', 'Content-Type: application/json', '-H', 'Accept: application/json', '--data-raw', payload]);
await test('node-fetch-browser-headers-API', () => fetchApi(true));
if (process.argv[2]) { const file = path.resolve(process.argv[2]); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(report, null, 2)); }
console.log('DIAGNOSTIC COMPLETE: connection failures are recorded, no quality history was changed.');
