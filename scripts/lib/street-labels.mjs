// A deliberately sparse atlas index, placed on actual joined OSM road geometry.
// Text is abbreviated for legibility; source road names and way IDs stay audited.
const crossStreets=[
 'West Ardmore Avenue','West Foster Avenue','West Lawrence Avenue','West Montrose Avenue',
 'West Irving Park Road','West Belmont Avenue','West Fullerton Parkway','West North Avenue',
 'East Division Street','East Oak Street','East Chicago Avenue','East Grand Avenue',
 'East Randolph Street','East Monroe Street','East Jackson Drive','East Balbo Drive',
 'East Roosevelt Road','East 18th Street','East 31st Street','East 35th Street','East Pershing Road',
 'East 41st Street','East 47th Street','East 51st Street','East 55th Street','East 57th Street',
 'East Hayes Drive','East Marquette Drive','East 67th Street','East 71st Street'
];
const spines=[
 ['North Sheridan Road',41.980],['North Broadway',41.956],['North Clark Street',41.931],
 ['North Jean Baptiste Point DuSable Lake Shore Drive',41.916],['North Michigan Avenue',41.900],
 ['South Michigan Avenue',41.878],['South DuSable Lake Shore Drive',41.852],
 ['South Cottage Grove Avenue',41.827],['South Lake Park Avenue',41.804],
 ['South Stony Island Avenue',41.783],['South South Shore Drive',41.772]
];
const abbreviate=name=>name.replace(/^North /,'N. ').replace(/^South /,'S. ').replace(/^East /,'E. ').replace(/^West /,'W. ').replace('Jean Baptiste Point DuSable','DuSable').replace(/ Avenue$/,' Ave').replace(/ Street$/,' St').replace(/ Drive$/,' Dr').replace(/ Road$/,' Rd').replace(/ Parkway$/,' Pkwy');
const key=p=>p.join(',');
const intersects=(a,b)=>a.l<b.r&&a.r>b.l&&a.t<b.b&&a.b>b.t;

function joinRoads(features,project){
 const edges=features.map(f=>({points:f.points.map(project),source:f.id,a:key(f.points[0]),b:key(f.points.at(-1))}));
 const nodes=new Map();edges.forEach((e,i)=>{for(const k of [e.a,e.b]){if(!nodes.has(k))nodes.set(k,[]);nodes.get(k).push(i)}});
 const used=new Set(),chains=[];
 function trace(first,start){
  let i=first,node=start,points=[],ids=[];
  while(!used.has(i)){
   used.add(i);const e=edges[i],forward=e.a===node,p=forward?e.points:[...e.points].reverse();
   points.push(...(points.length?p.slice(1):p));ids.push(e.source);node=forward?e.b:e.a;
   const available=nodes.get(node).filter(j=>!used.has(j));
   if(nodes.get(node).length!==2||!available.length)break;
   i=available[0];
  }
  const lengths=[0];for(let j=1;j<points.length;j++)lengths.push(lengths.at(-1)+Math.hypot(points[j][0]-points[j-1][0],points[j][1]-points[j-1][1]));
  chains.push({points,ids,lengths,length:lengths.at(-1)});
 }
 for(const [node,list] of nodes)if(list.length!==2)for(const i of list)if(!used.has(i))trace(i,node);
 edges.forEach((e,i)=>{if(!used.has(i))trace(i,e.a)});
 return chains;
}
function along(chain,distance){
 for(let i=1;i<chain.points.length;i++)if(chain.lengths[i]>=distance){const a=chain.points[i-1],b=chain.points[i],t=(distance-chain.lengths[i-1])/(chain.lengths[i]-chain.lengths[i-1]||1);return [a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]}
 return chain.points.at(-1);
}

export function buildStreetLabels(roads,{project,shorelineX,places,neighborhoods,map}){
 const grouped=new Map();for(const road of roads)if(road.name&&!road.kind.endsWith('_link')){if(!grouped.has(road.name))grouped.set(road.name,[]);grouped.get(road.name).push(road)}
 const occupied=neighborhoods.map(l=>({l:l.p[0]-l.text.length*5,r:l.p[0]+l.text.length*5,t:l.p[1]-17,b:l.p[1]+8}));
 const pinPoints=places.map(p=>project([p.lon,p.lat]));
 const labels=[];
 const specs=[...crossStreets.map(name=>({name,cross:true})),...spines.map(([name,lat])=>({name,cross:false,lat}))];
 for(const spec of specs){
  if(!grouped.has(spec.name))continue;
  const text=abbreviate(spec.name),fontSize=spec.cross?10.5:10,width=text.length*fontSize*.55+10;
  const candidates=[];
  for(const chain of joinRoads(grouped.get(spec.name),project)){
   if(chain.length<width+20)continue;
   for(let distance=width/2+8;distance<chain.length-width/2-8;distance+=18){
    const p=along(chain,distance),a=along(chain,distance-width/2),b=along(chain,distance+width/2);
    if(p[1]<160||p[1]>map.height-100)continue;
    const inland=shorelineX(p[1])-p[0];if(inland<150||inland>1050)continue;
    let angle=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;
    if(angle>90)angle-=180;if(angle<-90)angle+=180;
    if(spec.cross&&Math.abs(angle)>23)continue;
    // Keep a straight label within a few pixels of the real road centerline.
    const deviation=Math.abs((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))/Math.max(1,Math.hypot(b[0]-a[0],b[1]-a[1]));
    if(deviation>3.5)continue;
    const cos=Math.abs(Math.cos(angle*Math.PI/180)),sin=Math.abs(Math.sin(angle*Math.PI/180));
    const halfW=width*cos/2+9*sin,halfH=width*sin/2+9*cos;
    const box={l:p[0]-halfW-8,r:p[0]+halfW+8,t:p[1]-halfH-8,b:p[1]+halfH+8};
    if(occupied.some(o=>intersects(box,o))||pinPoints.some(q=>q[0]>box.l-14&&q[0]<box.r+14&&q[1]>box.t-14&&q[1]<box.b+14))continue;
    const latitudeCost=spec.cross?0:Math.abs(p[1]-project([0,spec.lat])[1])*2;
    const cost=Math.abs(inland-(spec.cross?430:340))*.4+latitudeCost+deviation*5;
    candidates.push({name:spec.name,text,p,angle,fontSize,sourceWayIds:chain.ids,box,cost});
   }
  }
  candidates.sort((a,b)=>a.cost-b.cost);
  if(candidates.length){const label=candidates[0];labels.push(label);occupied.push(label.box)}
 }
 return labels;
}
