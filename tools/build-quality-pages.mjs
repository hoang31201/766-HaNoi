import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { root, store } from './quality-data.mjs';

export async function buildPages({ sourceRoot = root, dataDir = store, outDir = path.join(root, 'dist'), repository = process.env.GITHUB_REPOSITORY || '' } = {}) {
  if (repository && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid GitHub repository');
  const files = (await fs.readdir(dataDir)).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const snapshots = [];
  for (const file of files) {
    const snapshot = JSON.parse(await fs.readFile(path.join(dataDir, file), 'utf8'));
    if (snapshot.department?.code !== 'H26' || snapshot.day !== file.slice(0, 10) || !Array.isArray(snapshot.groups)) throw new Error(`Invalid snapshot: ${file}`);
    const { rawFile, ...publicSnapshot } = snapshot;
    snapshots.push(publicSnapshot);
  }
  if (!snapshots.length) throw new Error('No saved Hanoi data to publish');
  await fs.mkdir(path.join(outDir, 'data'), { recursive: true });
  for (const file of ['index.html', 'styles.css', 'app.js', 'quality-map.js', 'map-model.js', 'unit-detail.js', 'unit-leader-model.js', 'branch-model.js', 'branch-page.js']) await fs.copyFile(path.join(sourceRoot, 'webapp', file), path.join(outDir, file));
  await fs.copyFile(path.join(sourceRoot, 'webapp/data/branch-assignments.js'), path.join(outDir, 'data/branch-assignments.js'));
  await fs.copyFile(path.join(sourceRoot, 'webapp/data/hanoi-boundaries.js'), path.join(outDir, 'data/hanoi-boundaries.js'));
  await fs.cp(path.join(sourceRoot, 'webapp/vendor'), path.join(outDir, 'vendor'), { recursive: true });
  const config = { mode: 'pages', workflowUrl: repository ? `https://github.com/${repository}/actions/workflows/update-quality.yml` : '' };
  await fs.writeFile(path.join(outDir, 'config.js'), `window.QUALITY_CONFIG = ${JSON.stringify(config)};\n`);
  await fs.writeFile(path.join(outDir, 'data', 'quality-history.js'), `window.QUALITY_HISTORY = ${JSON.stringify(snapshots)};\n`);
  await fs.writeFile(path.join(outDir, 'data', 'quality-history.json'), JSON.stringify(snapshots));
  let html = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
  for (const asset of ['styles.css', 'app.js', 'config.js', 'data/quality-history.js', 'quality-map.js', 'map-model.js', 'unit-detail.js', 'unit-leader-model.js', 'branch-model.js', 'branch-page.js', 'data/branch-assignments.js', 'data/hanoi-boundaries.js', 'vendor/leaflet.css', 'vendor/leaflet.js', 'vendor/chart.umd.js', 'vendor/lucide.js']) {
    const revision = createHash('sha256').update(await fs.readFile(path.join(outDir, asset))).digest('hex').slice(0, 12);
    html = html.replaceAll(`"${asset}"`, `"${asset}?v=${revision}"`);
  }
  await fs.writeFile(path.join(outDir, 'index.html'), html);
  await fs.writeFile(path.join(outDir, '.nojekyll'), '');
  console.log(`Pages built: ${outDir}; ${snapshots.length} saved days.`);
  return snapshots;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) buildPages().catch(error => { console.error(error.message); process.exitCode = 1; });
