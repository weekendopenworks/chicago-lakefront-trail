import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readAndValidate } from '../lib/data-validation.mjs';
import { checkMapInputs } from '../lib/map-inputs.mjs';

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.name !== 'raw' && e.name !== '__pycache__').flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
}
const files = ['public', 'scripts', 'tests', 'data'].flatMap(walk);
for (const file of files) {
  if (/\.(js|mjs)$/.test(file)) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (file.endsWith('.json')) JSON.parse(fs.readFileSync(file, 'utf8'));
  if (/\.(js|mjs|py|css|html|md)$/.test(file)) {
    const text = fs.readFileSync(file, 'utf8');
    assert(!text.includes('\r'), `${file}: use LF line endings`);
    assert(!/^(<{7}|={7}|>{7})/m.test(text), `${file}: unresolved conflict`);
  }
}
const { places, photos } = readAndValidate();
checkMapInputs();
console.log(`PASS: syntax, JSON, ${places.length} place records, ${Object.keys(photos).length} photo records and approved map inputs.`);
