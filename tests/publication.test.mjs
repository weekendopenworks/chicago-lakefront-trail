import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('publication requires an exact manifest and cannot export private or symlinked files', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'lakefront-export-test-'));
  const root = path.join(temporary, 'source');
  fs.mkdirSync(root);
  const write = (file, text = '') => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text); };
  for (const dir of ['public', 'data/artwork', 'data/geography', 'data/places', 'data/photos', 'scripts', 'tests', 'docs', '.github']) write(`${dir}/fixture.txt`);
  for (const file of ['.editorconfig', '.gitignore', 'package-lock.json', 'vercel.json', 'README.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md', 'THIRD_PARTY_NOTICES.md']) write(file);
  write('package.json', '{"type":"module"}');
  for (const file of ['scripts/publication.mjs', 'scripts/lib/public-files.mjs', 'scripts/validation/check-secrets.mjs']) write(file, fs.readFileSync(file));
  const run = (...args) => spawnSync(process.execPath, [path.join(root, 'scripts/publication.mjs'), ...args], { encoding: 'utf8' });
  const fails = (...args) => assert.notEqual(run(...args).status, 0, args.join(' '));
  try {
    write('.git/config', 'private configuration');
    write('.env', 'private environment');
    write('dist/index.html', 'obsolete output');
    write('public/index.html', 'committed website');
    assert.equal(run('manifest').status, 0);
    assert.equal(run('check').status, 0);
    write('public/new.txt', 'new source'); fails('check'); fs.unlinkSync(path.join(root, 'public/new.txt'));
    write('README.md', 'changed'); fails('check'); write('README.md');
    fs.symlinkSync(path.join(root, '.env'), path.join(root, 'public/link')); fails('manifest'); fs.unlinkSync(path.join(root, 'public/link'));
    write('public/canary.txt', 'ghp_' + 'A'.repeat(36));
    assert.equal(run('manifest').status, 0); fails('check'); fs.unlinkSync(path.join(root, 'public/canary.txt'));
    assert.equal(run('manifest').status, 0);
    const existing = path.join(temporary, 'existing'); fs.mkdirSync(existing); fs.writeFileSync(path.join(existing, 'sentinel'), 'keep');
    fails('export', existing); assert.equal(fs.readFileSync(path.join(existing, 'sentinel'), 'utf8'), 'keep');
    fs.symlinkSync(root, path.join(temporary, 'alias'));
    fails('export', path.join(temporary, 'alias', 'export'));
    const exported = path.join(temporary, 'exported');
    assert.equal(run('export', exported).status, 0);
    for (const excluded of ['.git', '.env', 'dist']) assert(!fs.existsSync(path.join(exported, excluded)));
    assert.equal(fs.readFileSync(path.join(exported, 'public/index.html'), 'utf8'), 'committed website');
    const verify = spawnSync(process.execPath, [path.join(exported, 'scripts/publication.mjs'), 'check']);
    assert.equal(verify.status, 0);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
