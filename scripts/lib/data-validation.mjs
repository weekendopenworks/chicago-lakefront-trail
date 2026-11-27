import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export function publicUrl(value, label = 'URL') {
  assert.equal(typeof value, 'string', `${label}: expected a URL`);
  assert(!/[\u0000-\u0020\\]/.test(value), `${label}: unsafe URL characters`);
  const url = new URL(value);
  assert.equal(url.protocol, 'https:', `${label}: HTTPS required`);
  assert(!url.username && !url.password, `${label}: credentials are forbidden`);
  assert(!/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[)/i.test(url.hostname)
    && url.hostname.includes('.') && !/\.(?:localhost|local|internal)$/.test(url.hostname), `${label}: public host required`);
  return value;
}

export function validateData(places, photos, reviewed, root = '.') {
  assert(Array.isArray(places) && places.length, 'places must be a nonempty array');
  const ids = new Set();
  for (const p of places) {
    assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.id), `Invalid place identifier: ${p.id}`);
    assert(!ids.has(p.id), `Duplicate place identifier: ${p.id}`);
    ids.add(p.id);
    for (const key of ['name', 'description', 'fact', 'practical', 'access', 'regionName', 'pointKind']) {
      assert(typeof p[key] === 'string' && p[key].trim(), `${p.id}: missing ${key}`);
    }
    assert(['beach', 'nature', 'harbor', 'landmark'].includes(p.category), `${p.id}: invalid category`);
    assert(Number.isInteger(p.region) && p.region >= 0 && p.region < 10, `${p.id}: invalid region`);
    assert(Number.isFinite(p.lat) && p.lat > 41.76 && p.lat < 42, `${p.id}: latitude outside atlas`);
    assert(Number.isFinite(p.lon) && p.lon > -87.68 && p.lon < -87.55, `${p.id}: longitude outside atlas`);
    assert(Array.isArray(p.sourceUrls) && p.sourceUrls.length, `${p.id}: source URLs required`);
    for (const url of [...p.sourceUrls, p.officialUrl, p.coordinateUrl, ...(p.coordinateMapUrl ? [p.coordinateMapUrl] : [])]) publicUrl(url, p.id);
    assert(Array.isArray(p.related), `${p.id}: related places must be an array`);
    if (p.story) assert(Array.isArray(p.story) && p.story.every(t => typeof t === 'string' && t.trim()), `${p.id}: story paragraphs required`);
  }
  for (const p of places) for (const id of p.related) assert(ids.has(id) && id !== p.id, `${p.id}: invalid related place ${id}`);
  assert.deepEqual(Object.keys(photos).sort(), Object.keys(reviewed).sort(), 'Photo and reviewed manifests disagree');
  for (const [id, p] of Object.entries(photos)) {
    assert(ids.has(id), `Photo refers to unknown place: ${id}`);
    for (const key of ['alt', 'title', 'author', 'license']) assert(typeof p[key] === 'string' && p[key].trim(), `${id}: missing photo ${key}`);
    for (const key of ['sourceUrl', 'licenseUrl']) publicUrl(p[key], `${id}: ${key}`);
    assert(/^\/assets\/photos\/[a-z0-9-]+\.(webp|jpg|png)$/.test(p.src), `${id}: unsafe photo path`);
    assert(fs.existsSync(path.join(root, 'public', p.src)), `${id}: missing photo asset`);
    assert(Number.isInteger(p.width) && p.width > 0 && Number.isInteger(p.height) && p.height > 0, `${id}: photo dimensions required`);
    assert(!p.fit || p.fit === 'contain', `${id}: unsupported photo fit`);
    assert.equal(p.title, reviewed[id].title, `${id}: reviewed title differs`);
    assert.equal(p.sourceUrl, reviewed[id].sourceUrl, `${id}: reviewed source differs`);
    if (p.license.includes('BY-ND')) assert.equal(p.fit, 'contain', `${id}: preserve full composition`);
  }
}

export function readAndValidate(root = '.') {
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const places = read('data/places/places.json');
  const photos = read('data/photos/photos.json');
  validateData(places, photos, read('data/photos/reviewed-photos.json'), root);
  validateMapData(read('data/geography/geography.json'), read('data/geography/trail-routes.json'), read('data/geography/map-landmarks.json'), places, root);
  return { places, photos };
}

export function validateMapData(geography, routes, landmarks, places, root = '.') {
  const coordinate = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
  const points = (values, label) => assert(Array.isArray(values) && values.length && values.every(coordinate), `${label}: invalid geographic points`);
  points(geography.shoreline, 'Shoreline');
  for (const [layer, features] of Object.entries(geography)) {
    if (!Array.isArray(features) || !features.length || typeof features[0] !== 'object' || Array.isArray(features[0])) continue;
    const ids = new Set();
    for (const feature of features) {
      assert(/^(?:relation:)?\d+$/.test(feature.id), `${layer}: unsafe feature identifier`);
      assert(!ids.has(feature.id), `${layer}: duplicate feature ${feature.id}`); ids.add(feature.id);
      points(feature.points, `${layer}/${feature.id}`);
      for (const ring of feature.rings ?? []) points(ring.points, `${layer}/${feature.id} ring`);
    }
  }
  const ids = new Set();
  for (const feature of routes.features) {
    assert(/^\d+$/.test(feature.id) && !ids.has(feature.id), 'Invalid or duplicate route identifier'); ids.add(feature.id);
    assert(['walk', 'bike', 'shared'].includes(feature.mode), `${feature.id}: unsafe route mode`);
    assert(feature.modes.every(mode => ['walk', 'bike'].includes(mode)), `${feature.id}: unsafe route modes`);
    points(feature.points, `Route ${feature.id}`);
    assert(feature.nodeIds.length === feature.points.length && feature.nodeIds.every(id => /^\d+$/.test(id)), `${feature.id}: invalid route nodes`);
  }
  for (const route of Object.values(routes.routes)) for (const member of route.members) assert(ids.has(member.ref), `Missing route member ${member.ref}`);
  for (const landmark of landmarks) {
    assert(places.some(p => p.id === landmark.place), 'Unknown landmark place');
    assert(/^[a-z0-9-]+$/.test(landmark.asset), 'Unsafe landmark asset path');
    assert(Number.isFinite(landmark.width) && landmark.width > 0 && Number.isFinite(landmark.height) && landmark.height > 0, 'Invalid landmark dimensions');
    if (landmark.render === 'footprint') points(landmark.footprint.points, landmark.place);
    else assert(fs.existsSync(path.join(root, 'public/assets', landmark.asset + '.webp')), `Missing landmark asset ${landmark.asset}`);
    if (landmark.anchor) assert(coordinate([landmark.anchor.lon, landmark.anchor.lat]), 'Invalid landmark anchor');
  }
}
