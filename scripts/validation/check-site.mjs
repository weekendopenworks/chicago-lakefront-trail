import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve('public');const files=[];function walk(dir){for(const f of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,f.name);f.isDirectory()?walk(p):files.push(p)}}walk(root);
const failures=[];let links=0;for(const file of files.filter(f=>f.endsWith('.html'))){const html=fs.readFileSync(file,'utf8');if((html.match(/<h1\b/g)||[]).length!==1)failures.push(file+' must have one H1');for(const [,attr,url] of html.matchAll(/\b(href|src)="([^"]+)"/g)){if(!url.startsWith('/')||url.startsWith('//')||url==='/_vercel/insights/script.js')continue;let [pathname,fragment]=url.split('#');pathname=pathname.split('?')[0];let target=path.join(root,decodeURIComponent(pathname));if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');if(!fs.existsSync(target))failures.push(`${file}: missing ${url}`);else if(fragment&&target.endsWith('.html')&&!fs.readFileSync(target,'utf8').includes(`id="${fragment}"`))failures.push(`${file}: missing anchor ${url}`);links++}assert(html.includes('rel="canonical"'));assert(html.includes('name="description"'));}
// Check fonts/background images and native module imports as well as HTML links.
for (const file of files.filter(file => /\.(css|js)$/.test(file))) {
  const text = fs.readFileSync(file, 'utf8');
  const references = file.endsWith('.css')
    ? [...text.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g)].map(match => match[1])
    : [...text.matchAll(/\b(?:import|export)\s+(?:[^;'"\n]*?\s+from\s*)?['"]([^'"]+)['"]/g)].map(match => match[1]);
  for (const reference of references) {
    if (/^(?:[a-z]+:|\/\/|#)/i.test(reference)) continue;
    const pathname = decodeURIComponent(reference.split(/[?#]/)[0]);
    const target = pathname.startsWith('/') ? path.resolve(root, '.' + pathname) : path.resolve(path.dirname(file), pathname);
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) failures.push(`${file}: missing or invalid ${reference}`);
    links++;
  }
}
const places=JSON.parse(fs.readFileSync('public/places-data.json'));const sourcePlaces=JSON.parse(fs.readFileSync('data/places/places.json'));assert.equal(places.length,sourcePlaces.length);assert(places.length>=110,'Substantial attraction collection');assert.equal(new Set(places.map(p=>p.id)).size,places.length);
for(const p of places){assert(p.lat>41.76&&p.lat<42&&p.lon>-87.68&&p.lon< -87.55);assert(p.sourceUrls.length);if(p.photo){assert(p.photo.license&&p.photo.author&&p.photo.sourceUrl);assert(fs.existsSync(path.join(root,p.photo.src)))}assert(p.coordinateUrl?.startsWith('https://www.openstreetmap.org/')||(p.coordinateUrl?.startsWith('https://www.chicagoparkdistrict.com/parks-facilities/')&&p.pointKind==='official habitat reference point'&&p.sourceUrls.includes(p.coordinateUrl)&&p.coordinateMapUrl?.startsWith('https://www.openstreetmap.org/')),`${p.id} coordinate source`);assert(p.pointKind,`${p.id} point meaning`);for(const id of p.related??[])assert(places.some(x=>x.id===id),`${p.id}: unknown related place ${id}`);if(p.story)assert(fs.existsSync(path.join(root,'places',p.id,'index.html')))}
const reviewed=JSON.parse(fs.readFileSync('data/photos/reviewed-photos.json'));const photoAudit=JSON.parse(fs.readFileSync('data/photos/photo-audit.json'));assert.equal(photoAudit.photoCount,places.filter(p=>p.photo).length);assert.equal(photoAudit.places.length,places.length);
for(const p of places.filter(p=>p.photo)){const ph=p.photo;assert.equal(reviewed[p.id].title,ph.title);assert.equal(reviewed[p.id].sourceUrl,ph.sourceUrl);assert(ph.licenseUrl.startsWith('https://'));assert(ph.width>0&&ph.height>0,`${p.id}: intrinsic dimensions`);if(ph.width/ph.height<1.5||ph.width/ph.height>2.3||ph.license.includes('BY-ND'))assert.equal(ph.fit,'contain',`${p.id}: preserve full subject`)}
const cfg=JSON.parse(fs.readFileSync('public/map-config.json'));assert.equal(cfg.height,6900);for(let i=0;i<10;i++){const svg=fs.readFileSync(`public/assets/map/section-${i}.svg`,'utf8');assert(svg.includes(`viewBox="0 ${i*690} ${cfg.width} 690"`));assert(svg.includes('</svg>'));for(const [,p] of svg.matchAll(/href="(\/assets\/[^"]+)"/g))assert(fs.existsSync(path.join(root,p)),p)}
for(let row=0;row<10;row++)for(let col=0;col<4;col++)assert(fs.statSync(`public/assets/map/tile-${row}-${col}.webp`).size>500);
if(failures.length){console.error(failures.join('\n'));process.exit(1)}console.log(`PASS: ${files.filter(f=>f.endsWith('.html')).length} HTML pages, ${links} local links/assets, ${places.length} unique places, 40 display tiles, photo attribution records and structured metadata.`);
