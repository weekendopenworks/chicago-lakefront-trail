import fs from 'node:fs';
import {MAP, project} from '../lib/map-coordinates.mjs';
import {buildTrailGeometry} from '../lib/trail-geometry.mjs';
import {buildStreetLabels} from '../lib/street-labels.mjs';
const geo=JSON.parse(fs.readFileSync('data/geography/geography.json'));
const trailData=JSON.parse(fs.readFileSync('data/geography/trail-routes.json'));
const trailGeometry=buildTrailGeometry(trailData,geo,MAP,project);
const places=JSON.parse(fs.readFileSync('data/places/places.json'));
const landmarkSpecs=JSON.parse(fs.readFileSync('data/geography/map-landmarks.json'));
const {width:W,height:H,tileHeight:T}=MAP;
const n=v=>Math.round(v*10)/10;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const path=(p,close=false)=>p.map((v,i)=>(i?'L':'M')+n(v[0])+','+n(v[1])).join('')+(close?'Z':'');
function simplify(p,tol=.65){if(p.length<4)return p;const out=[p[0]];for(let i=1;i<p.length-1;i++){const a=out.at(-1),b=p[i],c=p[i+1];const cross=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));if(cross/Math.max(1,Math.hypot(c[0]-a[0],c[1]-a[1]))>tol||Math.hypot(b[0]-a[0],b[1]-a[1])>35)out.push(b)}out.push(p.at(-1));return out}
const shore=simplify(geo.shoreline.map(project),.4);
const coast=path(shore),land='M-800,-1000'+path(shore).replace(/^M/,'L')+'L-800,10000Z';
function shorelineX(y){const xs=[];for(let i=0;i<shore.length-1;i++){const a=shore[i],b=shore[i+1];if((a[1]<=y&&b[1]>=y)||(b[1]<=y&&a[1]>=y)){const t=(y-a[1])/(b[1]-a[1]||1);xs.push(a[0]+t*(b[0]-a[0]))}}return xs.length?Math.max(...xs):project([-87.656,42])[0]}
function offshoreX(y,halfHeight=0){let x=shorelineX(y);for(let d=-halfHeight;d<=halfHeight;d+=12)x=Math.max(x,shorelineX(y+d));return x}
const closed=new Set(['parks','beaches','water','buildings','sports','paved','construction']);
const layers={};for(const k of ['roads','parks','beaches','water','buildings','piers','trails','sports','paved','trees','railways','construction'])layers[k]=(k==='trails'?trailGeometry.trails:geo[k]??[]).map(f=>{const p=k==='trails'?f.points.map(project):simplify(f.points.map(project),k==='buildings'?.25:.65);const rings=f.rings?.map(r=>simplify(r.points.map(project),.35));const bounds=rings?rings.flat():p;return {...f,p,minY:Math.min(...bounds.map(v=>v[1])),maxY:Math.max(...bounds.map(v=>v[1])),cx:p.reduce((a,v)=>a+v[0],0)/p.length,cy:p.reduce((a,v)=>a+v[1],0)/p.length,d:rings?rings.map(r=>path(r,true)).join(''):path(p,closed.has(k)&&!(k==='sports'&&f.points[0].join(',')!==f.points.at(-1).join(',')))}});
const parkColor={park:'#dce0bc',grass:'#dfe4bd',garden:'#ced7ad',wood:'#b3c39a',scrub:'#c5cfa7',nature_reserve:'#d1dab4',golf_course:'#dce3b9',wetland:'#c6d7b7'};
const roadWidth={motorway:10,trunk:8,primary:6,secondary:4.8,tertiary:3.8,residential:2.5,unclassified:2.5,service:1.5,pedestrian:2,footway:1,path:1,cycleway:1};
const labels=[[-87.670,41.978,'EDGEWATER'],[-87.661,41.967,'UPTOWN'],[-87.652,41.944,'LAKEVIEW'],[-87.645,41.925,'LINCOLN PARK'],[-87.636,41.907,'GOLD COAST'],[-87.625,41.893,'STREETERVILLE'],[-87.619,41.878,'GRANT PARK'],[-87.619,41.865,'MUSEUM CAMPUS'],[-87.623,41.839,'BRONZEVILLE'],[-87.604,41.816,'BURNHAM PARK'],[-87.592,41.797,'HYDE PARK'],[-87.587,41.780,'JACKSON PARK'],[-87.580,41.769,'SOUTH SHORE']].map(([lon,lat,text])=>({p:project([lon,lat]),text}));
const streetLabels=buildStreetLabels(geo.roads,{project,shorelineX,places,neighborhoods:labels,map:MAP});
const assetData=new Map(landmarkSpecs.filter(l=>l.render!=='footprint').map(l=>[l.asset,'data:image/webp;base64,'+fs.readFileSync(`public/assets/${l.asset}.webp`).toString('base64')]));
const landmarks=landmarkSpecs.map(l=>{const place=places.find(p=>p.id===l.place);if(!place)throw Error(`Unknown landmark ${l.place}`);return {...l,p:project([l.anchor?.lon??place.lon,l.anchor?.lat??place.lat]),name:place.name}});
// A few boats are decorative, and always east of the real shoreline.
const boats=[];for(let y=540;y<H-250;y+=445)boats.push({x:offshoreX(y,30)+170+(y%3)*70,y});
const lakeLabels=[];
for(const section of [0,2,4,7,9]){const y=section*T+(section===0?450:340);const x=offshoreX(y,40)+250;lakeLabels.push({section,x,y})}
// Follow the river's water polygon between Columbus and DuSable Lake Shore Drive.
// These centerline samples were checked against the cached relation, including its holes.
const riverLabel={name:'Chicago River',sourceUrl:'https://www.openstreetmap.org/relation/13730103',fontSize:18,points:[[-87.6192,41.8884790],[-87.6186,41.8884203],[-87.6180,41.8883660],[-87.6174,41.8883607],[-87.6168,41.8883918],[-87.6162,41.8884314],[-87.6156,41.8884554],[-87.6150,41.8884455]]};
const riverLabelPath=riverLabel.points.map(project);
const defs=`<defs>
<pattern id="construction" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#ded7c6"/><path d="M0 10 10 0" stroke="#c5bca7" stroke-width=".7"/></pattern>
<linearGradient id="water" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#b7d4cb"/><stop offset="1" stop-color="#c9ded5"/></linearGradient>
<pattern id="ripples" width="86" height="57" patternUnits="userSpaceOnUse"><path d="M9 9q8-2 16 0m25 20q8-2 16 0M-4 47h17" stroke="#648f89" stroke-width=".6" opacity=".17" fill="none"/><path d="M35 12h10M10 38h19M61 54h17" stroke="#fff" stroke-width="1" opacity=".22"/></pattern>
<pattern id="woodland" width="22" height="20" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="5" fill="#8da67b" opacity=".48"/><circle cx="16" cy="14" r="6" fill="#98ae7d" opacity=".55"/><circle cx="4" cy="4" r="3" fill="#c4d09b" opacity=".65"/><circle cx="15" cy="12" r="3" fill="#b8c996" opacity=".7"/></pattern>
<clipPath id="land"><path d="${land}"/></clipPath>
<g id="tree"><ellipse cx="1.5" cy="2" rx="4.5" ry="3.4" fill="#6e795b" opacity=".2"/><circle r="3.7" fill="#8fa779" stroke="#7d976d" stroke-width=".3"/><circle cx="-1" cy="-1" r="2.2" fill="#c0ce93" opacity=".75"/></g>
<g id="boat"><ellipse cx="4" cy="9" rx="15" ry="4" fill="#6e9891" opacity=".15"/><path d="M-13 3Q1 11 14 3l-3 7H-9Z" fill="#fdf9e9" stroke="#78918a" stroke-width=".7"/><path d="M0-23V3H-12Z" fill="#fffdf3" stroke="#9ba99b" stroke-width=".5"/><path d="M2-20L13 2H2Z" fill="#e3d9c2"/><path d="M0-25V9" stroke="#71847b" stroke-width="1"/></g>
</defs>`;
fs.mkdirSync('public/assets/map',{recursive:true});
for(let section=0;section<H/T;section++){
 const top=section*T,bottom=top+T;
 const visible=f=>f.maxY>=top-35&&f.minY<=bottom+35;
 // Let whole features end against plain land, as on the west and south edges.
 // Keep the basemap, shoreline, water and trail geometry continuous.
 const detailVisible=f=>visible(f)&&f.maxY>=180;
 let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${top} ${W} ${T}" width="${W}" height="${T}">${defs}<rect y="${top}" width="${W}" height="${T}" fill="url(#water)"/><rect y="${top}" width="${W}" height="${T}" fill="url(#ripples)"/><path d="${coast}" fill="none" stroke="#eff1d9" stroke-width="18" opacity=".24"/><path d="${land}" fill="#eae4d4" stroke="#9caf9a" stroke-width="1.2"/>`;
 s+='<g clip-path="url(#land)">';
 // Park bounds remain open lawns. Only mapped wood/scrub polygons receive canopy.
 for(const f of layers.parks.filter(detailVisible)){s+=`<path fill-rule="evenodd" d="${f.d}" fill="${parkColor[f.kind]??parkColor.park}" stroke="#bcc5a3" stroke-width=".45"/>`;if(['wood','scrub'].includes(f.kind))s+=`<path data-landcover="${f.kind}" d="${f.d}" fill="url(#woodland)"/>`}
 for(const f of layers.water.filter(visible))s+=`<path d="${f.d}" fill-rule="evenodd" fill="#adcfc4" stroke="#91b2a3" stroke-width="1.1"/>`;
 for(const f of layers.construction.filter(detailVisible))s+=`<path d="${f.d}" fill="url(#construction)" fill-rule="evenodd" stroke="#bfb59d" stroke-width=".5"/>`;
 for(const f of layers.paved.filter(detailVisible))s+=`<path d="${f.d}" fill="${f.kind==='parking'?'#d9d6c7':'#e8dfc9'}" stroke="#c3c1ae" stroke-width=".5"/>`;
 for(const f of layers.sports.filter(detailVisible)){const court=/tennis|basketball/.test(f.sport??'');s+=`<path d="${f.d}" fill="${court?'#b4c6ac':f.sport==='baseball'?'#cdd3a8':'#cbd7ac'}" stroke="#f6f3dc" stroke-width=".9"/>`;}
 for(const f of layers.roads.filter(detailVisible)){const w=roadWidth[f.kind]??3;s+=`<path d="${f.d}" fill="none" stroke="#c4bca8" stroke-width="${w+1}"/><path d="${f.d}" fill="none" stroke="#f7f1e1" stroke-width="${w}"/>`}
 for(const f of layers.railways.filter(detailVisible))s+=`<path d="${f.d}" fill="none" stroke="#aca893" stroke-width="1.4"/><path d="${f.d}" fill="none" stroke="#f1ead8" stroke-width=".6" stroke-dasharray="2 3"/>`;
 for(const f of layers.buildings.filter(detailVisible)){
  const height=Math.min(14,Math.max(1.8,(f.levels??((f.height??9)/3))*.75));
  const roof=['#e2dac5','#dad1bc','#e8e0ce','#d6d1c2'][Number(f.id)%4];
  s+=`<path d="${f.d}" transform="translate(${n(height*.7)},${n(height*.6)})" fill="#9a9b88" opacity=".28"/><path d="${f.d}" fill="${roof}" stroke="#b0a88f" stroke-width=".65"/>`;
 }
 for(const f of layers.beaches.filter(visible))s+=`<path fill-rule="evenodd" d="${f.d}" fill="#eddaad" stroke="#dbc698" stroke-width=".8"/>`;
 // Individual canopy symbols are tied to surveyed OSM tree points, never a forest belt.
 for(const f of layers.trees.filter(detailVisible))s+=`<use href="#tree" x="${n(f.cx)}" y="${n(f.cy)}"/>`;
 s+='</g>';
 for(const f of layers.piers.filter(visible))s+=`<path d="${f.d}" fill="none" stroke="#e9e0c9" stroke-width="2"/>`;
 for(const f of layers.trails.filter(visible)){
  const cycling=f.mode==='bike'||f.mode==='shared';
  s+=`<g data-route-way="${f.id}" data-route-mode="${f.connector?'connector':f.mode}"${f.connector?' opacity=".58"':''}><path d="${f.d}" fill="none" stroke="#fff9e9" stroke-width="${f.connector?2.8:cycling?6:3.8}" stroke-linecap="round" stroke-linejoin="round"/><path d="${f.d}" fill="none" stroke="${cycling&&!f.connector?'#b96844':'#859165'}" stroke-width="${f.connector?1:cycling?2.4:1.3}" ${!cycling||f.connector?'stroke-dasharray="3 4"':''} stroke-linecap="round" stroke-linejoin="round"/>${f.mode==='shared'?`<path d="${f.d}" fill="none" stroke="#78885f" stroke-width="1.1" stroke-dasharray="2 5" stroke-linecap="round"/>`:''}</g>`;
 }
 for(const l of streetLabels){if(l.p[1]<top-100||l.p[1]>bottom+100)continue;s+=`<text data-street-label="${esc(l.name)}" x="${n(l.p[0])}" y="${n(l.p[1])}" transform="rotate(${n(l.angle)} ${n(l.p[0])} ${n(l.p[1])})" text-anchor="middle" dominant-baseline="central" font-family="Georgia,serif" font-size="${l.fontSize}" font-style="italic" letter-spacing=".35" fill="#667552" stroke="#f3efdf" stroke-width="2.8" stroke-linejoin="round" paint-order="stroke" opacity=".94">${esc(l.text)}</text>`}
 for(const b of boats){if(b.y<top-40||b.y>bottom+40)continue;s+=`<use href="#boat" transform="translate(${n(b.x)} ${n(b.y)}) scale(.75)"/>`}
 // Small illustrations share exact place anchors; real building footprints remain visible.
 for(const l of landmarks){const [x,y]=l.p;if(y<top-110||y>bottom+110)continue;if(l.render==='footprint'){s+=`<g data-landmark="${l.place}" data-landmark-render="source-footprint"><title>${esc(l.name)} — mapped footprint</title><path d="${path(l.footprint.points.map(project),true)}" fill="#e4d7b4" fill-opacity=".12" stroke="#8b9475" stroke-width="1.1" stroke-linejoin="round"/></g>`;continue}s+=`<g data-landmark="${l.place}"><title>${esc(l.name)} — illustration anchored to its map location</title><image href="${assetData.get(l.asset)}" x="${n(x-l.width/2)}" y="${n(y-l.height*.55)}" width="${l.width}" height="${l.height}"/></g>`}
 const adlerPlace=places.find(p=>p.id==='adler-planetarium'),adler=project([adlerPlace.lon,adlerPlace.lat]);if(adler[1]>top-70&&adler[1]<bottom+70)s+=`<g transform="translate(${adler.join(' ')}) scale(.55)"><ellipse cy="10" rx="48" ry="14" fill="#a2ac91" opacity=".25"/><path d="M-38 0h76v22h-76Z" fill="#e6dcc1" stroke="#b3ad91"/><path d="M-31 0a31 24 0 0 1 62 0Z" fill="#819b83" stroke="#64816e"/><path d="M-30 4h60M-30 17h60" stroke="#b5ad90"/><path d="M-24 6v10M-12 6v10M0 6v10M12 6v10M24 6v10" stroke="#8c927c" stroke-width="3"/></g>`;
 const fountainPlace=places.find(p=>p.id==='buckingham-fountain'),fountain=project([fountainPlace.lon,fountainPlace.lat]);if(fountain[1]>top-50&&fountain[1]<bottom+50)s+=`<g transform="translate(${fountain.join(' ')}) scale(.55)"><ellipse rx="40" ry="20" fill="#d2c8ac" stroke="#b8ab8f"/><ellipse rx="34" ry="15" fill="#a3c5bd"/><ellipse cy="-4" rx="19" ry="8" fill="#dac4a4" stroke="#ac9a7f"/><path d="M-7-6q7-40 14 0M0-5v-30" fill="none" stroke="#eef9e9" stroke-width="2.5"/></g>`;
 for(const l of labels){if(l.p[1]>top&&l.p[1]<bottom)s+=`<text x="${n(l.p[0])}" y="${n(l.p[1])}" text-anchor="middle" font-family="Georgia,serif" font-size="12" letter-spacing="3" fill="#4f6559" stroke="#f3efdf" stroke-width="3" paint-order="stroke" opacity=".8">${l.text}</text>`}
 for(const l of lakeLabels.filter(l=>l.section===section))s+=`<text data-water-label="lake-michigan" x="${n(l.x)}" y="${n(l.y)}" text-anchor="middle" font-family="Georgia,serif" font-size="36" font-style="italic" fill="#497e76" opacity=".8">Lake Michigan</text>`;
 if(riverLabelPath[0][1]>=top&&riverLabelPath[0][1]<bottom)s+=`<path id="chicago-river-label-path" d="${path(riverLabelPath)}" fill="none"/><text data-water-label="chicago-river" text-anchor="middle" dominant-baseline="central" font-family="Georgia,serif" font-size="${riverLabel.fontSize}" font-style="italic" letter-spacing=".3" fill="#497e76" stroke="#adcfc4" stroke-width="1.4" paint-order="stroke" opacity=".95"><textPath href="#chicago-river-label-path" startOffset="50%">Chicago River</textPath></text>`;
 if(section===0){const x=shorelineX(120)+260;s+=`<g transform="translate(${n(x)} 125)" fill="#43655a"><text y="-30" text-anchor="middle" font-family="Georgia" font-size="14">N</text><path d="M0-18L9 18 0 10-9 18Z"/><path d="M0-18V10L-9 18Z" fill="#8ea99b"/></g>`}
 s+='</svg>';
 fs.writeFileSync(`public/assets/map/section-${section}.svg`,s);
 const coarseLand='M-800,-1000'+path(simplify(shore,4)).replace(/^M/,'L')+'L-800,10000Z';
 fs.writeFileSync(`public/assets/map/preview-${section}.svg`,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${top} ${W} ${T}" width="${W}" height="${T}"><rect y="${top}" width="${W}" height="${T}" fill="#c6dcd2"/><path d="${coarseLand}" fill="#eae4d4" stroke="#a8bba4" stroke-width="2"/></svg>`);
}
// A smoothed shoreline camera avoids a sideways lurch at a projecting pier.
const cam=[];for(let y=0;y<=H;y+=60){const samples=[];for(let d=-180;d<=180;d+=30)samples.push(shorelineX(Math.max(0,Math.min(H,y+d))));samples.sort((a,b)=>a-b);cam.push([y,n(samples[Math.floor(samples.length/2)])])}
const smoothCamera=cam.map(([y],i)=>{let sum=0,weight=0;for(let d=-5;d<=5;d++){const w=Math.exp(-(d*d)/8);sum+=cam[Math.max(0,Math.min(cam.length-1,i+d))][1]*w;weight+=w}return [y,n(sum/weight)]});
fs.writeFileSync('public/map-config.json',JSON.stringify({...MAP,camera:smoothCamera,overview:trailGeometry.overview}));
fs.writeFileSync('data/geography/trail-render-audit.json',JSON.stringify(trailGeometry.audit,null,2)+'\n');
fs.writeFileSync('data/geography/map-render-audit.json',JSON.stringify({projection:MAP.projection,width:W,height:H,landmarks:landmarks.map(l=>({place:l.place,asset:l.render==='footprint'?null:l.asset,render:l.render??'illustration',anchor:l.p,width:l.width,height:l.height,...(l.footprint?{sourceUrl:l.footprint.sourceUrl,reason:l.renderingNote}:{})})),streetLabels:streetLabels.map(l=>({name:l.name,text:l.text,anchor:l.p,angle:l.angle,fontSize:l.fontSize,sourceWayIds:l.sourceWayIds,sourceUrls:l.sourceWayIds.map(id=>`https://www.openstreetmap.org/way/${id}`)})),riverLabels:[riverLabel],lakeLabels:lakeLabels.map(l=>({...l,shorelineX:offshoreX(l.y,40)})),counts:Object.fromEntries(Object.entries(layers).map(([k,v])=>[k,v.length])),vegetation:'Mapped woodland/scrub polygons and individual OSM tree locations; no decorative forest belt.'},null,2));
console.log(`Built 10 map sections, ${streetLabels.length} source-based street labels, and an overview from connected trail relations.`);
