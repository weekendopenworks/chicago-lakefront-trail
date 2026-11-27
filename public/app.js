const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
// A slow initial load must not move a visitor who has already started exploring.
const openingInput=new AbortController();let openingInterrupted=false;
for(const type of ['pointerdown','wheel','keydown'])addEventListener(type,()=>{openingInterrupted=true},{passive:true,signal:openingInput.signal});
const mapStatus=document.createElement('section');
mapStatus.id='map-status';mapStatus.className='map-status';mapStatus.hidden=true;mapStatus.setAttribute('role','status');document.body.append(mapStatus);
function showMapStatus(message,retry){
 if(!mapStatus.hidden&&mapStatus.querySelector('p')?.textContent===message){const button=mapStatus.querySelector('button');if(button&&retry)button.onclick=retry;return}
 mapStatus.replaceChildren();mapStatus.hidden=false;
 const text=document.createElement('p');text.textContent=message;mapStatus.append(text);
 if(retry){const button=document.createElement('button');button.type='button';button.textContent='Try again';button.onclick=retry;mapStatus.append(button)}
 const link=document.createElement('a');link.href='/places/';link.textContent='Browse all places';mapStatus.append(link);
}
function clearMapStatus(){
 if(mapStatus.contains(document.activeElement)){
  const target=$('#place-card').open?$('#card-content'):!$('#filter-toggle').closest('[inert]')?$('#filter-toggle'):$('.brand');
  target.focus({preventScroll:true});
 }
 mapStatus.hidden=true;mapStatus.replaceChildren();
}
async function fetchData(url){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw new Error('Map data unavailable');return await response.json()}
 finally{clearTimeout(timeout)}
}
async function loadMapData(){
 for(;;){
  const loading=setTimeout(()=>showMapStatus('Loading the map…'),800);
  try{
   const data=await Promise.all([fetchData(`/places-data.json?v=${$('#atlas').dataset.revision}`),fetchData(`/map-config.json?v=${$('#atlas').dataset.mapRevision}`)]);
   if(!Array.isArray(data[0])||!data[1]?.projection||!Array.isArray(data[1].camera))throw new Error('Invalid map data');
   clearTimeout(loading);return data;
  }catch{
   clearTimeout(loading);
   await new Promise(resolve=>showMapStatus('The map couldn’t load. Check your connection and try again.',()=>{showMapStatus('Loading the map…');resolve()}));
  }
 }
}
const pendingControls=$$('#atlas,#map-tools,.map-zoom,.overview,.route-key');
pendingControls.forEach(el=>el.inert=true);$('#atlas').setAttribute('aria-busy','true');
const [places,config]=await loadMapData();
pendingControls.forEach(el=>el.inert=false);$('#atlas').removeAttribute('aria-busy');clearMapStatus();
const byId=new Map(places.map(p=>[p.id,p]));
const symbols={beach:'≈',nature:'♧',harbor:'⚓',landmark:'◇'};
const regions=[['Edgewater & Montrose',41.979,'Quiet beaches & the Magic Hedge'],['Harbors of Lincoln Park',41.945,'Masts, lawns & open water'],['Lincoln Park & North Avenue',41.920,'Park paths meet the skyline'],['The Gold Coast',41.906,'Sand at the foot of the city'],['Streeterville & Navy Pier',41.895,'A city reaching into the lake'],['The downtown lakefront',41.879,'Grand parks & a thousand sails'],['Museum Campus',41.863,'Big discoveries, wider horizons'],['The southern harbors',41.834,'A different view of downtown'],['Burnham Park & the Point',41.803,'Long lawns & limestone edges'],['Jackson Park & South Shore',41.781,'Lagoons, history & one last beach']];
const boundaries=[41.966,41.926,41.911,41.902,41.888,41.867,41.838,41.820,41.792];
const projection=config.projection;
const mapY=lat=>(projection.originLat-lat)*projection.scaleY+projection.offsetY,mapX=lon=>(lon-projection.originLon)*projection.scaleX+projection.offsetX;
const mapLatitude=y=>projection.originLat-(y-projection.offsetY)/projection.scaleY;
const validMapLatitude=lat=>Number.isFinite(lat)&&lat>=Number(mapLatitude(config.height).toFixed(4))&&lat<=Number(mapLatitude(0).toFixed(4));
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let scale=1,zoom=1,shiftX=0,shiftY=0,panX=0,currentLat=41.988,currentMapX=0,filter='all',selected=null,focusPlace=null,lastTrigger=null,raf=0,urlTimer,scrollStopFrame=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const mobile=()=>innerWidth<=700;
const fullscreenDetails=matchMedia('(max-width:700px), (hover:none) and (pointer:coarse)');
const canvas=$('#map-canvas'),atlas=$('#atlas'),miniDot=$('#mini-dot');
const markers=$$('.map-marker').map(el=>({el,p:byId.get(el.dataset.place),label:el.querySelector('.marker-label')}));
const northernmostY=Math.min(...places.map(p=>mapY(p.lat)));
const southernmostY=Math.max(...places.map(p=>mapY(p.lat)));
let openingOffset=0;
const controls=[$('#map-tools'),$('.overview'),$('.route-key'),$('.map-zoom'),$('.map-attribution')].filter(Boolean);
let lastRegion=-1;
const clampX=x=>config.width*scale<=innerWidth?(innerWidth-config.width*scale)/2:Math.max(innerWidth-config.width*scale,Math.min(0,x));
function visibleView(){
 const v=window.visualViewport;
 const left=v?.offsetLeft??0,top=v?.offsetTop??0,width=v?.width??innerWidth,height=v?.height??innerHeight;
 return {left,top,width,height,right:left+width,bottom:top+height};
}
function syncCardMode(){
 const card=$('#place-card'),full=fullscreenDetails.matches;
 if(card.open&&card.matches(':modal')!==full){
  card.close();full?card.showModal():card.show();
  $('#card-content').focus({preventScroll:true});
 }
 document.documentElement.classList.toggle('details-open',full&&card.open);
 const notice=$('#toast'),parent=full&&card.open?card:document.body;
 if(notice.parentElement!==parent)parent.append(notice);
}
function viewAnchor(){
 const card=$('#place-card'),v=visibleView();
 if(card.open&&!fullscreenDetails.matches){
  const r=card.getBoundingClientRect(),top=Math.max(v.top,$('.site-header').getBoundingClientRect().bottom);
  return mobile()?{x:v.left+v.width*.5,y:(Math.min(top,v.bottom)+Math.max(top,Math.min(v.bottom,r.top)))/2}:{x:v.left+Math.max(Math.min(100,v.width/2),(Math.min(v.right,r.left)-v.left)*.58),y:v.top+v.height*.44};
 }
 return {x:v.left+v.width*(mobile()?.53:.62),y:v.top+v.height*.44};
}
function overviewPoint(y){
 const points=config.overview.positionSamples;
 let lo=0,hi=points.length-1;
 while(lo<hi){const mid=(lo+hi)>>1;if(points[mid][0]<y)lo=mid+1;else hi=mid}
 const b=points[lo],a=points[Math.max(0,lo-1)],t=a[0]===b[0]?0:Math.max(0,Math.min(1,(y-a[0])/(b[0]-a[0])));
 return [a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
}
let keyboardNavigation=false;addEventListener('keydown',e=>{if(e.key==='Tab')keyboardNavigation=true});addEventListener('pointerdown',e=>{
 keyboardNavigation=false;
 if(!atlas.contains(e.target)){clearEmptyTap();if(!e.target.closest('.map-zoom,#place-card:modal'))stopCameraMotion()}
},{passive:true});
function cameraX(y){const points=config.camera,i=Math.max(0,Math.min(points.length-2,Math.floor(y/60))),a=points[i],b=points[i+1],t=Math.max(0,Math.min(1,(y-a[0])/(b[0]-a[0])));return a[1]+(b[1]-a[1])*t}
function cameraFocusX(y){const id=focusPlace||(keyboardNavigation?document.activeElement?.dataset?.place:null);return id&&byId.has(id)?mapX(byId.get(id).lon):cameraX(y)}
function matchesFilter(p,value=filter){return value==='all'||(value==='art'?/sculpture|monument|memorial|fountain|public art/.test(p.subtype??''):value==='culture'?/theater|theatre|performance|museum|conservatory|venue/.test(p.subtype??''):p.category===value)}
// Labels are measured and arranged on layout/filter changes, never in the scroll loop.
// Every circle remains centered on the source coordinate, even when its label is hidden.
function arrangeMarkers(){
 const inverse=1/scale,factor=1;
 for(const m of markers){
  m.el.style.transform=`translate(-50%,-50%) scale(${inverse})`;
  m.renderScale=scale;
  const left=mapX(m.p.lon)<cameraX(mapY(m.p.lat))-45;
  m.el.classList.toggle('align-left',left);m.el.classList.remove('label-muted');m.left=left;
 }
 const measurements=markers.map(m=>({...m,width:m.label.offsetWidth*factor,height:m.label.offsetHeight*factor}));
 const occupied=[];
 const pinBoxes=markers.filter(m=>matchesFilter(m.p)).map(m=>{const x=mapX(m.p.lon)*scale,y=mapY(m.p.lat)*scale,r=10;return {id:m.p.id,l:x-r,r:x+r,t:y-r,b:y+r}});
 const intersects=(a,b)=>a.l<b.r&&a.r>b.l&&a.t<b.b&&a.b>b.t;
 measurements.sort((a,b)=>(b.p.featured!==false)-(a.p.featured!==false)||Number(!!b.p.story)-Number(!!a.p.story));
 for(const m of measurements){
  if(!matchesFilter(m.p))continue;
  const x=mapX(m.p.lon)*scale,y=mapY(m.p.lat)*scale,gap=20;
  let chosen=null;
  for(const left of [m.left,!m.left]){
   const box={l:left?x-gap-m.width:x+gap,r:left?x-gap:x+gap+m.width,t:y-m.height/2-4,b:y+m.height/2+4};
   if(!occupied.some(o=>intersects(box,o))&&!pinBoxes.some(o=>o.id!==m.p.id&&intersects(box,o))){chosen=box;m.el.classList.toggle('align-left',left);break}
  }
  m.el.classList.toggle('label-muted',!chosen);if(chosen)occupied.push(chosen);
 }
}
function sizeMap(updateMarkers=true){
 scale=(mobile()?.72:Math.min(1.12,innerWidth/1440))*zoom;shiftY=mobile()?170:0;
 // Keep the last place reachable near the viewport center at minimum zoom.
 const clearance=mobile()?Math.max(0,visibleView().height*.5-$('.site-footer').offsetHeight):0;
 const height=Math.max(config.height*scale,southernmostY*scale+clearance);
 canvas.style.width=`${config.width}px`;atlas.style.height=`${height+shiftY}px`;
 // Keep targets and labels readable while the artwork scales during a pinch.
 if(updateMarkers)for(const m of markers){m.el.style.transform=`translate(-50%,-50%) scale(${1/scale})`;m.renderScale=scale}
}
function resizeVisibleMarkers(x,top){
 const view=visibleView();
 for(const m of markers){
  const markerX=x+mapX(m.p.lon)*scale,markerY=top+shiftY+mapY(m.p.lat)*scale,padding=220*Math.max(1,scale/m.renderScale);
  if(m.renderScale!==scale&&markerX>view.left-padding&&markerX<view.right+padding&&markerY>view.top-padding&&markerY<view.bottom+padding){m.el.style.transform=`translate(-50%,-50%) scale(${1/scale})`;m.renderScale=scale}
 }
}
function layout(){
 sizeMap();
 // Begin near the northern places while keeping the full introduction visible.
 // The paper margin stays above this view, reachable with ordinary scrolling.
 const intro=$('.map-intro'),headerBottom=$('.site-header').getBoundingClientRect().bottom;
 const introSpansMap=mobile()||(innerWidth<=1000&&innerHeight<=450);
 const target=Math.max(headerBottom+24,Math.min(headerBottom+200,innerHeight-100),introSpansMap?atlas.offsetTop+intro.offsetTop+intro.offsetHeight+28:0);
 openingOffset=Math.max(0,atlas.offsetTop+shiftY+northernmostY*(scale/zoom)-target);
 intro.style.setProperty('--opening-offset',`${openingOffset}px`);
 arrangeMarkers();updatePosition();
}
function updatePosition(){
 const rect=atlas.getBoundingClientRect(),anchor=viewAnchor();const y=Math.max(0,Math.min(config.height,(anchor.y-rect.top-shiftY)/scale));currentLat=mapLatitude(y);
 const focus=cameraFocusX(y);
 shiftX=clampX(anchor.x-focus*scale+panX);
 currentMapX=(anchor.x-shiftX)/scale;
 canvas.style.transform=`translate(${shiftX.toFixed(2)}px,${shiftY}px) scale(${scale})`;
 let i=boundaries.findIndex(b=>currentLat>=b);if(i<0)i=9;
 if(i!==lastRegion){$('#progress-text').textContent=regions[i][0].toUpperCase();lastRegion=i}
 const p=overviewPoint(y);miniDot.setAttribute('cx',p[0]);miniDot.setAttribute('cy',p[1]);
 const atEnd=rect.bottom<innerHeight-24,cardOpen=$('#place-card').open;
 controls.forEach(el=>{const away=atEnd||(cardOpen&&(fullscreenDetails.matches||el.classList.contains('overview')));el.classList.toggle('tools-away',away);el.inert=away});
 document.body.classList.toggle('place-open',cardOpen);
 raf=0;
}
function schedulePosition(){if(!raf)raf=requestAnimationFrame(updatePosition)}
addEventListener('scroll',()=>{
 schedulePosition();clearTimeout(urlTimer);const entry=location.href;
 urlTimer=setTimeout(()=>{
  // A timer can run before a delayed animation frame. Save the actual view,
  // and never let a previous history entry overwrite a new destination.
  if(location.href===entry&&!selected&&!$('#place-card').open&&scrollY>300){const u=new URL(entry);u.searchParams.set('at',mapLatitude(anchorMapY()).toFixed(4));history.replaceState(history.state,'',u)}
 },500);
},{passive:true});
addEventListener('wheel',e=>{if(!e.target.closest?.('dialog')){cancelScrollStop();clearEmptyTap();stopGlide();if(!e.ctrlKey){stopZoom();releaseCameraFocus()}}},{passive:true});
// Trackpads: two-finger sideways swipes pan the map (vertical stays native
// scrolling), and pinches, which browsers report as ctrl+wheel, zoom the map
// at the pointer instead of zooming the whole page.
const wheelPixels=(e,delta)=>delta*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1);
let wheelZoom=null;
function applyWheelZoom(){
 const {delta,x,y}=wheelZoom;wheelZoom.frame=0;wheelZoom.delta=0;
 zoomAt(zoom*Math.exp(-delta/110),{x,y});zoomGoal=zoom;
 clearTimeout(arrangeTimer);arrangeTimer=setTimeout(settleZoom,180);
}
atlas.addEventListener('wheel',e=>{
 if(e.ctrlKey){
  e.preventDefault();if(pinch||drag)return;stopZoomAnimation();releaseCameraFocus();highlightMarker(null);
  wheelZoom??={delta:0,frame:0};
  // A mouse-wheel notch arrives as one large step; a trackpad pinch as many small ones.
  wheelZoom.delta+=Math.max(-40,Math.min(40,wheelPixels(e,e.deltaY)));Object.assign(wheelZoom,{x:e.clientX,y:e.clientY});
  if(!wheelZoom.frame)wheelZoom.frame=requestAnimationFrame(applyWheelZoom);
  return;
 }
 const dx=e.shiftKey&&!e.deltaX?e.deltaY:e.deltaX;
 if(!dx||drag||pinch)return;
 // Shift+wheel has no native vertical meaning here; keep the page still.
 if(e.shiftKey&&!e.deltaX)e.preventDefault();
 stopZoom();panBy(-wheelPixels(e,dx));
},{passive:false});
// Safari reports trackpad pinches as gesture events, and iOS uses them for page zoom.
let gestureBase=null;
atlas.addEventListener('gesturestart',e=>{e.preventDefault();if(!touchPointers.size){clearEmptyTap();stopCameraMotion();releaseCameraFocus();gestureBase=zoom}});
atlas.addEventListener('gesturechange',e=>{
 e.preventDefault();if(gestureBase===null||touchPointers.size||!Number.isFinite(e.scale))return;
 const point={x:e.clientX,y:e.clientY};zoomAt(gestureBase*e.scale,point);zoomGoal=zoom;
});
atlas.addEventListener('gestureend',e=>{e.preventDefault();if(gestureBase!==null){gestureBase=null;settleZoom()}});
// Stop browser back/forward swipes from firing while panning the map sideways.
document.documentElement.style.overscrollBehaviorX='none';
function preserveViewLayout(){
 const lat=currentLat,x=currentMapX,atTop=scrollY<2;layout();
 const top=atlas.offsetTop+shiftY+mapY(lat)*scale-viewAnchor().y;
 scrollMapTo({top:atTop?0:Math.max(0,top),behavior:'instant'});
 const y=Math.max(0,Math.min(config.height,(viewAnchor().y-atlas.getBoundingClientRect().top-shiftY)/scale));
 panX=(cameraFocusX(y)-x)*scale;updatePosition();
}
let layoutWidth=innerWidth,viewportFrame=0,selectionTimer;
function refreshViewport(){
 viewportFrame=0;syncCardMode();
 // Browser magnification and toolbars must not move the covered map.
 if($('#place-card').matches(':modal')&&innerWidth===layoutWidth)return;
 if(innerWidth!==layoutWidth){layoutWidth=innerWidth;cancelGestures();stopZoomAnimation();preserveViewLayout()}
 // Mobile browser bars and keyboards change height. Do not scroll or reset
 // zoom in response: keep the current horizontal translation as well.
 else{
  sizeMap();
  const anchor=viewAnchor(),y=Math.max(0,Math.min(config.height,(anchor.y-atlas.getBoundingClientRect().top-shiftY)/scale));
  panX=shiftX-(anchor.x-cameraFocusX(y)*scale);updatePosition();
 }
}
function viewportChanged(){if(!viewportFrame)viewportFrame=requestAnimationFrame(refreshViewport)}
function viewportResized(){
 viewportChanged();clearTimeout(selectionTimer);
 // Recheck after keyboard/toolbar animation settles. Manual gestures release
 // focusPlace, so resizing never pulls the map back after the user pans away.
 selectionTimer=setTimeout(()=>{if(selected&&focusPlace===selected&&!drag&&!pinch&&$('#place-card').open&&!fullscreenDetails.matches&&!placeVisible(selected))jump(byId.get(selected).lat,{smooth:false,focusId:selected})},150);
}
addEventListener('resize',viewportResized);
window.visualViewport?.addEventListener('resize',viewportResized);
window.visualViewport?.addEventListener('scroll',viewportChanged);
fullscreenDetails.addEventListener('change',viewportResized);
function jump(lat,{smooth=true,focusId=null}={}){stopCameraMotion();clearEmptyTap();clearTimeout(urlTimer);focusPlace=focusId;panX=0;const top=atlas.offsetTop+shiftY+mapY(lat)*scale-viewAnchor().y;scrollMapTo({top:Math.max(0,top),behavior:smooth&&!reduced.matches?'smooth':'instant'});schedulePosition()}
const minZoom=.5,maxZoom=4;
function updateZoomControls(){$('#zoom-level').textContent=`${Number(zoom.toFixed(2))}×`;$('#zoom-out').disabled=zoom<=minZoom;$('#zoom-in').disabled=zoom>=maxZoom}
// Buttons step in halves from wherever a pinch or trackpad left the zoom.
// Repeated presses build on the destination of an animation still running.
function changeZoom(direction){animateZoom(nextZoomStep(zoomAnimation?zoomGoal:zoom,direction))}
$('#zoom-in').onclick=()=>changeZoom(1);$('#zoom-out').onclick=()=>changeZoom(-1);
// Keep the camera where the user leaves it while allowing the route to follow scroll.
function releaseCameraFocus(){
 if(!focusPlace&&!keyboardNavigation)return;
 focusPlace=null;keyboardNavigation=false;
 // A smooth scroll can advance before its animation-frame camera update.
 // Use the actual position when handing control to a pointer gesture.
 const anchor=viewAnchor(),y=Math.max(0,Math.min(config.height,(anchor.y-atlas.getBoundingClientRect().top-shiftY)/scale));
 panX=shiftX-(anchor.x-cameraX(y)*scale);
}
function holdCamera(focusId=null){
 focusPlace=focusId;
 const y=Math.max(0,Math.min(config.height,(viewAnchor().y-atlas.getBoundingClientRect().top-shiftY)/scale));
 panX=shiftX-(viewAnchor().x-cameraFocusX(y)*scale);
}
let drag=null,pinch=null,gestureFrame=0,suppressClickUntil=0,hoveredMarker=null;
const touchPointers=new Map();
const pointOnMap=point=>({x:(point.x-shiftX)/scale,y:(point.y-atlas.getBoundingClientRect().top-shiftY)/scale});
const anchorMapY=()=>Math.max(0,Math.min(config.height,(viewAnchor().y-atlas.getBoundingClientRect().top-shiftY)/scale));
// Move the map horizontally by screen pixels, rebasing at the map edges so
// reversing direction responds at once instead of unwinding hidden overscroll.
function panBy(dx){
 cancelScrollStop();const wanted=clampX(shiftX+dx);
 panX=wanted-(viewAnchor().x-cameraFocusX(anchorMapY())*scale);updatePosition();
}
// Touch flicks keep travelling with decaying velocity, as native scrolling does.
// Any new input (touch, wheel, key, zoom, navigation) stops the glide at once.
let glide=null;
function stopGlide(){if(glide){cancelAnimationFrame(glide.frame);glide=null}}
function startGlide(samples,endTime){
 if(reduced.matches||!samples||samples.length<2)return;
 const last=samples.at(-1);if(endTime-last.t>70)return; // the finger rested before lifting
 const first=samples.find(s=>last.t-s.t<=100)||samples[0],elapsed=last.t-first.t;if(elapsed<8)return;
 let vx=(last.x-first.x)/elapsed,vy=(last.y-first.y)/elapsed;const speed=Math.hypot(vx,vy);
 if(speed<.3)return;
 if(speed>5){vx*=5/speed;vy*=5/speed}
 let previous=performance.now(),top=scrollY;
 const step=now=>{
  if(!glide)return;
  const dt=Math.min(34,now-previous);previous=now;
  if(vy){top-=vy*dt;scrollMapTo({top,behavior:'instant'});if(Math.abs(scrollY-top)>1){top=scrollY;vy=0}}
  if(vx){const dx=vx*dt;if(Math.abs(clampX(shiftX+dx)-(shiftX+dx))>.5)vx=0;panBy(dx)}else updatePosition();
  const decay=Math.pow(.9962,dt);vx*=decay;vy*=decay;
  if(Math.hypot(vx,vy)<.03){glide=null;return}
  glide.frame=requestAnimationFrame(step);
 };
 glide={frame:requestAnimationFrame(step)};
}
// Zoom so the map coordinate under a screen point stays beneath it.
function zoomAt(value,point,map=pointOnMap(point)){
 zoom=Math.max(minZoom,Math.min(maxZoom,value));sizeMap(false);
 scrollMapTo({top:atlas.offsetTop+shiftY+map.y*scale-point.y,behavior:'instant'});
 const wanted=clampX(point.x-map.x*scale);
 resizeVisibleMarkers(wanted,atlas.getBoundingClientRect().top);
 panX=wanted-(viewAnchor().x-cameraFocusX(anchorMapY())*scale);updatePosition();updateZoomControls();
}
let zoomGoal=1,zoomAnimation=0,arrangeTimer=0;
function settleZoom(){clearTimeout(arrangeTimer);arrangeTimer=0;arrangeMarkers();updatePosition();updateZoomControls()}
// Animated zoom for buttons, keys and double taps. Interpolating geometrically
// gives every frame the same proportional change, so the motion feels even.
function animateZoom(target,point=viewAnchor()){
 stopCameraMotion();clearEmptyTap();
 target=Math.max(minZoom,Math.min(maxZoom,target));zoomGoal=target;
 const map=pointOnMap(point),from=zoom;
 if(reduced.matches||Math.abs(target-from)<.001){zoomAt(target,point,map);settleZoom();delete atlas.dataset.zooming;return}
 atlas.dataset.zooming='true';
 const start=performance.now(),duration=260;
 const step=now=>{
  const t=Math.min(1,(now-start)/duration),eased=1-Math.pow(1-t,3);
  zoomAt(from*Math.pow(target/from,eased),point,map);
  if(t<1)zoomAnimation=requestAnimationFrame(step);
  else{zoomAnimation=0;zoom=target;settleZoom();delete atlas.dataset.zooming}
 };
 zoomAnimation=requestAnimationFrame(step);
}
function stopZoomAnimation(){if(zoomAnimation){cancelAnimationFrame(zoomAnimation);zoomAnimation=0;delete atlas.dataset.zooming;zoomGoal=zoom;settleZoom()}}
function stopZoom(){
 const pending=!!wheelZoom?.frame||!!arrangeTimer||gestureBase!==null;
 if(wheelZoom?.frame)cancelAnimationFrame(wheelZoom.frame);
 wheelZoom=null;gestureBase=null;
 stopZoomAnimation();
 if(pending){zoomGoal=zoom;settleZoom()}
}
// Freeze browser-driven section jumps as well as custom glide and zoom.
function cancelScrollStop(){cancelAnimationFrame(scrollStopFrame);scrollStopFrame=0}
function scrollMapTo(options){cancelScrollStop();scrollTo(options)}
function stopCameraMotion(){
 stopGlide();stopZoom();cancelScrollStop();const top=scrollY;
 scrollTo({top,behavior:'instant'});
 // Compositor scrolling can deliver one more frame after cancellation. A new
 // map movement cancels this correction before starting its own scroll.
 scrollStopFrame=requestAnimationFrame(()=>{scrollStopFrame=0;scrollTo({top,behavior:'instant'});schedulePosition()});
}
const nextZoomStep=(value,direction)=>direction>0?Math.floor(value*2+1e-6)/2+.5:Math.ceil(value*2-1e-6)/2-.5;
function pinchPoints(){
 if(!pinch)return null;
 const [a,b]=pinch.ids.map(id=>touchPointers.get(id));
 if(!a||!b)return null;
 return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(a.x-b.x,a.y-b.y)};
}
function capturePointer(id){
 try{atlas.setPointerCapture(id);return true}catch(error){
  // A cancelled/released pointer may disappear before capture is applied.
  if(error.name!=='NotFoundError'&&error.name!=='InvalidStateError')throw error;
  return false;
 }
}
function beginPinch(){
 stopCameraMotion();clearEmptyTap();
 // Freeze the rendered camera even when a section jump has no focused place.
 drag=null;keyboardNavigation=false;holdCamera();highlightMarker(null);
 pinch={ids:[...touchPointers.keys()].slice(0,2)};
 const point=pinchPoints();
 Object.assign(pinch,{distance:Math.max(8,point.distance),zoom,map:pointOnMap(point)});
 suppressClickUntil=performance.now()+400;atlas.classList.add('dragging');
 $('#filters').hidden=true;$('#filter-toggle').setAttribute('aria-expanded','false');
 for(const id of pinch.ids)if(!capturePointer(id)){cancelGestures();return}
 // A cancelled native smooth scroll can still deliver one compositor frame.
 // Reassert the pinch anchor on the next frame even before either finger moves.
 gestureFrame=requestAnimationFrame(renderPinch);
}
function renderPinch(){
 gestureFrame=0;
 const point=pinchPoints();if(!point||point.distance<8)return;
 const requested=pinch.zoom*point.distance/pinch.distance;
 if(!Number.isFinite(requested))return;
 zoom=Math.max(minZoom,Math.min(maxZoom,requested));sizeMap(false);
 // Anchor the same map coordinate beneath the moving midpoint. Read the
 // actual scroll position afterwards, since the browser clamps at either end.
 scrollMapTo({top:atlas.offsetTop+shiftY+pinch.map.y*scale-point.y,behavior:'instant'});
 const anchor=viewAnchor(),rect=atlas.getBoundingClientRect(),y=Math.max(0,Math.min(config.height,(anchor.y-rect.top-shiftY)/scale));
 const wanted=clampX(point.x-pinch.map.x*scale);
 // Avoid recalculating every offscreen label on every touch frame. Include
 // both old and new label bounds so a large pinch cannot reveal a stale size.
 // finishPinch restores every marker before normal navigation resumes.
 resizeVisibleMarkers(wanted,rect.top);
 panX=wanted-(anchor.x-cameraX(y)*scale);updatePosition();updateZoomControls();
 // Rebase at the limits so reversing direction responds immediately.
 if(requested<=minZoom||requested>=maxZoom)Object.assign(pinch,{distance:point.distance,zoom,map:pointOnMap(point)});
}
function finishPinch(){
 if(gestureFrame){cancelAnimationFrame(gestureFrame);renderPinch()}
 if(pinch){pinch=null;suppressClickUntil=performance.now()+400;arrangeMarkers()}
}
// Resolve overlapping touch targets by distance to the geographic dot, keeping
// every pin at its source coordinate instead of letting DOM order choose a place.
function nearestMarker(x,y,radius=22){
 const top=atlas.getBoundingClientRect().top+shiftY;
 let nearest=null,distance=radius*radius;
 for(const marker of markers){
  if(!matchesFilter(marker.p))continue;
  const dx=x-(shiftX+mapX(marker.p.lon)*scale),dy=y-(top+mapY(marker.p.lat)*scale),d=dx*dx+dy*dy;
  if(d<distance){nearest=marker;distance=d}
 }
 return nearest;
}
function highlightMarker(marker){
 if(hoveredMarker===marker)return;
 hoveredMarker?.el.classList.remove('pointer-nearest');
 hoveredMarker=marker;hoveredMarker?.el.classList.add('pointer-nearest');
}
atlas.addEventListener('pointerleave',()=>highlightMarker(null));
atlas.addEventListener('pointerdown',e=>{
 const menu=$('.mobile-menu');if(menu?.open)menu.open=false;
 if(e.button!==0||e.target.closest('a,button:not(.map-marker),input,summary'))return;
 // Touching a gliding map catches it, as on native scroll views, without selecting.
 const caught=!!glide||!!zoomAnimation;stopCameraMotion();
 if(e.pointerType==='touch'){
  // A fresh touch is intentional; only the click ending the old gesture is suppressed.
  if(!touchPointers.size)suppressClickUntil=0;
  touchPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(caught)suppressClickUntil=performance.now()+400;
  if(touchPointers.size>=2){if(!pinch)beginPinch();return}
 }else if(!e.isPrimary||touchPointers.size)return;
 drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,scrollY,x:e.clientX,y:e.clientY,moved:false,caught};
});
atlas.addEventListener('pointermove',e=>{
 if(touchPointers.has(e.pointerId))touchPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pinch){if(!gestureFrame)gestureFrame=requestAnimationFrame(renderPinch);e.preventDefault();return}
 if(e.pointerType==='mouse'&&!drag){
  const label=e.target.closest('.marker-label');
  const dot=nearestMarker(e.clientX,e.clientY,10);
  highlightMarker(dot||(label?markers.find(m=>m.el===label.closest('.map-marker')):nearestMarker(e.clientX,e.clientY)));
 }
 if(!drag||e.pointerId!==drag.id)return;
 if(!drag.moved&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<6)return;
 if(!drag.moved){drag.moved=true;clearEmptyTap();highlightMarker(null);releaseCameraFocus();if(!capturePointer(e.pointerId)){cancelGestures();return}atlas.classList.add('dragging');$('#filters').hidden=true;$('#filter-toggle').setAttribute('aria-expanded','false')}
 const dx=e.clientX-drag.x,wanted=clampX(shiftX+dx);
 drag.x=e.clientX;drag.y=e.clientY;
 // Use cumulative movement so fractional pointer steps cannot accumulate
 // rounding error on browsers that expose whole-pixel scroll positions.
 const wantedY=drag.scrollY+drag.startY-e.clientY;
 if(e.pointerType!=='mouse'){(drag.samples??=[]).push({t:e.timeStamp,x:e.clientX,y:e.clientY});if(drag.samples.length>12)drag.samples.shift()}
 scrollMapTo({top:wantedY,behavior:'instant'});
 // Rebase at document bounds, while retaining subpixel movement elsewhere.
 if(Math.abs(scrollY-wantedY)>1){drag.scrollY=scrollY;drag.startY=e.clientY}
 const y=Math.max(0,Math.min(config.height,(viewAnchor().y-atlas.getBoundingClientRect().top-shiftY)/scale));
 panX=wanted-(viewAnchor().x-cameraX(y)*scale);updatePosition();e.preventDefault();
});
function finishDrag(e){
 if(!drag||(e&&e.pointerId!==drag.id))return;
 if(drag.moved||drag.caught)suppressClickUntil=performance.now()+400;
 const id=drag.id,samples=drag.moved&&e?.type==='pointerup'?drag.samples:null;
 drag=null;atlas.classList.remove('dragging');
 if(atlas.hasPointerCapture(id))atlas.releasePointerCapture(id);
 startGlide(samples,e?.timeStamp);
}
function endPointer(e){
 if(!touchPointers.has(e.pointerId)){finishDrag(e);return}
 const wasPinching=pinch?.ids.includes(e.pointerId);
 if(wasPinching)finishPinch();
 touchPointers.delete(e.pointerId);
 if(atlas.hasPointerCapture(e.pointerId))atlas.releasePointerCapture(e.pointerId);
 if(wasPinching){
  if(touchPointers.size>=2)beginPinch();
  else if(touchPointers.size===1){
   const [id,point]=touchPointers.entries().next().value;
   // Continue panning from the remaining finger's current position.
   drag={id,startX:point.x,startY:point.y,scrollY,...point,moved:true};
  }else{drag=null;atlas.classList.remove('dragging')}
 }else finishDrag(e);
}
function cancelGestures(){
 stopCameraMotion();clearEmptyTap();
 if(gestureFrame){cancelAnimationFrame(gestureFrame);gestureFrame=0}
 const ids=[...touchPointers.keys()];touchPointers.clear();
 if(pinch){pinch=null;arrangeMarkers()}
 if(ids.length||drag)suppressClickUntil=performance.now()+400;
 finishDrag();atlas.classList.remove('dragging');
 for(const id of ids)if(atlas.hasPointerCapture(id))atlas.releasePointerCapture(id);
}
addEventListener('pointerup',endPointer);
addEventListener('pointercancel',e=>{if(touchPointers.has(e.pointerId)||drag?.id===e.pointerId)cancelGestures()});
atlas.addEventListener('lostpointercapture',e=>{if(e.target===atlas&&!atlas.hasPointerCapture(e.pointerId)&&(touchPointers.has(e.pointerId)||drag?.id===e.pointerId))cancelGestures()});
addEventListener('blur',cancelGestures);addEventListener('pagehide',cancelGestures);
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelGestures()});
atlas.addEventListener('click',e=>{
 if(e.detail&&(pinch||touchPointers.size>1||performance.now()<suppressClickUntil)){e.preventDefault();e.stopImmediatePropagation();return}
 if(!e.detail||e.target.closest('a,button:not(.map-marker),input,summary'))return;
 // A revealed label can cross another pin. The visible dot still takes priority;
 // the rest of the label continues to open the place named on that label.
 const marker=nearestMarker(e.clientX,e.clientY,e.target.closest('.marker-label')?10:22);
 if(marker){
  e.preventDefault();e.stopImmediatePropagation();
  $('#filters').hidden=true;$('#filter-toggle').setAttribute('aria-expanded','false');
  openCard(marker.p.id,{trigger:marker.el});
  lastEmptyTap=null;
  return;
 }
 if(!atlas.contains(e.target)||e.target.closest('.map-intro,.map-marker'))return;
 // Empty map: a second tap or click zooms in there (Shift zooms out).
 const now=performance.now();
 if(lastEmptyTap&&now-lastEmptyTap.t<350&&Math.hypot(e.clientX-lastEmptyTap.x,e.clientY-lastEmptyTap.y)<40){
  lastEmptyTap=null;releaseCameraFocus();
  animateZoom(nextZoomStep(zoomAnimation?zoomGoal:zoom,e.shiftKey?-1:1),{x:e.clientX,y:e.clientY});
  return;
 }
 lastEmptyTap={t:now,x:e.clientX,y:e.clientY};
},true);
let lastEmptyTap=null;
function clearEmptyTap(){lastEmptyTap=null}
atlas.addEventListener('dragstart',e=>e.preventDefault());
// Two-dimensional loading: keep both distant rows and offscreen city/lake columns idle.
const tileObserver=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){loadTile(e.target);tileObserver.unobserve(e.target)}},{rootMargin:'450px 250px'});
async function loadTile(el){
 if(el.dataset.loaded)return;el.dataset.loaded='loading';delete el.dataset.failed;
 const img=new Image();img.alt='';img.width=1300;img.height=config.tileHeight;img.decoding='async';
 img.src=`/assets/map/tile-${el.dataset.tile}.webp?v=${atlas.dataset.mapRevision}`;
 try{await img.decode();el.replaceChildren(img);el.dataset.loaded='true'}catch{el.dataset.loaded='';el.dataset.failed='true'}
 const failed=$$('.map-tile[data-failed]');
 if(failed.length)showMapStatus('Some map details couldn’t load.',()=>{clearMapStatus();failed.forEach(loadTile)});
 else if(!$('.map-tile[data-loaded="loading"]'))clearMapStatus();
}
$$('.map-tile').forEach(el=>tileObserver.observe(el));

function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),3200)}
async function share(id){const url=new URL(document.querySelector('link[rel="canonical"]').href);if(id)url.searchParams.set('place',id);else url.searchParams.set('at',currentLat.toFixed(4));try{await navigator.clipboard.writeText(url.href);toast('Link copied. Share a little lakefront.')}catch{if(navigator.share){try{await navigator.share({title:'Lakefront Trail · Chicago',url:url.href})}catch{}}else{prompt('Copy this lakefront link:',url.href)}}}
function placeVisible(id){
 const marker=markers.find(m=>m.p.id===id).el.querySelector('.marker-dot').getBoundingClientRect(),card=$('#place-card'),v=visibleView();
 const top=Math.max(v.top,$('.site-header').getBoundingClientRect().bottom),r=card.getBoundingClientRect();
 const obscured=card.open&&!fullscreenDetails.matches&&marker.right>r.left&&marker.left<r.right&&marker.bottom>r.top&&marker.top<r.bottom;
 return !obscured&&marker.left>=v.left&&marker.right<=v.right&&marker.top>=top&&marker.bottom<=v.bottom;
}
function openCard(id,{travel=false,historyUpdate=true,trigger=null}={}){
 const p=byId.get(id);if(!p)return;
 stopCameraMotion();clearEmptyTap();clearTimeout(urlTimer);
 if(historyUpdate)history.replaceState({...history.state,mapView:{lat:mapLatitude(anchorMapY()),x:(viewAnchor().x-shiftX)/scale}},'');
 if(!matchesFilter(p))setFilter('all');
 selected=id;
 // Replacing a card through history must not make its own contents the return target.
 if(trigger)lastTrigger=trigger;
 else if(!$('#place-card').contains(document.activeElement))lastTrigger=document.activeElement;
 $$('.map-marker').forEach(el=>el.classList.toggle('selected',el.dataset.place===id));
 const photo=p.photo;const image=photo?`<img class="card-photo${photo.fit==='contain'?' photo-fit-contain':''}" src="${escape(photo.src)}" alt="${escape(photo.alt)}" width="${photo.width||960}" height="${photo.height||640}" decoding="async">`:`<div class="card-location"><span aria-hidden="true">${symbols[p.category]}</span><p>${escape(p.regionName)}<small>${p.lat.toFixed(4)}° N · ${Math.abs(p.lon).toFixed(4)}° W</small></p></div>`;
 $('#card-title').textContent=p.name;
 $('#card-body').innerHTML=`<div class="card-content"><p class="eyebrow">${symbols[p.category]} ${escape((p.subtype||p.category).toUpperCase())} <span>·</span> ${escape(p.access.toUpperCase())}</p><p class="card-description">${escape(p.description)}</p></div>${image}${photo?.caption?`<p class="card-photo-caption">${escape(photo.caption)}</p>`:''}<div class="card-content"><p class="card-fact">${escape(p.fact)}</p><div class="card-practical"><strong>A little before-you-go.</strong><br>${escape(p.practical)}</div><p class="card-location-source"><a href="${escape(p.coordinateMapUrl||p.coordinateUrl||p.officialUrl)}" target="_blank" rel="noopener">View mapped location ↗</a></p><div class="card-actions"><a href="${p.story?`/places/${p.id}/`:`/places/#${p.id}`}">Discover this place <span aria-hidden="true">↗</span></a><button id="share-place">Share ↗</button></div>${photo?`<p class="photo-credit">Photo: ${escape(photo.author)} · <a href="${escape(photo.licenseUrl)}" target="_blank" rel="noopener">${escape(photo.license)}</a> · <a href="${escape(photo.sourceUrl)}" target="_blank" rel="noopener">Source</a></p>`:'<p class="photo-credit">Visitor information from the linked official source.</p>'}</div>`;
 const cardPhoto=$('.card-photo');
 if(cardPhoto){
  let fallback;
  cardPhoto.onerror=()=>{
   if(fallback)return;
   fallback=document.createElement('div');fallback.className='card-photo-error';
   const text=document.createElement('p');text.textContent='This photo couldn’t load.';
   const retry=document.createElement('button');retry.type='button';retry.textContent='Try again';retry.onclick=()=>{
    // WebKit may keep a failed image request when assigned the identical URL.
    const url=new URL(photo.src,location.href);url.searchParams.set('retry',Date.now().toString(36));cardPhoto.src=url.href;
   };
   fallback.append(text,retry);cardPhoto.hidden=true;cardPhoto.after(fallback);
  };
  cardPhoto.onload=()=>{if(fallback?.contains(document.activeElement))$('#card-content').focus({preventScroll:true});cardPhoto.hidden=false;fallback?.remove();fallback=null};
 }
 $('#share-place').onclick=()=>share(id);if(!$('#place-card').open){fullscreenDetails.matches?$('#place-card').showModal():$('#place-card').show()}syncCardMode();$('#card-content').scrollTop=0;$('#card-content').focus({preventScroll:true});updateCardScrollbar();
 // Save the previous history entry's scroll position before moving the camera.
 if(historyUpdate){const url=new URL(location.href);url.searchParams.delete('at');url.searchParams.set('place',id);history.pushState({place:id},'',url)}
 if(travel||(!fullscreenDetails.matches&&!placeVisible(id)))jump(p.lat,{focusId:id,smooth:!fullscreenDetails.matches});
 else holdCamera(id);
 updatePosition();
}
function cleanSelection({historyUpdate=true}={}){
 if($('#place-card').open||selected===null)return;
 document.documentElement.classList.remove('details-open');
 document.body.append($('#toast'));
 selected=null;holdCamera();$$('.map-marker').forEach(el=>el.classList.remove('selected'));
 updatePosition();
 if(historyUpdate){const u=new URL(location.href);u.searchParams.delete('place');u.searchParams.set('at',currentLat.toFixed(4));history.replaceState({},'',u)}
}
function closeCard({historyUpdate=true,restoreFocus=true}={}){
 stopCameraMotion();clearEmptyTap();
 const card=$('#place-card');if(!card.open)return;
 const focusWasInside=card.contains(document.activeElement);
 // Native dialog focus restoration can fire a marker's focus handler too.
 const navigating=keyboardNavigation;keyboardNavigation=false;
 // Firefox's dialog close returns focus to the opener even when focus was
 // elsewhere; keep it where the visitor left it.
 const outsideFocus=focusWasInside?null:document.activeElement;
 card.close();cleanSelection({historyUpdate});
 if(outsideFocus?.isConnected&&outsideFocus!==document.body&&document.activeElement!==outsideFocus)outsideFocus.focus({preventScroll:true});
 if(restoreFocus&&focusWasInside){
  const target=lastTrigger?.isConnected&&!card.contains(lastTrigger)&&!lastTrigger.closest('[inert]')&&lastTrigger.getClientRects().length?lastTrigger:$('#filter-toggle');
  target.focus({preventScroll:true});
 }
 keyboardNavigation=navigating;
 // Subsequent scroll frames must use the same focus-based camera as this close.
 holdCamera();
}
$('#place-card').addEventListener('close',()=>cleanSelection());
$('#place-card').addEventListener('cancel',e=>{e.preventDefault();closeCard()});
// Only the left handle dismisses details; reading gestures belong to the browser.
const swipeHandle=$('.card-swipe-handle');
let cardSwipe=null;
function resetCardSwipe(){
 const id=cardSwipe?.id;cardSwipe=null;
 swipeHandle.style.removeProperty('--swipe-offset');
 swipeHandle.hidden=(window.visualViewport?.scale??1)>1.01;
 if(id!==undefined&&swipeHandle.hasPointerCapture(id))swipeHandle.releasePointerCapture(id);
}
swipeHandle.addEventListener('pointerdown',e=>{
 if(!e.isPrimary||e.button!==0||!fullscreenDetails.matches||(window.visualViewport?.scale??1)>1.01)return;
 cardSwipe={id:e.pointerId,x:e.clientX,y:e.clientY};swipeHandle.setPointerCapture(e.pointerId);
});
$('#place-card').addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&!e.isPrimary)resetCardSwipe()},true);
swipeHandle.addEventListener('pointermove',e=>{
 if(cardSwipe?.id!==e.pointerId)return;
 const dx=e.clientX-cardSwipe.x,dy=e.clientY-cardSwipe.y;
 if(Math.abs(dy)>20&&Math.abs(dy)>Math.abs(dx)){resetCardSwipe();return}
 swipeHandle.style.setProperty('--swipe-offset',`${Math.max(0,Math.min(32,dx/3))}px`);
});
swipeHandle.addEventListener('pointerup',e=>{
 if(cardSwipe?.id!==e.pointerId)return;
 const dx=e.clientX-cardSwipe.x,dy=e.clientY-cardSwipe.y;
 resetCardSwipe();
 if(dx>=64&&dx>Math.abs(dy)*2)closeCard();
});
for(const type of ['pointercancel','lostpointercapture'])swipeHandle.addEventListener(type,resetCardSwipe);
for(const type of ['blur','resize','pagehide'])addEventListener(type,resetCardSwipe);
window.visualViewport?.addEventListener('resize',resetCardSwipe);
$('#place-card').addEventListener('close',resetCardSwipe);
resetCardSwipe();
// Keep wheel and keyboard scrolling inside the panel, including short entries
// and its boundaries. Browser zoom and normal button/link keys stay available.
const cardScroller=$('#card-content');
// Keep a visible scroll cue whenever details overflow, including on touch screens.
const cardScrollbar=$('.card-scrollbar'),cardThumb=$('.card-scrollbar-thumb'),cardHeading=$('.card-heading');
let scrollbarDrag=null;
function updateCardScrollbar(){
 const range=cardScroller.scrollHeight-cardScroller.clientHeight;
 cardScrollbar.hidden=!$('#place-card').open||range<=1;
 if(cardScrollbar.hidden)return;
 cardScrollbar.style.top=`${cardHeading.offsetHeight+6}px`;
 const trackHeight=cardScrollbar.clientHeight,visibleBody=Math.max(0,cardScroller.clientHeight-cardHeading.offsetHeight);
 const thumbHeight=Math.min(trackHeight,Math.max(32,trackHeight*visibleBody/(visibleBody+range)));
 const progress=Math.max(0,Math.min(1,cardScroller.scrollTop/range));
 cardThumb.style.height=`${thumbHeight}px`;
 cardThumb.style.transform=`translateY(${progress*(trackHeight-thumbHeight)}px)`;
}
$('#place-card').classList.add('has-card-scrollbar');
cardScroller.addEventListener('scroll',updateCardScrollbar,{passive:true});
const cardResizeObserver=new ResizeObserver(updateCardScrollbar);
for(const el of [cardScroller,cardHeading,$('#card-body')])cardResizeObserver.observe(el);
function scrollFromBar(clientY,offset){
 const track=cardScrollbar.getBoundingClientRect(),travel=track.height-cardThumb.offsetHeight;
 if(travel>0)cardScroller.scrollTop=Math.max(0,Math.min(1,(clientY-track.top-offset)/travel))*(cardScroller.scrollHeight-cardScroller.clientHeight);
}
cardScrollbar.addEventListener('pointerdown',e=>{
 if(!e.isPrimary||e.button!==0)return;
 e.preventDefault();
 const thumb=cardThumb.getBoundingClientRect();
 scrollbarDrag={id:e.pointerId,offset:e.clientY>=thumb.top&&e.clientY<=thumb.bottom?e.clientY-thumb.top:thumb.height/2};
 cardScrollbar.setPointerCapture(e.pointerId);
 cardScroller.focus({preventScroll:true});
 scrollFromBar(e.clientY,scrollbarDrag.offset);
});
cardScrollbar.addEventListener('pointermove',e=>{if(scrollbarDrag?.id===e.pointerId)scrollFromBar(e.clientY,scrollbarDrag.offset)});
for(const type of ['pointerup','pointercancel','lostpointercapture'])cardScrollbar.addEventListener(type,()=>{scrollbarDrag=null});
const cardAtEdge=direction=>direction<0?cardScroller.scrollTop<=0:cardScroller.scrollTop+cardScroller.clientHeight>=cardScroller.scrollHeight-1;
$('#place-card').addEventListener('wheel',e=>{
 if(e.ctrlKey||e.metaKey)return;
 if(e.target.closest('.card-scrollbar')){
  e.preventDefault();cardScroller.scrollTop+=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?cardScroller.clientHeight:1);
 }else if((e.deltaY&&cardAtEdge(e.deltaY))||(!e.deltaY&&e.deltaX))e.preventDefault();
},{passive:false});
cardScroller.addEventListener('keydown',e=>{
 if(e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,textarea,select'))return;
 const direction={ArrowDown:1,PageDown:1,End:1,ArrowUp:-1,PageUp:-1,Home:-1}[e.key]||(e.key===' '&&!e.target.closest('button,summary,[role="button"]')?(e.shiftKey?-1:1):0);
 if(direction&&cardAtEdge(direction))e.preventDefault();
});
$$('.map-marker').forEach(el=>{el.addEventListener('click',()=>openCard(el.dataset.place));el.addEventListener('focus',()=>{if(keyboardNavigation){focusPlace=el.dataset.place;panX=0;schedulePosition()}})});
$$('[data-close]').forEach(b=>b.onclick=()=>closeCard());
// Keyboard map controls: + and − zoom, left and right arrows pan sideways.
// Up/down, Page and Space keep their native scrolling. Never steal keys from
// the details panel, form controls, or browser shortcuts.
addEventListener('keydown',e=>{
 stopGlide();
 if(e.ctrlKey||e.metaKey)cancelScrollStop();
 if($('#place-card').matches(':modal')||e.ctrlKey||e.metaKey||e.altKey||e.defaultPrevented||e.target.closest?.('input,textarea,select,dialog,.filter-control,summary,.mobile-menu'))return;
 cancelScrollStop();
 if(e.key==='+'||e.key==='='){e.preventDefault();changeZoom(1)}
 else if(e.key==='-'||e.key==='_'){e.preventDefault();changeZoom(-1)}
 else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();releaseCameraFocus();stopZoom();panBy((e.key==='ArrowLeft'?1:-1)*Math.min(240,innerWidth*.2))}
 else stopZoom();
});
addEventListener('keydown',e=>{if(e.key==='Escape'){const focusInFilters=$('#filters').contains(document.activeElement);$('#filters').hidden=true;$('#filter-toggle').setAttribute('aria-expanded','false');closeCard();if(focusInFilters)$('#filter-toggle').focus({preventScroll:true})}});
$('#filter-toggle').onclick=()=>{const h=$('#filters').hidden;$('#filters').hidden=!h;$('#filter-toggle').setAttribute('aria-expanded',String(h))};
function setFilter(value){
 if(selected&&!matchesFilter(byId.get(selected),value))closeCard({restoreFocus:false});
 const focusInFilters=$('#filters').contains(document.activeElement);
 filter=value;const list=places.filter(p=>matchesFilter(p,value));markers.forEach(({el,p})=>el.classList.toggle('hidden',!matchesFilter(p,value)));$$('[data-filter]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.filter===value)));$('#filter-label').textContent={all:'All discoveries',beach:'Beaches',nature:'Nature & quiet corners',harbor:'Harbors',landmark:'Landmarks',art:'Art & monuments',culture:'Stages & museums'}[value];$('#filter-count').textContent=list.length;$('#filters').hidden=true;$('#filter-toggle').setAttribute('aria-expanded','false');arrangeMarkers();
 if(focusInFilters)$('#filter-toggle').focus({preventScroll:true});
}
$$('[data-filter]').forEach(el=>el.onclick=()=>setFilter(el.dataset.filter));
addEventListener('click',e=>{if(!e.target.closest('.filter-control')){$('#filters').hidden=true;$('#filter-toggle').setAttribute('aria-expanded','false')}});
$('#begin').onclick=()=>jump(41.977);
$('#north-jump').onclick=()=>{
 cancelGestures();clearTimeout(urlTimer);closeCard({historyUpdate:false,restoreFocus:false});
 focusPlace=null;keyboardNavigation=false;panX=0;zoom=zoomGoal=1;
 layout();updateZoomControls();
 const url=new URL(location.href),state={...history.state,mapOpened:true};
 url.searchParams.delete('place');url.searchParams.delete('at');url.hash='';delete state.place;delete state.mapView;
 history.replaceState(state,'',url);
 scrollMapTo({top:openingOffset,behavior:reduced.matches?'instant':'smooth'});schedulePosition();
};
$('#south-jump').onclick=()=>jump(41.7669);$('#share-map').onclick=()=>share();
layout();updateZoomControls();
document.fonts.ready.then(arrangeMarkers);
const params=new URLSearchParams(location.search);if(params.has('place')&&byId.has(params.get('place')))openCard(params.get('place'),{travel:true,historyUpdate:false});else if(params.has('at')){const at=Number(params.get('at'));if(validMapLatitude(at))jump(at,{smooth:false})}
else if(!location.hash){
 const navigation=performance.getEntriesByType('navigation')[0]?.type;
 if(navigation!=='back_forward'&&!history.state?.mapOpened&&!openingInterrupted&&scrollY<2){scrollMapTo({top:openingOffset,behavior:'instant'});updatePosition()}
 history.replaceState({...history.state,mapOpened:true},'');
}
openingInput.abort();
addEventListener('popstate',()=>{
 cancelGestures();clearTimeout(urlTimer);
 const params=new URLSearchParams(location.search),id=params.get('place');
 if(id&&byId.has(id))openCard(id,{travel:true,historyUpdate:false});
 else{
  closeCard({historyUpdate:false,restoreFocus:false});
  const at=Number(params.get('at')),view=history.state?.mapView;
  if(view){
   // Native history restores old pixels after popstate. Apply the geographic
   // view afterwards; any new navigation or gesture cancels this frame.
   cancelScrollStop();scrollStopFrame=requestAnimationFrame(()=>{
    scrollStopFrame=0;jump(view.lat,{smooth:false});panX=(cameraX(anchorMapY())-view.x)*scale;updatePosition();
   });
  }
  else if(params.has('at')&&validMapLatitude(at))jump(at,{smooth:false});
  else{focusPlace=null;panX=0;scrollMapTo({top:openingOffset,behavior:'instant'});schedulePosition()}
 }
});
$('#atlas').dataset.ready='true';
