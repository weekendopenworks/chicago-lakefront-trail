import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readAndValidate } from '../lib/data-validation.mjs';
import { recordMapInputs } from '../lib/map-inputs.mjs';

assert(process.argv.slice(2).every(arg => arg === '--force'), 'Usage: npm run map:generate [-- --force]');
const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root);
readAndValidate();
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'lakefront-map-'));
const run = (name, args = []) => execFileSync(process.execPath, [path.join(root, name), ...args], { cwd: stage, stdio: 'inherit' });
try {
  for (const directory of ['public', 'scripts', 'data']) {
    fs.cpSync(directory, path.join(stage, directory), { recursive: true, filter: file => !file.split(path.sep).some(part => ['raw', '__pycache__'].includes(part)) });
  }
  fs.mkdirSync(path.join(stage, '.cache/reports'), { recursive: true });
  run('scripts/map/build-map.mjs');
  run('scripts/map/render-map.mjs', process.argv.includes('--force') ? ['--force'] : []);
  // Record the staged candidates, then refresh and validate the matching pages.
  process.chdir(stage);
  recordMapInputs();
  process.chdir(root);
  run('scripts/pages/update-pages.mjs');
  run('scripts/validation/check-site.mjs');
  run('scripts/validation/check-geography.mjs');
  run('scripts/validation/check-trail-geometry.mjs');
  // Read the staged configuration so regeneration can restore a missing one.
  process.chdir(stage);
  const home = await import('../pages/render-home.mjs');
  const pages = await import('../pages/render-pages.mjs');
  process.chdir(root);
  const targets = ['public/assets/map', 'public/map-config.json', ...home.files.keys(), ...pages.files.keys(),
    ...['map-inputs', 'map-tile-manifest', 'map-performance', 'map-render-audit', 'trail-render-audit'].map(name => `data/geography/${name}.json`)];
  const backup = path.join(stage, 'backup');
  const existed = new Set(targets.filter(target => fs.existsSync(target)));
  for (const target of existed) fs.cpSync(target, path.join(backup, target), { recursive: true });
  try {
    for (const target of targets) fs.cpSync(path.join(stage, target), target, { recursive: true });
  } catch (error) {
    for (const target of targets) {
      fs.rmSync(target, { recursive: true, force: true });
      if (existed.has(target)) fs.cpSync(path.join(backup, target), target, { recursive: true });
    }
    throw error;
  }
  console.log('Updated map assets and matching pages. Review their appearance and source changes before committing.');
} finally {
  process.chdir(root);
  fs.rmSync(stage, { recursive: true, force: true });
}
