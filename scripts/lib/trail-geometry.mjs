// The detailed atlas and its overview consume the same source route geometry.
// Branches stay in the drawn network. A continuous source-edge bicycle spine
// supplies latitude-based position samples; no hand-drawn overview or gap fill.
const round=(v,places=4)=>Number(v.toFixed(places));
const meters=(a,b)=>Math.hypot((b[0]-a[0])*Math.cos((a[1]+b[1])*Math.PI/360),b[1]-a[1])*111195;
const svgPath=points=>points.map((p,i)=>`${i?'L':'M'}${round(p[0],3)},${round(p[1],3)}`).join('');

function routeGraph(data,mode){
 const features=new Map(data.features.map(f=>[f.id,f]));
 const graph=new Map(),coordinates=new Map();
 for(const member of data.routes[mode].members){
  const f=features.get(member.ref);
  if(!f)throw Error(`Missing ${mode} route member ${member.ref}`);
  f.nodeIds.forEach((id,i)=>{coordinates.set(id,f.points[i]);if(!graph.has(id))graph.set(id,new Map())});
  for(let i=1;i<f.nodeIds.length;i++){
   const a=f.nodeIds[i-1],b=f.nodeIds[i],distance=meters(f.points[i-1],f.points[i]);
   graph.get(a).set(b,distance);graph.get(b).set(a,distance);
  }
 }
 const endpoints=[...graph].filter(([,edges])=>edges.size===1).map(([id])=>id);
 const north=endpoints.reduce((a,b)=>coordinates.get(a)[1]>coordinates.get(b)[1]?a:b);
 const south=endpoints.reduce((a,b)=>coordinates.get(a)[1]<coordinates.get(b)[1]?a:b);
 const distance=new Map([[north,0]]),previous=new Map(),pending=new Set(graph.keys());
 // The route has about 2,200 nodes; this small deterministic implementation
 // avoids a build dependency while finding a path entirely on source edges.
 while(pending.size){
  let current=null,best=Infinity;
  for(const id of pending){const d=distance.get(id)??Infinity;if(d<best){best=d;current=id}}
  if(current===null)break;
  pending.delete(current);
  for(const [next,weight] of graph.get(current))if(pending.has(next)&&best+weight<(distance.get(next)??Infinity)){
   distance.set(next,best+weight);previous.set(next,current);
  }
 }
 if(distance.size!==graph.size)throw Error(`${mode} route relation is disconnected`);
 const nodeIds=[];for(let id=south;id!==undefined;id=previous.get(id))nodeIds.push(id);
 nodeIds.reverse();
 const uniqueEdges=new Set();let networkMeters=0;
 for(const [a,edges] of graph)for(const [b,length] of edges){const key=[a,b].sort().join('/');if(!uniqueEdges.has(key)){uniqueEdges.add(key);networkMeters+=length}}
 return {points:nodeIds.map(id=>coordinates.get(id)),nodeIds,audit:{relationId:data.routes[mode].relationId,memberWays:data.routes[mode].members.length,nodeCount:graph.size,connectedComponents:1,endpointCount:endpoints.length,northNode:north,southNode:south,north:coordinates.get(north),south:coordinates.get(south),networkMeters:round(networkMeters,1),spineMeters:round(distance.get(south),1)}};
}

function pointAtLatitude(points,latitude){
 // At a switchback, choose the first intersection along the north-to-south
 // source-edge spine. The dot describes latitude, not distance travelled.
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];
  if(latitude<=Math.max(a[1],b[1])+1e-10&&latitude>=Math.min(a[1],b[1])-1e-10){
   const t=a[1]===b[1]?0:(latitude-a[1])/(b[1]-a[1]);
   return [a[0]+(b[0]-a[0])*t,latitude];
  }
 }
 return latitude>points[0][1]?points[0]:points.at(-1);
}

export function buildTrailGeometry(data,geography,map,project){
 const bike=routeGraph(data,'bike'),walk=routeGraph(data,'walk');
 const all=data.features.flatMap(f=>f.points);
 const bounds={minLon:Math.min(...all.map(p=>p[0])),maxLon:Math.max(...all.map(p=>p[0])),minLat:Math.min(...all.map(p=>p[1])),maxLat:Math.max(...all.map(p=>p[1]))};
 const width=80,height=240,padding=8,cosLatitude=Math.cos((bounds.minLat+bounds.maxLat)*Math.PI/360);
 // Local equirectangular geographic aspect, north up: longitude is scaled by
 // cos(latitude), unlike the intentionally widened main illustrated atlas.
 const scale=Math.min((width-2*padding)/((bounds.maxLon-bounds.minLon)*cosLatitude),(height-2*padding)/(bounds.maxLat-bounds.minLat));
 const offsetX=(width-(bounds.maxLon-bounds.minLon)*cosLatitude*scale)/2;
 const offsetY=(height-(bounds.maxLat-bounds.minLat)*scale)/2;
 const mini=([lon,lat])=>[offsetX+(lon-bounds.minLon)*cosLatitude*scale,offsetY+(bounds.maxLat-lat)*scale];
 const paths={};
 for(const mode of ['bike','walk'])paths[mode]=data.features.filter(f=>f.modes.includes(mode)).map(f=>svgPath(f.points.map(mini))).join('');
 paths.spine=svgPath(bike.points.map(mini));
 paths.shoreline=svgPath(geography.shoreline.map(mini));
 paths.land=`M-100,-100${paths.shoreline.replace(/^M/,'L')}L-100,340Z`;
 const latitudes=[...new Set(bike.points.map(p=>p[1]))].sort((a,b)=>b-a);
 const positionSamples=latitudes.map(lat=>{
  const p=pointAtLatitude(bike.points,lat),[x,y]=mini(p);
  return [round(project(p)[1]),round(x),round(y)];
 });
 const overview={width,height,bounds,projection:{scale,cosLatitude,offsetX,offsetY},paths,positionSamples,
  sourceUrls:data.sourceUrls,positionMode:'bicycle source-edge spine at the current map latitude',
  latitudeToMapY:{originLat:map.projection.originLat,scaleY:map.projection.scaleY,offsetY:map.projection.offsetY}};
 const trails=data.features.map(f=>({...f,connector:false}));
 const ids=new Set(trails.map(f=>f.id));
 for(const f of geography.trails)if(/Connector/i.test(f.name)&&!ids.has(f.id))trails.push({...f,connector:true});
 return {trails,overview,audit:{reviewedAt:data.reviewedAt,sourceUrls:data.sourceUrls,routes:{bike:bike.audit,walk:walk.audit},overview:{width,height,positionSamples:positionSamples.length,geographicAspect:'Longitude scaled by cosine of mean latitude; north is up.',positionMethod:'Intersections of the continuous source-edge bicycle spine with each source-vertex latitude. No arc-length proxy.',inventedLinks:0},missingFromFormerNameFilter:data.features.filter(f=>!geography.trails.some(old=>old.id===f.id)).map(f=>({id:f.id,name:f.name,modes:f.modes,sourceUrl:f.sourceUrl})),distanceCaution:'Network lengths include branches. Computed source-edge spine lengths are geometry checks, not official surveyed trail distances. Official visitor distances remain 18 miles bicycle and 18.5 miles pedestrian.'}};
}
