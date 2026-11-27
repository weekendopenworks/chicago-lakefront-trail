import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { publicUrl, validateData, validateMapData } from '../scripts/lib/data-validation.mjs';
import { seoHead } from '../scripts/pages/templates/site-seo.mjs';
import { scanFiles } from '../scripts/validation/check-secrets.mjs';
const read = name => JSON.parse(fs.readFileSync(name));
const source = read('data/places/places.json');
const photos = read('data/photos/photos.json');
const reviewed = read('data/photos/reviewed-photos.json');

test('private-path scan covers Linux, macOS, Windows and WSL without flagging source URLs', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'lakefront-private-path-test-'));
  const file = path.join(temporary, 'fixture.txt');
  const windows = ['C:', 'Users', 'fixture-user', 'project'].join('\\');
  try {
    const privatePaths = [
      ['', 'home', 'fixture-user', 'project'].join('/'),
      ['', 'Users', 'fixture-user', 'project'].join('/'),
      windows, JSON.stringify(windows), windows.replaceAll('\\', '/'),
      ...['wsl.localhost', 'wsl$'].map(host => ['', '', host, 'Ubuntu', 'home', 'fixture-user', 'project'].join('\\')),
    ];
    for (const value of privatePaths) {
      fs.writeFileSync(file, value);
      assert(scanFiles([file]).some(finding => finding.rule.startsWith('personal ')), 'Expected a private-path finding');
    }
    fs.writeFileSync(file, 'https://www.chicago.gov/city/en/sites/chicagoriverwalk/home/site-history.html');
    assert.deepEqual(scanFiles([file]), []);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test('rejects executable, credentialed, local and malformed source URLs', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', ['https://', 'user:pass', '@example.com/'].join(''), 'http://example.com', 'https://127.0.0.1/', 'https://example.com/\npath']) assert.throws(() => publicUrl(url));
  assert.equal(publicUrl('https://www.openstreetmap.org/way/123'), 'https://www.openstreetmap.org/way/123');
});
test('rejects identifiers, coordinates and links that can corrupt generated output', () => {
  for (const change of [p => { p.id = '../escape'; }, p => { p.lat = NaN; }, p => { p.related = ['not-a-place']; }, p => { p.officialUrl = 'javascript:alert(1)'; }]) {
    const records = structuredClone(source); change(records[0]);
    assert.throws(() => validateData(records, photos, reviewed));
  }
  assert.throws(() => validateData([...source, source[0]], photos, reviewed), /Duplicate/);
});
test('rejects photo path traversal and missing attribution', () => {
  for (const change of [p => { p.src = '/assets/photos/../../private'; }, p => { p.author = ''; }, p => { p.licenseUrl = 'javascript:alert(1)'; }]) {
    const records = structuredClone(photos); change(Object.values(records)[0]);
    assert.throws(() => validateData(source, records, reviewed));
  }
});
test('editorial text cannot terminate structured-data scripts', () => {
  const head = seoHead({ title: '</script><img src=x onerror=alert(1)>', description: '"<&', route: '/' });
  assert(!head.includes('<img src=x'));
  const json = head.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1];
  assert.equal(JSON.parse(json)['@graph'][1].name, '</script><img src=x onerror=alert(1)>');
});

test('map data cannot embed arbitrary files or inject SVG attributes', () => {
  const geography = read('data/geography/geography.json');
  const routes = read('data/geography/trail-routes.json');
  const landmarks = read('data/geography/map-landmarks.json');
  const badLandmarks = structuredClone(landmarks); badLandmarks[1].asset = '../../../private';
  assert.throws(() => validateMapData(geography, routes, badLandmarks, source), /Unsafe landmark/);
  const badRoutes = structuredClone(routes); badRoutes.features[0].mode = '" onload="alert(1)';
  assert.throws(() => validateMapData(geography, badRoutes, landmarks, source), /unsafe route mode/);
});
