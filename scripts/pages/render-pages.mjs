import {siteHeader,siteFooter,siteScriptUrl} from './templates/site-chrome.mjs';
import fs from 'node:fs';
import {SITE_URL, SITE_NAME, siteUrl, seoHead} from './templates/site-seo.mjs';
import {createHash} from 'node:crypto';
export const files = new Map();
const styleRevision=createHash('sha256').update(fs.readFileSync('public/styles.css')).digest('hex').slice(0,12);const editorialRevision=createHash('sha256').update(fs.readFileSync('public/editorial.css')).digest('hex').slice(0,12);
const places=JSON.parse(fs.readFileSync('data/places/places.json'));const photos=JSON.parse(fs.readFileSync('data/photos/photos.json'));const base=SITE_URL;const cp='https://www.chicagoparkdistrict.com/';
const esc=s=>String(s??'').trim().replace(/\s+/g,' ').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=(url,label)=>`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`;
const href=p=>p.story?`/places/${p.id}/`:`/places/#${p.id}`;
const image=p=>{const ph=photos[p.id];return ph?`<figure class="editorial-photo"><img class="${ph.fit==='contain'?'photo-fit-contain':''}" src="${ph.src}" alt="${esc(ph.alt)}" width="${ph.width||960}" height="${ph.height||640}" decoding="async"><figcaption>${ph.caption?esc(ph.caption)+' · ':''}Photo: ${esc(ph.author)} · ${link(ph.licenseUrl,ph.license)} · ${link(ph.sourceUrl,'Source')}</figcaption></figure>`:''};
function shell(title,desc,route,content,extra=[]){
 const place=places.find(p=>route===`/places/${p.id}/`);
 const photo=place&&photos[place.id];
 const breadcrumbs=[{name:'Illustrated map',route:'/'}];
 if(place)breadcrumbs.push({name:'Beaches & attractions',route:'/places/'});
 breadcrumbs.push({name:title,route});
 const entities=extra.map(entity=>({...entity,'@id':base+route+'#attraction'}));
 if(route==='/places/')entities.push({
  '@type':'ItemList','@id':siteUrl('/places/#discoveries'),name:'Chicago lakefront beaches, parks and attractions',
  numberOfItems:places.length,itemListElement:[...places].sort((a,b)=>a.region-b.region||b.lat-a.lat).map((p,index)=>({
   '@type':'ListItem',position:index+1,name:p.name,url:siteUrl(href(p))
  }))
 });
 const metadata=seoHead({title:`${title} | ${SITE_NAME}`,description:desc,route,
  type:route==='/places/'?'CollectionPage':route==='/credits/'?'AboutPage':'WebPage',
  ...(photo?{image:photo.src,imageAlt:photo.alt}:{}),breadcrumbs,entities,
  mainEntity:entities[0]?.['@id']
 });
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${metadata}<link rel="icon" href="/assets/favicon.svg"><link rel="stylesheet" href="/styles.css?v=${styleRevision}"><link rel="stylesheet" href="/editorial.css?v=${editorialRevision}"><script type="module" src="${siteScriptUrl()}"></script></head><body class="editorial-page"><a class="skip-link" href="#article">Skip to content</a>${siteHeader(route)}<main class="editorial-main" id="article">${content}</main>${siteFooter()}</body></html>`;
}
function emit(route,html){files.set('public'+route+'index.html',html)}
const cap=t=>t[0].toUpperCase()+t.slice(1);
const host=u=>new URL(u).hostname.replace(/^www\./,'');
const smallcard=p=>`<a class="related-place" href="${href(p)}"><h3>${esc(p.name)}</h3><span>${esc(cap(p.category))} · ${esc(p.regionName)}</span><p>${esc(p.description)}</p></a>`;
for(const p of places.filter(p=>p.story)){
const photo=photos[p.id];const nearby=p.related.map(id=>places.find(x=>x.id===id)).filter(Boolean);
emit(`/places/${p.id}/`,shell(p.name,p.description,`/places/${p.id}/`,`<article class="story"><a class="back-link" href="/?place=${p.id}">← Show on the map</a><h1>${esc(p.name)}</h1><p class="story-meta">${esc(cap(p.category))} · ${esc(p.regionName)} · ${esc(p.access)}</p><p class="story-lede">${esc(p.description)}</p>${image(p)}<div class="story-body">${p.story.map(t=>`<p>${esc(t)}</p>`).join('')}<p class="story-fact">${esc(p.fact)}</p><h2>Visiting</h2><p>${esc(p.practical)}</p><a class="solid-button" href="/?place=${p.id}">See it on the map ↗</a>${p.id==='jackson-park'?'<h2>A garden worth the detour.</h2><p>Explore the Garden of the Phoenix in more detail with the <a href="https://osakagardenchicago.com/">Osaka Garden illustrated guide</a>. The garden is inland on Wooded Island, reached separately from the main Lakefront Trail.</p>':''}<h2>Sources</h2><ul class="source-list">${p.sourceUrls.map((u,i)=>`<li>${link(u,i?`Background · ${host(u)}`:'Official visitor information')}</li>`).join('')}</ul><p class="content-date">Reviewed November 18, 2026. Hours, tickets, swimming conditions and access may change.</p></div><section class="related-section"><h2>Nearby</h2><div class="related-grid">${nearby.map(smallcard).join('')}</div></section></article>`,[{'@context':'https://schema.org','@type':'TouristAttraction',name:p.name,description:p.description,url:base+`/places/${p.id}/`,geo:{'@type':'GeoCoordinates',latitude:p.lat,longitude:p.lon},...(photo?{image:base+photo.src}:{})}]))}
// The list follows the trail north to south, in the same ten stretches as the map.
const stretches=[['Edgewater & Montrose','Quiet beaches & the Magic Hedge'],['Harbors of Lincoln Park','Masts, lawns & open water'],['Lincoln Park & North Avenue','Park paths meet the skyline'],['The Gold Coast','Sand at the foot of the city'],['Streeterville & Navy Pier','A city reaching into the lake'],['The downtown lakefront','Grand parks & a thousand sails'],['Museum Campus','Big discoveries, wider horizons'],['The southern harbors','A different view of downtown'],['Burnham Park & the Point','Long lawns & limestone edges'],['Jackson Park & South Shore','Lagoons, history & one last beach']]
 .map(([name],i)=>({name,slug:name.toLowerCase().replace(/^the /,'').replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),places:places.filter(p=>p.region===i).sort((a,b)=>b.lat-a.lat)}));
if(stretches.reduce((n,s)=>n+s.places.length,0)!==places.length)throw new Error('Every place needs a stretch (region 0-9)');
for(const s of stretches)if(places.some(p=>p.id===s.slug))throw new Error(`Stretch anchor #${s.slug} collides with a place id`);
const directoryCard=p=>{const ph=photos[p.id];const kind=p.category[0].toUpperCase()+p.category.slice(1);return `<article class="directory-place${ph?' has-photo':''}" id="${p.id}">${ph?`<figure class="directory-photo"><a href="${href(p)}"><img class="${ph.fit==='contain'?'photo-fit-contain':''}" src="${ph.src}" alt="${esc(ph.alt)}" loading="lazy" decoding="async" width="${ph.width||960}" height="${ph.height||640}"></a><figcaption>${ph.caption?`${esc(ph.caption)} · `:''}Photo: ${esc(ph.author)} · ${link(ph.sourceUrl,ph.license)}</figcaption></figure>`:''}<div class="directory-body"><h3>${esc(p.name)}</h3><p class="directory-meta">${esc(kind)} · ${esc(p.access)}</p><p class="directory-description">${esc(p.description)}</p><p class="directory-fact">${esc(p.fact)}</p><p class="directory-practical">${esc(p.practical)}</p><div class="directory-actions"><a href="/?place=${p.id}">On the map ↗</a>${p.story?`<a href="/places/${p.id}/">The story ↗</a>`:link(p.officialUrl,'Visitor information')}</div></div></article>`};
emit('/places/',shell('Beaches & places along Chicago’s Lakefront Trail',`Find ${places.length} beaches, gardens, statues, theaters, harbors, and landmarks on Chicago’s illustrated lakefront atlas.`,'/places/',`<h1 class="list-title">Places along the Lakefront Trail</h1><nav class="category-links" aria-label="Trail stretches, north to south">${stretches.map(s=>`<a href="#${s.slug}">${esc(s.name)}</a>`).join('')}</nav>${stretches.map(s=>`<section class="place-group" id="${s.slug}"><h2>${esc(s.name)}</h2><div class="place-directory">${s.places.map(directoryCard).join('')}</div></section>`).join('')}`));
const credits=`<article class="story"><h1>About & credits</h1><p class="story-lede">An independent illustrated guide to the places that make Chicago’s shoreline extraordinary. Here is where the map, the artwork and the photographs come from.</p><div class="story-body"><h2>Source code</h2><p>The website’s source code is available under the <a href="/LICENSE.txt">MIT License</a>. Geographic data, photographs, illustrations, and fonts are not covered by that license; their separate licenses and permissions still apply.</p><h2>Geography</h2><p>The shoreline, mapped walking and bicycle paths, park shapes, roads, beaches, and building footprints use OpenStreetMap data retrieved November 18, 2026. The Park District’s eleven trail-section maps informed the route’s context. Landmarks are placed in a shared latitude-and-longitude coordinate system.</p><p>The atlas uses an expanded east–west scale so city blocks, park grounds and shoreline features have room to read. Small illustrated landmarks are anchored to their mapped locations. It simplifies geometry and omits some features. Artwork is a visual interpretation, not a survey, a record of current conditions, or turn-by-turn navigation. Use ${link(cp+'lakefront-trail','official trail maps and updates')} for travel planning.</p><p>${link('https://www.openstreetmap.org/copyright','© OpenStreetMap contributors · Open Database License')}.</p><h2>Aerial reference</h2><p>Illustrated geography was reviewed against <a href="https://img.cookcountyil.gov/arcgis/rest/services/CookOrtho2025/ImageServer">Cook County GIS aerial imagery</a> and <a href="https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer">USGS/USDA NAIP imagery</a>, accessed November 18, 2026. These references distinguish built city blocks, lawns, sports grounds, beaches and woodland. The Cook service has inconsistent acquisition-year metadata; the older NAIP survey is from 2019. Neither is presented as live imagery. No aerial basemap is reproduced here.</p><p>Tree symbols follow mapped tree locations, and dense canopy is limited to mapped woodland and scrub. A park boundary does not imply forest.</p><h2>Attraction locations</h2><p>All ${places.length} attraction pins were reviewed against named map features and official venue, park or institution sources. Statue pins use the mapped statue point; buildings use a point inside the footprint. Beach, harbor and park pins identify an area and do not imply an entrance. Each map card links to its coordinate source. Nearby inland stops require a detour using designated crossings.</p><h2>Map artwork</h2><p>Architectural illustrations sit over geographically sourced map layers and may simplify architectural detail. Artwork files, geographic data, and map build scripts are retained with the project.</p><p>The revised South Shore Cultural Center vignette is adapted from Zol87’s photograph under <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>; the revised 63rd Street Beach House vignette is adapted from TonyTheTiger’s photograph under <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>. Their reference photographs and original source links appear below. The adaptations preserve those respective licenses.</p><h2>Photography credits</h2><p>Photographs are hosted locally, resized for the site, and credited below and at the point of use. The applicable licenses remain with each photograph. Original files and additional licensing details are available through the source links.</p><ul class="photo-sources">${Object.entries(photos).map(([id,p])=>`<li><strong>${esc(places.find(x=>x.id===id)?.name||id)}</strong><br>${esc(p.author)} · ${link(p.licenseUrl,p.license)}<br>${link(p.sourceUrl,p.title.replace('File:',''))}</li>`).join('')}</ul><h2>Type & information</h2><p>Italiana and DM Sans are used under the SIL Open Font License; license texts are included with the font files. Attraction information draws on the Park District, Chicago Harbors, museum and venue websites, and the Cultural Landscape Foundation. Sources are linked on the destination pages and map cards.</p><p>Reviewed November 18, 2026. This site is not operated by, endorsed by, or affiliated with the Chicago Park District. Hours, tickets, events, access, and conditions should be checked with the relevant operator.</p><p class="story-meta">A project by ${link('https://oddlogicstudio.com/','Odd Logic Studio')}.</p></div></article>`;
emit('/credits/',shell('About the illustrated atlas & image credits','Geographic sources, original artwork, photography licenses, and acknowledgments for Chicago Lakefront Trail.','/credits/',credits));
const privacy=`<article class="story"><h1>Privacy policy</h1><p class="story-meta">Effective November 25, 2026</p><div class="story-body">
<p>Chicago Lakefront Trail is an independent illustrated guide. It has no accounts, sign-ups, forms or comments, uses no cookies, and shows no ads.</p>
<h2>What we process</h2>
<p>The site is hosted by Vercel. Like any web server, Vercel processes your IP address and request details to deliver pages and protect the service. We also use Vercel Web Analytics to count page views. It uses no cookies and does not identify you or follow you across sites; it relies on a hash of request data that resets daily. See <a href="https://vercel.com/docs/analytics/privacy-policy" target="_blank" rel="noopener">Vercel Web Analytics privacy ↗</a>.</p>
<p>Photographs and fonts are served from this site, not from third parties. We do not sell or share personal information, and we use it only to run and improve this free public guide, which is our legitimate interest under EU and UK law. Vercel may process data in the United States under the safeguards in its policies.</p>
<h2>Your rights</h2>
<p>Depending on where you live, you may have the right to access or delete personal data about you, to object to its processing, and to complain to your data protection authority. The site is not directed at children under 13.</p>
<h2>Contact</h2>
<p>For privacy questions or requests, email <a href="mailto:privacy@chicagolakefronttrail.com">privacy@chicagolakefronttrail.com</a>. If this policy changes, we will update this page and its date.</p>
</div></article>`;
emit('/privacy/',shell('Privacy policy','What data Chicago Lakefront Trail processes, and how to contact us.','/privacy/',privacy));

const paths=['/','/places/','/credits/','/privacy/',...places.filter(p=>p.story).map(p=>`/places/${p.id}/`)];files.set('public/sitemap.xml','<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+paths.map(p=>`<url><loc>${base}${p}</loc></url>`).join('')+'</urlset>');files.set('public/robots.txt',`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);

// A concise, source-linked reading index for tools that request plain text.
files.set('public/llms.txt',[
 '# Chicago Lakefront Trail',
 '',
 '> An independent illustrated map and guide to Chicago’s Lakefront Trail, beaches, parks, harbors and landmarks.',
 '',
 `Canonical website: ${siteUrl('/')}`,
 `The atlas covers ${places.length} discoveries, with ${places.filter(p=>p.story).length} extended destination stories. The official bicycle trail is 18 miles; the pedestrian trail is 18.5 miles.`,
 'The illustrated map is not turn-by-turn navigation or a live conditions service. Some attractions are inland and require a detour. The site is not affiliated with the Chicago Park District.',
 '',
 '## Explore',
 `- [Interactive trail map](${siteUrl('/')}): Share a selected place using /?place=PLACE_ID or a map latitude using /?at=LATITUDE.`,
 `- [All beaches and attractions](${siteUrl('/places/')}): Descriptions, practical information, sources and photo credits for every discovery, available as ordinary HTML.`,
 `- [About and sources](${siteUrl('/credits/')}): Geography, methods, image licenses and attribution.`,
 `- [Privacy policy](${siteUrl('/privacy/')}): What data the site processes and how to contact us.`,
 '',
 '## Destination guides',
 ...places.filter(p=>p.story).map(p=>`- [${p.name}](${siteUrl(`/places/${p.id}/`)}): ${p.description}`),
 '',
 '## Official information',
 '- [Chicago Park District trail information](https://www.chicagoparkdistrict.com/lakefront-trail): Official maps and trail updates. Check venue sources for current hours, tickets and access.',
 '',
 '## Site index',
 `- [Sitemap](${siteUrl('/sitemap.xml')}): Canonical, indexable pages.`,
 ''
].join('\n'));
