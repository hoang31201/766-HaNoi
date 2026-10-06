import fs from 'node:fs/promises';
import path from 'node:path';
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
  for (const file of ['index.html', 'styles.css', 'app.js']) await fs.copyFile(path.join(sourceRoot, 'webapp', file), path.join(outDir, file));
  const config = { mode: 'pages', workflowUrl: repository ? `https://github.com/${repository}/actions/workflows/update-quality.yml` : '' };
  await fs.writeFile(path.join(outDir, 'config.js'), `window.QUALITY_CONFIG = ${JSON.stringify(config)};\n`);
  await fs.writeFile(path.join(outDir, 'data', 'quality-history.js'), `window.QUALITY_HISTORY = ${JSON.stringify(snapshots)};\n`);
  await fs.writeFile(path.join(outDir, 'data', 'quality-history.json'), JSON.stringify(snapshots));
  await fs.writeFile(path.join(outDir, '.nojekyll'), '');
  console.log(`Pages built: ${outDir}; ${snapshots.length} saved days.`);
  return snapshots;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) buildPages().catch(error => { console.error(error.message); process.exitCode = 1; });
