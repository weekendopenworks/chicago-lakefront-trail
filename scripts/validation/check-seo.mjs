import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {SITE_URL, siteUrl} from '../../scripts/pages/templates/site-seo.mjs';

const files=[];
function walk(directory){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name);
    if(entry.isDirectory())walk(file);else files.push(file);
  }
}
walk('public');
const pages=files.filter(file=>file.endsWith('.html'));
const places=JSON.parse(fs.readFileSync('data/places/places.json','utf8'));
const canonicalPages=new Set();
const titles=new Set();
const descriptions=new Set();

function checkStructuredUrls(value,file){
  if(!value||typeof value!=='object')return;
  for(const [key,child] of Object.entries(value)){
    if(['@id','url','item','image'].includes(key)&&typeof child==='string'){
      const url=new URL(child);
      assert.equal(url.origin,SITE_URL,`${file}: structured ${key} origin`);
      assert(!url.search,`${file}: structured URL must omit query parameters`);
      const target=path.join('public',url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname);
      assert(fs.existsSync(target),`${file}: missing structured URL target ${child}`);
    }else checkStructuredUrls(child,file);
  }
}

for(const file of pages){
  const html=fs.readFileSync(file,'utf8');
  const route='/'+path.relative('public',file).replace(/index\.html$/,'');
  const canonical=[...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)];
  assert.equal(canonical.length,1,`${file}: exactly one canonical`);
  assert.equal(canonical[0][1],siteUrl(route),`${file}: canonical route`);
  canonicalPages.add(canonical[0][1]);
  const meta=Object.fromEntries([...html.matchAll(/<meta (?:name|property)="([^"]+)" content="([^"]*)"/g)].map(match=>[match[1],match[2]]));
  const title=html.match(/<title>(.*?)<\/title>/s)?.[1];
  assert(title&&!titles.has(title),`${file}: unique title`);titles.add(title);
  assert(meta.description&&!descriptions.has(meta.description),`${file}: unique description`);descriptions.add(meta.description);
  assert.equal(meta['og:url'],siteUrl(route));
  assert.equal(meta['og:title'],title);
  assert.equal(meta['twitter:title'],title);
  assert.equal(meta['og:description'],meta.description);
  assert.equal(meta['twitter:description'],meta.description);
  assert.equal(meta['twitter:card'],'summary_large_image');
  assert(meta.robots.includes('index, follow')&&!/noindex|nofollow|nosnippet/.test(meta.robots));
  for(const key of ['og:image','twitter:image']){
    const url=new URL(meta[key]);
    assert.equal(url.origin,SITE_URL,`${file}: ${key}`);
    assert(fs.existsSync(path.join('public',url.pathname)),`${file}: social image exists`);
    assert(meta[`${key}:alt`],`${file}: social image description`);
  }
  const json=html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
  assert(json,`${file}: structured data`);
  const schema=JSON.parse(json[1]);
  assert(schema['@graph'].some(entity=>entity['@id']===siteUrl('/#website')));
  assert(schema['@graph'].some(entity=>entity['@id']===siteUrl(route)+'#webpage'));
  checkStructuredUrls(schema,file);
  if(route==='/places/'){
    const list=schema['@graph'].find(entity=>entity['@type']==='ItemList');
    assert.equal(list.numberOfItems,places.length);
    assert.equal(list.itemListElement.length,places.length);
    for(const place of places)assert(html.includes(`id="${place.id}"`),`HTML discovery ${place.id}`);
  }
  assert.equal((html.match(/src="\/_vercel\/insights\/script\.js"/g)||[]).length,1,`${file}: analytics exactly once`);
  assert(!/googletagmanager|GTM-|gtag\(/.test(html),`${file}: no Google tracking`);
  assert(html.includes('href="/privacy/"'),`${file}: privacy link in footer`);
}

const sitemap=fs.readFileSync('public/sitemap.xml','utf8');
const locations=[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match=>match[1]);
assert.equal(locations.length,canonicalPages.size,'No duplicate sitemap URLs');
assert.deepEqual(new Set(locations),canonicalPages,'Every indexable page in sitemap');
const robots=fs.readFileSync('public/robots.txt','utf8');
assert.match(robots,/User-agent: \*\nAllow: \/\n/);
assert(robots.includes(`Sitemap: ${siteUrl('/sitemap.xml')}`));
assert(!/^Disallow:\s*\S/m.test(robots),'Crawlers can access the public site');
const readingIndex=fs.readFileSync('public/llms.txt','utf8');
for(const url of canonicalPages)assert(readingIndex.includes(`](${url})`),`Text index includes ${url}`);

const legacyHost=/\blakefronttrail\.org\b|https?:\/\/lakefront[^/\s"'<>]*\.vercel\.app\b/i;
for(const file of files.filter(file=>/\.(html|xml|txt|js|json|css|svg)$/.test(file))){
  assert(!legacyHost.test(fs.readFileSync(file,'utf8')),`${file}: legacy site host`);
}

// Exercise the real share handler: copies use the canonical origin, including on previews.
const app=fs.readFileSync('public/app.js','utf8');
const share=app.match(/^async function share\(id\)\{.*$/m)?.[0];
assert(share,'Share handler exists');
const copied=[];
const context={URL,currentLat:41.91234,document:{querySelector:()=>({href:siteUrl('/')})},navigator:{clipboard:{writeText:async url=>copied.push(url)}},toast:()=>{}};
vm.createContext(context);
vm.runInContext(share,context);
await context.share('navy-pier');
await context.share();
assert.deepEqual(copied,[siteUrl('/?place=navy-pier'),siteUrl('/?at=41.9123')]);

const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
assert.equal(config.cleanUrls,true);assert.equal(config.trailingSlash,true);
console.log(`PASS: ${pages.length} canonical pages, complete sitemap/text index, structured URLs, social cards, analytics, crawler access, share state and URL normalization settings.`);
