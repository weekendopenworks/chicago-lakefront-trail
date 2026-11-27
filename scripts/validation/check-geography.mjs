import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>JSON.parse(fs.readFileSync(p));
const geo=read('data/geography/geography.json'),audit=read('data/geography/map-render-audit.json');
const places=read('public/places-data.json'),photos=read('data/photos/photo-audit.json');
function inside([x,y],ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const [a,b]=ring[i],[c,d]=ring[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)hit=!hit;
}return hit}
function waterAt(point){return geo.water.some(f=>(f.rings??[{points:f.points}]).filter(r=>inside(point,r.points)).length%2===1)}
// Independent geographic probes catch the omitted river/harbor relation regression.
for(const [name,point] of [['Chicago River',[-87.620,41.8885]],['Monroe Harbor',[-87.614,41.879]],['Montrose Harbor',[-87.6385,41.9606]]])assert(waterAt(point),`${name} must be water`);
for(const name of ['Foster Beach','Montrose Beach','North Avenue Beach'])assert(geo.beaches.some(f=>f.name===name&&f.rings?.length),`${name} needs its actual sand boundary`);
const land=[[-180,90],...geo.shoreline,[-180,-90]];
const p=audit.projection;
for(const l of audit.lakeLabels){
 const halfX=165,halfY=25;
 for(const x of [l.x-halfX,l.x+halfX])for(const y of [l.y-halfY,l.y+halfY]){
  const lon=(x-p.offsetX)/p.scaleX+p.originLon,lat=p.originLat-(y-p.offsetY)/p.scaleY;
  assert(!inside([lon,lat],land),'Lake Michigan label must remain wholly east of land');
 }
}
assert(places.find(p=>p.id==='ardmore-trailhead').photo.sourceUrl.includes('Northern_terminus_of_the_Lakefront_Trail'));
for(const place of places.filter(p=>p.photo))assert(photos.places.some(p=>p.placeId===place.id&&p.status==='verified-subject-and-license'&&p.sourceUrl===place.photo.sourceUrl));
const html=fs.readFileSync('public/index.html','utf8');
for(const place of places){
 const x=((place.lon-p.originLon)*p.scaleX+p.offsetX).toFixed(1),y=((p.originLat-place.lat)*p.scaleY+p.offsetY).toFixed(1);
 assert(html.includes(`data-place="${place.id}" style="left:${x}px;top:${y}px"`),`Marker projection: ${place.id}`);
}
const locations=read('data/geography/location-audit.json');assert.equal(locations.records.length,places.length);
for(const place of places){const evidence=locations.records.find(a=>a.id===place.id);assert(evidence,place.id);assert.equal(evidence.lat,place.lat);assert.equal(evidence.lon,place.lon);}
const lily=places.find(p=>p.id==='caldwell-lily-pool');assert(lily.lon> -87.6348&&lily.lon< -87.6332&&lily.lat>41.9243&&lily.lat<41.9254,'Lily Pool must sit in its garden east of the Conservatory');
for(const id of ['belmont-harbor','diversey-harbor','montrose-harbor','monroe-harbor','burnham-harbor','31st-street-harbor']){const place=places.find(p=>p.id===id);assert(waterAt([place.lon,place.lat]),`${id} must anchor inside its harbor water`)}
console.log(`PASS: river and harbor water, restored beach boundaries, offshore lake labels, all source-audited marker coordinates, corrected Lily Pool and harbor locations, and ${places.filter(p=>p.photo).length} audited photos.`);
