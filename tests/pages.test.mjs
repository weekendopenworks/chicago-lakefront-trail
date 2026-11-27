import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

test('page validation is read-only, explicit refresh preserves assets, and failed writes roll back', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lakefront-pages-test-'));
  const inventory = (directory = path.join(root, 'public')) => Object.fromEntries(fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? Object.entries(inventory(file)) : [[path.relative(root, file), createHash('sha256').update(fs.readFileSync(file)).digest('hex')]];
  }));
  const run = (args = [], preload = []) => spawnSync(process.execPath, [...preload, 'scripts/pages/update-pages.mjs', ...args], { cwd: root, encoding: 'utf8' });
  const succeeds = result => assert.equal(result.status, 0, result.stderr || result.stdout);
  try {
    for (const directory of ['public', 'scripts', 'data/geography', 'data/places', 'data/photos']) {
      fs.cpSync(directory, path.join(root, directory), { recursive: true });
    }
    const original = inventory();
    succeeds(run(['--check']));
    assert.deepEqual(inventory(), original);
    const sourcePath = path.join(root, 'data/places/places.json');
    const source = JSON.parse(fs.readFileSync(sourcePath));
    source[0].description += ' Editorial correction.';
    fs.writeFileSync(sourcePath, JSON.stringify(source));
    assert.notEqual(run(['--check']).status, 0, 'Stale committed pages must fail validation');
    assert.deepEqual(inventory(), original, 'Validation must not repair stale pages');
    succeeds(run());
    succeeds(run(['--check']));
    const refreshed = inventory();
    assert.notEqual(refreshed['public/places-data.json'], original['public/places-data.json']);
    for (const [file, hash] of Object.entries(original).filter(([file]) => /\/(?:assets|fonts)\/|\.(?:css|js)$|\/map-config\.json$/.test(file))) {
      assert.equal(refreshed[file], hash, `Page refresh must preserve ${file}`);
    }
    source[0].description += ' Another correction.';
    fs.writeFileSync(sourcePath, JSON.stringify(source));
    const preload = path.join(root, 'fail-write.cjs');
    fs.writeFileSync(preload, "const fs = require('node:fs'); const write = fs.writeFileSync; let calls = 0; fs.writeFileSync = function (...args) { if (++calls === 3) throw new Error('Injected write failure'); return write.apply(this, args); };\n");
    assert.notEqual(run([], ['--require', preload]).status, 0);
    assert.deepEqual(inventory(), refreshed, 'Partial page writes must restore the previous complete website');
    fs.unlinkSync(path.join(root, 'public/places-data.json'));
    const missingRuntime = inventory();
    assert.notEqual(run([], ['--require', preload]).status, 0);
    assert.deepEqual(inventory(), missingRuntime, 'Rollback must also remove newly created files');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
