import fs from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const record = 'data/geography/map-inputs.json';
export function mapInputs() {
  const hash = value => createHash('sha256').update(value).digest('hex');
  const inputs = {};
  const files = ['data/geography/geography.json', 'data/geography/trail-routes.json', 'data/geography/map-landmarks.json',
    'scripts/map/build-map.mjs', 'scripts/map/render-map.mjs', 'scripts/lib/map-coordinates.mjs', 'scripts/lib/trail-geometry.mjs', 'scripts/lib/street-labels.mjs'];
  const landmarks = JSON.parse(fs.readFileSync('data/geography/map-landmarks.json'));
  files.push(...new Set(landmarks.filter(p => p.render !== 'footprint').map(p => `public/assets/${p.asset}.webp`)));
  for (const file of files.sort()) inputs[file] = hash(fs.readFileSync(file));
  const places = JSON.parse(fs.readFileSync('data/places/places.json'));
  inputs['place-anchors'] = hash(JSON.stringify(places.map(({ id, name, lat, lon }) => ({ id, name, lat, lon }))));
  return inputs;
}
export function checkMapInputs() {
  const saved = JSON.parse(fs.readFileSync(record));
  assert.deepEqual(mapInputs(), saved.inputs, 'Map inputs changed: run npm run map:generate, inspect the map, then include the updated assets.');
  for (const [file, expected] of Object.entries(saved.outputs)) {
    const actual = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    assert.equal(actual, expected, `Approved map asset changed: ${file}`);
  }
}
export function recordMapInputs() {
  const files = fs.readdirSync('public/assets/map').map(name => `public/assets/map/${name}`);
  files.push('public/map-config.json', 'data/geography/map-tile-manifest.json');
  const outputs = Object.fromEntries(files.sort().map(file => [file, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
  fs.writeFileSync(record, JSON.stringify({ inputs: mapInputs(), outputs }, null, 2) + '\n');
}
