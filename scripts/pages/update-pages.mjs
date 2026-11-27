import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readAndValidate } from '../lib/data-validation.mjs';
import { checkMapInputs } from '../lib/map-inputs.mjs';

assert(process.argv.slice(2).every(arg => arg === '--check'), 'Usage: npm run update:pages [-- --check]');
readAndValidate();
checkMapInputs();
// Rendering strings has no filesystem side effects. Check mode only compares them.
const home = await import('./render-home.mjs');
const pages = await import('./render-pages.mjs');
const files = new Map([...home.files, ...pages.files]);
if (process.argv.includes('--check')) {
  const stale = [...files].filter(([file, contents]) => !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== contents);
  assert.equal(stale.length, 0, `Pages need refreshing: ${stale.map(([file]) => file).join(', ')}. Run npm run update:pages and review the changes.`);
  console.log(`PASS: ${files.size} committed page/data files match their editorial inputs; no files written.`);
} else {
  // Prepare all content before changing any file; restore it on a write failure.
  const previous = new Map([...files.keys()].map(file => [file, fs.existsSync(file) ? fs.readFileSync(file) : null]));
  const createdDirectories = [];
  try {
    for (const [file, contents] of files) {
      const directory = path.dirname(file);
      if (!fs.existsSync(directory)) {
        const missing = [];
        for (let parent = directory; !fs.existsSync(parent); parent = path.dirname(parent)) missing.unshift(parent);
        fs.mkdirSync(directory, { recursive: true });
        createdDirectories.push(...missing);
      }
      fs.writeFileSync(file, contents);
    }
  } catch (error) {
    for (const [file, contents] of previous) {
      if (contents === null) fs.rmSync(file, { force: true });
      else fs.writeFileSync(file, contents);
    }
    for (const directory of createdDirectories.reverse()) if (fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
    throw error;
  }
  console.log(`Updated ${files.size} page/data files in public/. Review the diff; map assets were not regenerated.`);
}
