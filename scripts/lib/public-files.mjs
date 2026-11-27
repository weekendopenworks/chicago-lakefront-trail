import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const directories = ['public', 'data/artwork', 'data/geography', 'data/places', 'data/photos', 'scripts', 'tests', 'docs', '.github'];
const topLevel = ['.editorconfig', '.gitignore', 'package.json', 'package-lock.json', 'vercel.json', 'README.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md', 'THIRD_PARTY_NOTICES.md'];
export function publicFiles() {
  const files = [];
  function visit(file) {
    const stat = fs.lstatSync(file);
    assert(!stat.isSymbolicLink(), `Publication refuses symlinks: ${file}`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) {
        assert(!name.startsWith('.') && name !== '__pycache__', `Unexpected hidden/cache file in public source: ${file}/${name}`);
        visit(path.posix.join(file, name));
      }
    } else {
      assert(stat.isFile(), `Not a regular public file: ${file}`);
      assert(!/\.(?:pem|key|p12|pfx|log|tmp|bak|zip|tar|gz)$/i.test(file), `Unexpected private/archive file: ${file}`);
      files.push(file);
    }
  }
  for (const file of [...topLevel, ...directories]) visit(file);
  if (fs.existsSync('LICENSE')) visit('LICENSE');
  return files.sort();
}
