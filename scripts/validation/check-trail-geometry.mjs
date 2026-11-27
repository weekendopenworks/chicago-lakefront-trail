import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>JSON.parse(fs.readFileSync(p));
const config=read('public/map-config.json'),overview=config.overview;
const routes=read('data/geography/trail-routes.json'),audit=read('data/geography/trail-render-audit.json');
assert(overview.positionSamples.length>1000,'Overview must retain source-based latitude positions');
const spine=[...overview.paths.spine.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(m=>[+m[1],+m[2]]);
function segmentDistance(p,a,b){
 const dx=b[0]-a[0],dy=b[1]-a[1];
 const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function distanceToSpine(p){
 let distance=Infinity;for(let i=1;i<spine.length;i++)distance=Math.min(distance,segmentDistance(p,spine[i-1],spine[i]));
 return distance;
}
let maxSampleDistance=0,maxInterpolatedDistance=0;
for(let i=0;i<overview.positionSamples.length;i++){
 const [mapY,x,y]=overview.positionSamples[i];
 assert(x>=0&&x<=overview.width&&y>=0&&y<=overview.height);
 if(i)assert(mapY>overview.positionSamples[i-1][0],'MapY samples must increase strictly');
 const lat=config.projection.originLat-(mapY-config.projection.offsetY)/config.projection.scaleY;
 assert(Math.abs(y-(overview.projection.offsetY+(overview.bounds.maxLat-lat)*overview.projection.scale))<.0001,'Overview dot latitude must agree with the main map');
 maxSampleDistance=Math.max(maxSampleDistance,distanceToSpine([x,y]));
 if(i){const a=overview.positionSamples[i-1];for(const t of [.25,.5,.75])maxInterpolatedDistance=Math.max(maxInterpolatedDistance,distanceToSpine([a[1]+(x-a[1])*t,a[2]+(y-a[2])*t]))}
}
assert(maxSampleDistance<.002,'Samples must sit on the source route');
// A latitude may cross a switchback more than once. Selecting one branch can
// introduce a small jump, but interpolation must remain within half a pixel.
assert(maxInterpolatedDistance<.5,'Interpolated positions must follow the real overview route');
for(const id of ['267163766','756335277']){
 assert(routes.features.some(f=>f.id===id&&f.modes.includes('bike')&&f.modes.includes('walk')),'Navy Pier Flyover must serve both routes');
 assert(fs.readFileSync('public/assets/map/section-4.svg','utf8').includes(`data-route-way="${id}"`),'Flyover must actually be drawn');
}
for(const mode of ['bike','walk'])assert.equal(audit.routes[mode].connectedComponents,1);
const navy=read('data/geography/map-landmarks.json').find(l=>l.place==='navy-pier');
assert.equal(navy.render,'footprint');assert(navy.footprint.points.length>4);
for(let i=0;i<10;i++){
 const svg=fs.readFileSync(`public/assets/map/section-${i}.svg`,'utf8');
 for(const match of svg.matchAll(/<g data-landmark="[\s\S]*?<\/g>/g))assert(!match[0].includes('<circle'),'Landmark illustrations must not introduce an extra pin');
}
const result={reviewedAt:new Date().toISOString().slice(0,10),sampleCount:overview.positionSamples.length,strictlyIncreasingMapY:true,maxSampleDistanceFromSourceSpinePixels:maxSampleDistance,maxInterpolatedDistanceFromSourceSpinePixels:maxInterpolatedDistance,connectedRouteRelations:['8676789','17527976'],flyoverWaysDrawn:['267163766','756335277'],staticLandmarkAnchorCircles:0,navyPier:'Source footprint with its original east–west orientation; misleading vignette suppressed.'};
fs.mkdirSync('.cache/reports',{recursive:true});
fs.writeFileSync('.cache/reports/trail-geometry-verification.json',JSON.stringify(result,null,2)+'\n');
console.log(`PASS: connected source routes, flyover restored, ${result.sampleCount} latitude-based overview samples, subpixel interpolation, and source-based Navy Pier footprint.`);
