import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { publicFiles } from './lib/public-files.mjs';
import { scanFiles } from './validation/check-secrets.mjs';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const manifestPath = 'publication-manifest.json';
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files = publicFiles();
const command = process.argv[2];
if (command === 'manifest') {
  fs.writeFileSync(manifestPath, JSON.stringify({ version: 1, status: 'reviewed file inventory',
    files: files.map(file => ({ path: file, bytes: fs.statSync(file).size, sha256: hash(file) })) }, null, 2) + '\n');
  console.log(`Recorded ${files.length} candidate files. Review every addition/removal before export.`);
} else if (command === 'check' || command === 'export') {
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  assert.equal(manifest.version, 1, 'Unsupported publication manifest');
  assert.deepEqual(manifest.files.map(entry => entry.path), files, 'Manifest differs from public source inventory. Review changes, then run npm run manifest.');
  for (const entry of manifest.files) {
    assert.equal(hash(entry.path), entry.sha256, `Changed since manifest review: ${entry.path}`);
    assert.equal(fs.statSync(entry.path).size, entry.bytes, `Size differs: ${entry.path}`);
  }
  const findings = scanFiles(files);
  assert.deepEqual(findings, [], 'Potential private material in candidate export (values withheld)');
  if (command === 'export') {
    assert(process.argv[3], 'Usage: npm run export -- /path/to/new-directory');
    const destination = path.resolve(process.argv[3]);
    assert(!fs.existsSync(destination), 'Export destination must not already exist');
    let ancestor = path.dirname(destination);
    while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
    const resolvedDestination = path.join(fs.realpathSync(ancestor), path.relative(ancestor, destination));
    const root = fs.realpathSync(process.cwd());
    assert(resolvedDestination !== root && !resolvedDestination.startsWith(root + path.sep), 'Export outside this working tree, including through symlinked parents');
    fs.mkdirSync(destination, { recursive: true });
    try {
      for (const file of [...files, manifestPath]) {
        const target = path.join(destination, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(file, target);
      }
      for (const entry of manifest.files) assert.equal(hash(path.join(destination, entry.path)), entry.sha256, `Exported content changed during copy: ${entry.path}`);
      assert.equal(hash(path.join(destination, manifestPath)), hash(manifestPath), 'Manifest changed during export');
    } catch (error) {
      fs.rmSync(destination, { recursive: true, force: true });
      throw error;
    }
    console.log(`Exported ${files.length + 1} files without history, local configuration, credentials or local caches; public/ is included.`);
  } else console.log(`PASS: ${files.length} candidate files match the candidate manifest hashes and local scan.`);
} else throw new Error('Use manifest, check, or export');
