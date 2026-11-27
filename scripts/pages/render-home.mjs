import {siteHeader,siteFooter,siteScriptUrl} from './templates/site-chrome.mjs';
import {seoHead} from './templates/site-seo.mjs';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const revision=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0,12);
import {MAP,project} from '../lib/map-coordinates.mjs';
const places=JSON.parse(fs.readFileSync('data/places/places.json'));const photos=JSON.parse(fs.readFileSync('data/photos/photos.json'));
for(const p of places){p.photo=photos[p.id]??null;}
export const files = new Map();
const runtimeData = JSON.stringify(places);
files.set('public/places-data.json',runtimeData);
const X=lon=>project([lon,0])[0],Y=lat=>project([0,lat])[1];
const esc=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const left=new Set(['cricket-hill','north-pond','caldwell-lily-pool','lincoln-park-zoo','millennium-park','buckingham-fountain','field-museum','soldier-field','burnham-harbor','burnham-park','griffin-msi','jackson-park','31st-street-beach']);
let html=fs.readFileSync('scripts/pages/templates/index.html','utf8').replace('<!-- SITE_HEADER -->',siteHeader('/')).replace('<!-- SITE_FOOTER -->',siteFooter());
html=html.replace('</head>',`<script type="module" src="${siteScriptUrl()}"></script></head>`);
html=html.replace('<!-- SITE_SEO -->',seoHead({
 title:'Chicago Lakefront Trail Map, Beaches & Attractions',
 description:`Explore Chicago’s Lakefront Trail with an interactive illustrated map of ${places.length} beaches, parks and attractions. 18 miles of cycling and 18.5 miles of walking.`,
 route:'/'
}));
const tiles=Array.from({length:10},(_,row)=>Array.from({length:4},(_,col)=>`<div class="map-tile" data-tile="${row}-${col}" style="left:${col*1300}px;top:${row*MAP.tileHeight}px;width:1300px"><img src="/assets/map/preview-${row}.svg" width="1300" height="${MAP.tileHeight}" alt="" loading="lazy" style="object-position:${col*100/3}% center"></div>`).join('')).join('');
const markers=places.map(p=>`<button class="map-marker ${p.category} ${left.has(p.id)?'align-left':''}" data-place="${p.id}" style="left:${X(p.lon).toFixed(1)}px;top:${Y(p.lat).toFixed(1)}px" aria-label="Discover ${esc(p.name)}"><span class="marker-dot" aria-hidden="true"></span><span class="marker-label">${esc(p.name)}${p.story?`<small>${p.category==='nature'?'A LITTLE ESCAPE':p.category==='beach'?'SAND & SKY':p.category==='harbor'?'BY THE WATER':'A CHICAGO STORY'}</small>`:''}</span></button>`).join('');
const overview=JSON.parse(fs.readFileSync('public/map-config.json')).overview;
const overviewSvg=`<svg viewBox="0 0 ${overview.width} ${overview.height}" id="mini-map" aria-hidden="true"><path d="${overview.paths.shoreline}" fill="none" stroke="#c3cebb" stroke-width="3"/><path d="${overview.paths.walk}" fill="none" stroke="#8d9168" stroke-width="1"/><path d="${overview.paths.bike}" fill="none" stroke="#637e67" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><circle id="mini-dot" cx="${overview.positionSamples[0][1]}" cy="${overview.positionSamples[0][2]}" r="4.5" fill="#b76f4e" stroke="#f6f3e9" stroke-width="2"/></svg>`;
html=html.replace('<!-- TRAIL_OVERVIEW -->',overviewSvg);
html=html.replaceAll('{{PLACE_COUNT}}',String(places.length)).replace('<!-- MAP_TILES -->',tiles).replace('<!-- MAP_MARKERS -->',markers);html=html.replace('id="atlas"',`id="atlas" data-revision="${createHash('sha256').update(runtimeData).digest('hex').slice(0,12)}" data-map-revision="${createHash('sha256').update(fs.readFileSync('public/map-config.json')).update(fs.readFileSync('data/geography/map-tile-manifest.json')).digest('hex').slice(0,12)}"`).replace('/app.js',`/app.js?v=${revision('public/app.js')}`).replace('/styles.css',`/styles.css?v=${revision('public/styles.css')}`);files.set('public/index.html',html);
