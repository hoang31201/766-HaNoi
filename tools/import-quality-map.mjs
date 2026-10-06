import fs from 'node:fs/promises';
import path from 'node:path';
import { root } from './quality-data.mjs';

const revision = '8b78ba5118715e1fa81769286724db79346abf52';
const repository = 'thanglequoc/vietnamese-provinces-database';
const raw = `https://raw.githubusercontent.com/${repository}/${revision}/`;
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response;
}
const listing = await (await download(`https://api.github.com/repos/${repository}/contents/json/geojson/01_ha_noi/wards?ref=${revision}`)).json();
if (!Array.isArray(listing) || listing.length !== 126) throw new Error('Expected 126 Hanoi boundaries');
const features = [];
// Fetch sequentially so the one-time import does not flood the source server.
for (const file of listing) {
  const collection = await (await download(file.download_url)).json();
  for (const feature of collection.features) {
    if (!['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)) throw new Error(`Invalid geometry: ${file.name}`);
    features.push({ type: 'Feature', id: feature.id, properties: { code: feature.properties.code, name: feature.properties.fullName, areaKm2: feature.properties.areaKm2 }, geometry: feature.geometry });
  }
}
if (features.length !== 126 || new Set(features.map(f => f.id)).size !== 126) throw new Error('Duplicate or missing boundary');
const city = await (await download(raw + 'json/geojson/01_ha_noi/01_ha_noi.geojson')).json();
const data = { type: 'FeatureCollection', features, city: city.features[0], source: { repository: `https://github.com/${repository}`, revision, license: 'MIT', importedAt: new Date().toISOString() } };
await fs.mkdir(path.join(root, 'webapp/data'), { recursive: true });
await fs.writeFile(path.join(root, 'webapp/data/hanoi-boundaries.js'), `window.HANOI_BOUNDARIES = ${JSON.stringify(data)};\n`);
const vendor = path.join(root, 'webapp/vendor');
await fs.mkdir(path.join(vendor, 'images'), { recursive: true });
const assets = {
  'leaflet.js': 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'leaflet.css': 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'leaflet-LICENSE.txt': 'https://raw.githubusercontent.com/Leaflet/Leaflet/v1.9.4/LICENSE',
  'chart.umd.js': 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.js',
  'chart-LICENSE.txt': 'https://raw.githubusercontent.com/chartjs/Chart.js/v4.5.1/LICENSE.md',
  'lucide.js': 'https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js',
  'lucide-LICENSE.txt': 'https://unpkg.com/lucide@0.468.0/LICENSE',
  'boundaries-LICENSE.txt': raw + 'LICENSE',
};
for (const [file, url] of Object.entries(assets)) await fs.writeFile(path.join(vendor, file), Buffer.from(await (await download(url)).arrayBuffer()));
for (const file of ['layers.png', 'layers-2x.png', 'marker-icon.png', 'marker-icon-2x.png', 'marker-shadow.png']) await fs.writeFile(path.join(vendor, 'images', file), Buffer.from(await (await download('https://unpkg.com/leaflet@1.9.4/dist/images/' + file)).arrayBuffer()));
console.log(`Imported ${features.length} boundaries and pinned open-source libraries.`);
