import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const store = path.resolve(process.env.QUALITY_DATA_DIR || path.join(root, 'outputs', 'quality-history'));
export const groups = [
  { code: 'CKMB', name: 'Công khai, minh bạch', endpoint: 'transparency' },
  { code: 'TDGQ', name: 'Tiến độ giải quyết', endpoint: 'dvc-progress-tree' },
  { code: 'CLGQ', name: 'Dịch vụ công trực tuyến', endpoint: 'provide-online-tree' },
  { code: 'TTTT', name: 'Thanh toán trực tuyến', endpoint: 'formality-online-payment-tree' },
  { code: 'MDHL', name: 'Mức độ hài lòng', endpoint: 'handling-satisfaction' },
  { code: 'MDSH', name: 'Số hóa hồ sơ', endpoint: 'dossier-digitized' },
];
export function localDay(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
async function post(endpoint, body) {
  let error;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`https://dichvucong.gov.vn/api/v1/reporting/evaluation/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`Nguồn trả về HTTP ${response.status}`);
      const result = await response.json();
      if (result.code !== 'OK' || !result.data) throw new Error(result.message || 'Nguồn không trả về số liệu');
      return result.data;
    } catch (err) { error = err; }
  }
  const reason = error.cause ? `${error.cause.code || ''} ${error.cause.message || ''}`.trim() : '';
  throw new Error(`${endpoint}: ${error.message}${reason ? ` (${reason})` : ''}`, { cause: error });
}
const finite = n => typeof n === 'number' && Number.isFinite(n) ? n : null;
function ratioMetric(code, name, numerator, denominator, direction = 'up') {
  return { code, name, numerator: finite(numerator), denominator: finite(denominator), ratio: denominator > 0 && finite(numerator) !== null ? Math.round(numerator / denominator * 10000) / 100 : null, score: null, maxScore: null, direction, unit: '%' };
}
export function extractMetrics(group, data) {
  const p = data.overview || data.parent;
  if (!p) throw new Error(`Thiếu số liệu Hà Nội: ${group.name}`);
  const metrics = (p.metrics || []).map(m => ({ ...m, ratio: finite(m.ratio), score: finite(m.score), maxScore: finite(m.maxScore), direction: m.code.startsWith('PETITION_CLASSIFICATION') ? 'neutral' : 'up', unit: '%' }));
  if (group.code === 'TDGQ') metrics.push(
    { code: 'ON_TIME', name: 'Tỷ lệ hồ sơ đúng hạn, trong hạn', ratio: finite(p.ratio), direction: 'up', unit: '%' },
    { code: 'AVG_DAYS', name: 'Thời gian giải quyết trung bình', value: finite(p.avgProcessingDays), direction: 'down', unit: 'ngày' },
    { code: 'RECEIVED', name: 'Tổng hồ sơ tiếp nhận', value: finite(p.totalReceived), direction: 'neutral', unit: 'hồ sơ' },
    { code: 'COMPLETED', name: 'Hồ sơ đã hoàn thành', value: finite(p.totalCompleted), direction: 'neutral', unit: 'hồ sơ' });
  if (group.code === 'CLGQ') metrics.push(
    ratioMetric('FULL', 'Tỷ lệ dịch vụ công toàn trình', p.fullCount, p.authorityCount),
    ratioMetric('HAS_ONLINE', 'Tỷ lệ DVC có hồ sơ trực tuyến', p.onlineDossierCount, p.onlineServiceTotal),
    ratioMetric('ONLINE_DOSSIERS', 'Tỷ lệ hồ sơ nộp trực tuyến', p.channelOnlineSum, p.channelTotalSum),
    ratioMetric('ONLINE_ON_TIME', 'Tỷ lệ hồ sơ trực tuyến giải quyết đúng hạn', p.onlineOnTimeSum, p.channelOnlineSum));
  if (group.code === 'TTTT') metrics.push(
    ratioMetric('PAY_DOSSIERS', 'Tỷ lệ hồ sơ thanh toán trực tuyến', p.totalDossierOnlinePaymentSuccess, p.totalDossierFinancialObligation),
    ratioMetric('PAY_FORMALITIES', 'Tỷ lệ TTHC có giao dịch thanh toán trực tuyến', p.totalDossierOnlineFormalityPaymentSuccess, p.totalFeeDossierFormalityDistinct),
    ratioMetric('PAY_PROVISION', 'Tỷ lệ TTHC có nghĩa vụ tài chính được cung cấp trên Cổng DVCQG', p.totalFeeDossierFormality, p.totalFeeFormality));
  return { code: group.code, name: group.name, score: finite(p.totalScore), maxScore: finite(p.totalMaxScore), ratio: finite(p.ratio), metrics };
}
let running = null;
export function extractDepartmentScores(departments, raw) {
  const indexes = new Map(groups.map(group => [group.code, new Map((raw[group.endpoint]?.evaluation || raw[group.endpoint]?.children || []).map(d => [d.departmentId, d]))]));
  return departments.map(d => ({ code: d.departmentCode, name: d.departmentName, score: finite(d.totalScore), type: d.childGroup,
    groupScores: Object.fromEntries(groups.map(group => {
      const record = indexes.get(group.code).get(d.departmentId);
      return [group.code, { score: finite(record?.totalScore) ?? finite(record?.score), maxScore: finite(record?.totalMaxScore) ?? finite(record?.maxScore) }];
    })) }));
}
export function collect() {
  if (running) return running;
  running = collectSnapshot().finally(() => { running = null; });
  return running;
}
async function collectSnapshot() {
  const day = localDay(), year = Number(day.slice(0, 4)), period = { timeType: 'year', year };
  const nationwide = await post('service-results', { ...period, departmentType: 'ADMINISTRATIVE_UNIT' });
  const hanoi = nationwide.evaluation?.find(d => d.departmentCode === 'H26');
  if (!hanoi) throw new Error('Không tìm thấy Thành phố Hà Nội (H26) trong nguồn');
  const body = { ...period, rootDepartmentId: hanoi.departmentId, currentPage: 1, pageSize: 200 };
  const raw = { nationwide, 'service-results': await post('service-results', body) }, collected = [];
  for (const group of groups) {
    const params = group.code === 'MDHL' ? { rootDepartmentId: hanoi.departmentId, fromDate: `${year}-01-01`, toDate: `${year}-12-31`, currentPage: 1, pageSize: 200 } : body;
    const data = await post(group.endpoint, params), p = data.overview || data.parent;
    if (p?.departmentId !== hanoi.departmentId) throw new Error(`Nguồn sai đơn vị: ${group.name}`);
    raw[group.endpoint] = data;
    collected.push(extractMetrics(group, data));
  }
  const overview = raw['service-results'].overview;
  if (overview?.departmentCode !== 'H26' || finite(overview.totalScore) === null) throw new Error('Điểm tổng hợp không hợp lệ');
  const snapshot = { day, capturedAt: new Date().toISOString(), period, department: { id: hanoi.departmentId, code: 'H26', name: hanoi.departmentName }, totalScore: overview.totalScore, totalMaxScore: overview.totalMaxScore, rank: [...nationwide.evaluation].sort((a, b) => b.totalScore - a.totalScore).findIndex(d => d.departmentId === hanoi.departmentId) + 1, provinceCount: nationwide.evaluation.length, groups: collected, departments: extractDepartmentScores(raw['service-results'].evaluation, raw) };
  await fs.mkdir(path.join(store, 'raw'), { recursive: true });
  const rawFile = `${day}-${Date.now()}.json`;
  await fs.writeFile(path.join(store, 'raw', rawFile), JSON.stringify({ snapshot, requests: { period, rootDepartmentId: hanoi.departmentId }, raw }, null, 2));
  snapshot.rawFile = rawFile;
  // Publish only complete captures, preserving existing data if any endpoint fails.
  const destination = path.join(store, `${day}.json`), tmp = `${destination}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2));
  await fs.rename(tmp, destination);
  if (process.env.NODE_ENV !== 'production') {
    await fs.writeFile(path.join(root, 'webapp', 'data', 'quality-history.js'), `window.QUALITY_HISTORY = ${JSON.stringify(await history())};\n`);
  }
  return snapshot;
}
export async function history() {
  await fs.mkdir(store, { recursive: true });
  const files = (await fs.readdir(store)).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  return Promise.all(files.map(async f => JSON.parse(await fs.readFile(path.join(store, f), 'utf8'))));
}

export async function seedHistory(source = path.join(root, 'seed', 'quality-history'), destination = store) {
  await fs.mkdir(destination, { recursive: true });
  let files;
  try { files = await fs.readdir(source); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const file of files.filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))) {
    const data = JSON.parse(await fs.readFile(path.join(source, file), 'utf8'));
    if (data.day !== file.slice(0, 10) || data.department?.code !== 'H26') throw new Error('Invalid seed history');
    try { await fs.copyFile(path.join(source, file), path.join(destination, file), fs.constants.COPYFILE_EXCL); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (data.rawFile && path.basename(data.rawFile) === data.rawFile) {
      await fs.mkdir(path.join(destination, 'raw'), { recursive: true });
      try { await fs.copyFile(path.join(source, 'raw', data.rawFile), path.join(destination, 'raw', data.rawFile), fs.constants.COPYFILE_EXCL); }
      catch (error) { if (!['EEXIST', 'ENOENT'].includes(error.code)) throw error; }
    }
  }
}
