// Run against npm run dev with: npm run check:zoom
// Uses trusted Chromium touch events, not synthetic PointerEvent dispatch.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

assert.equal(typeof WebSocket,'function','Use Node 22+, or Node 20 with --experimental-websocket');
const base=process.env.LAKEFRONT_TEST_URL||'http://127.0.0.1:4179';
const browserSession=`lakefront-zoom-${process.pid}`;
const browser=(...args)=>{
 const result=JSON.parse(execFileSync('agent-browser',['--session',browserSession,'--json',...args],{encoding:'utf8',timeout:60000}));
 assert(result.success,JSON.stringify(result));return result.data;
};
let socket,sessionId,sequence=0,testTarget;
let device={width:390,height:844,deviceScaleFactor:3,mobile:true};
const pending=new Map(),errors=[],report=[];
function send(method,params={},session=sessionId){
 return new Promise((resolve,reject)=>{
  const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}`))},15000);
  pending.set(id,{resolve,reject,timer});
  socket.send(JSON.stringify({id,method,params,...(session?{sessionId:session}:{})}));
 });
}
async function evaluate(expression){
 const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value;
}
const frame=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
async function waitFor(expression){
 const deadline=Date.now()+10000;
 while(!await evaluate(expression)){
  assert(Date.now()<deadline,`Timed out: ${expression}`);
  await new Promise(resolve=>setTimeout(resolve,25));
 }
}
async function viewport(width=390,height=844,mobile=true){
 device={width,height,deviceScaleFactor:mobile?3:1,mobile};
 await send('Emulation.setDeviceMetricsOverride',device);
 await send('Emulation.setVisibleSize',{width,height});
 await send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:5});
 await frame();
}
async function load(query='?at=41.895'){
 // Isolate document and native input state between scenarios.
 if(testTarget)await send('Target.closeTarget',{targetId:testTarget},null);
 ({targetId:testTarget}=await send('Target.createTarget',{url:'about:blank'},null));
 ({sessionId}=await send('Target.attachToTarget',{targetId:testTarget,flatten:true},null));
 const {windowId}=await send('Browser.getWindowForTarget',{targetId:testTarget},null);
 // Native gesture hit testing uses the host window as well as emulated metrics.
 await send('Browser.setWindowBounds',{windowId,bounds:{width:1600,height:1200}},null);
 await send('Runtime.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',device);
 await send('Emulation.setVisibleSize',{width:device.width,height:device.height});
 await send('Emulation.setTouchEmulationEnabled',{enabled:device.mobile,maxTouchPoints:5});
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await send('Page.navigate',{url:base+'/'+query});
 await waitFor("document.querySelector('#atlas')?.dataset.ready==='true'");
 await send('Page.bringToFront');
 await frame();
 await evaluate(`window.touchLog=[];document.addEventListener('pointerdown',e=>touchLog.push({id:e.pointerId,trusted:e.isTrusted,type:e.pointerType,target:e.target.tagName+'#'+e.target.id+'.'+e.target.className}),true);window.pointerTrace=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])document.addEventListener(type,e=>pointerTrace.push({type,id:e.pointerId,x:e.clientX,y:e.clientY}),true)`);
}
const snapshot=()=>evaluate(`(()=>{
 const canvas=document.querySelector('#map-canvas'),m=new DOMMatrix(getComputedStyle(canvas).transform),card=document.querySelector('#place-card');
 return {scale:m.a,x:m.e,top:canvas.getBoundingClientRect().top,scrollY,zoom:Number(document.querySelector('#zoom-level').textContent.replace('×','')),pageScale:visualViewport.scale,cardOpen:card.open,card:card.getBoundingClientRect().toJSON(),header:document.querySelector('.site-header').getBoundingClientRect().toJSON(),dragging:document.querySelector('#atlas').classList.contains('dragging')};
})()`);
async function selectedVisible(id){
 return evaluate(`(()=>{const d=document.querySelector(${JSON.stringify(id?`[data-place="${id}"] .marker-dot`:'.map-marker.selected .marker-dot')})?.getBoundingClientRect(),card=document.querySelector('#place-card'),c=card.getBoundingClientRect(),v=visualViewport,h=document.querySelector('.site-header').getBoundingClientRect();return !!d&&d.left>=v.offsetLeft&&d.right<=v.offsetLeft+v.width&&d.top>=Math.max(v.offsetTop,h.bottom)&&d.bottom<=v.offsetTop+v.height&&(!card.open||!(d.right>c.left&&d.left<c.right&&d.bottom>c.top&&d.top<c.bottom))})()`);
}
const near=(actual,expected,message,tolerance=1.5)=>assert(Math.abs(actual-expected)<=tolerance,`${message}: ${actual} vs ${expected}`);
const mapPoint=(view,p)=>({x:(p.x-view.x)/view.scale,y:(p.y-view.top)/view.scale});
function anchored(view,map,p){near(view.x+map.x*view.scale,p.x,'Pinch midpoint X');near(view.top+map.y*view.scale,p.y,'Pinch midpoint Y')}
const finger=(id,x,y)=>({id,x,y,radiusX:2,radiusY:2,force:1});
const contacts=new Map();
async function touch(type,points){
 await send('Input.dispatchTouchEvent',{type,touchPoints:points});
 if(type==='touchCancel'||(type==='touchEnd'&&!points.length))contacts.clear();
 else for(const point of points){if(type==='touchEnd')contacts.delete(point.id);else contacts.set(point.id,point)}
 await frame();
}
const start=(points)=>touch('touchStart',points);
const move=(points)=>touch('touchMove',points);
// For a partial release Chromium expects the lifted contacts, not the survivors.
const end=(remaining=[])=>touch('touchEnd',remaining.length?[...contacts.values()].filter(point=>!remaining.some(other=>other.id===point.id)):[]);
// Browser zoom changes layout coordinates beneath fixed physical fingers.
async function pageTouch(type,points){
 const v=await evaluate('({x:visualViewport.offsetLeft,y:visualViewport.offsetTop,scale:visualViewport.scale})');
 await touch(type,points.map(p=>({...p,x:v.x+p.x/v.scale,y:v.y+p.y/v.scale})));
}
async function nativePinch(from,to){
 const x=device.width/2,y=300;
 await pageTouch('touchStart',[finger(1,x-from/2,y),finger(2,x+from/2,y)]);
 for(let step=1;step<=10;step++){
  const gap=from+(to-from)*step/10;
  await pageTouch('touchMove',[finger(1,x-gap/2,y),finger(2,x+gap/2,y)]);
 }
 await pageTouch('touchEnd',[]);await frame();
}

async function tap(x,y){await start([finger(1,x,y)]);await end()}
async function click(selector){
 const {x,y}=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});await frame();
 // Zoom controls animate unless reduced motion is requested; measure the settled view.
 await waitFor("!document.querySelector('#atlas').dataset.zooming");
}
async function check(name,run){await run();report.push(name);console.log(`PASS: ${name}`)}
async function fullScreenDetails(){
 const view=await snapshot();
 assert(view.cardOpen,'Details are open');
 assert(await evaluate("document.querySelector('#place-card').matches(':modal')"),'Mobile details use a native modal');
 near(view.card.left,0,'Details cover the left edge');near(view.card.top,0,'Details cover the header');
 near(view.card.width,device.width,'Details fill the screen width');near(view.card.height,device.height,'Details fill the screen height');
 assert(await evaluate("(()=>{const c=document.querySelector('#card-content');return !!document.querySelector('.card-scrollbar').getClientRects().length===(document.querySelector('#place-card').open&&c.scrollHeight>c.clientHeight+1)})()"),'Scrollbar appears only for open, overflowing details');
 assert(await evaluate("getComputedStyle(document.documentElement).overflowY==='hidden'"),'Background page scrolling is locked');
 return view;
}

async function dragAfterInterruption(){
 const before=await snapshot();
 await start([finger(9,140,280)]);await move([finger(9,165,250)]);await end();
 const after=await snapshot();near(after.x-before.x,25,'Fresh drag X');near(after.scrollY-before.scrollY,30,'Fresh drag Y');assert(!after.dragging);
}
try{
 browser('open',base);
 socket=new WebSocket(browser('get','cdp-url').cdpUrl);
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});
 socket.addEventListener('message',({data})=>{
  const event=JSON.parse(data);
  if(event.method==='Runtime.exceptionThrown')errors.push(event.params.exceptionDetails);
  const request=pending.get(event.id);if(!request)return;
  pending.delete(event.id);clearTimeout(request.timer);
  if(event.error)request.reject(new Error(JSON.stringify(event.error)));else request.resolve(event.result);
 });
 const targets=await send('Target.getTargets');
 const page=targets.targetInfos.find(target=>target.type==='page'&&target.url.startsWith(base));assert(page,'Preview tab exists');
 ({sessionId}=await send('Target.attachToTarget',{targetId:page.targetId,flatten:true}));
 await send('Runtime.enable');await send('Page.enable');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await viewport();

 await check('Mobile pinch scales only the map and preserves a moving midpoint',async()=>{
  await load();
  assert.notEqual(await evaluate("getComputedStyle(document.querySelector('.map-zoom')).display"),'none');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#atlas')).touchAction"),'none');
  const before=await snapshot(),map=mapPoint(before,{x:190,y:300});
  await start([finger(1,130,300),finger(2,250,300)]);
  await move([finger(1,100,315),finger(2,300,315)]);
  const after=await snapshot();near(after.scale/before.scale,200/120,'Map zoom ratio',.01);anchored(after,map,{x:200,y:315});
  near(after.pageScale,1,'Browser page remains unzoomed',.001);near(after.header.height,before.header.height,'Header stays same size',.01);
  await end();assert(!(await snapshot()).cardOpen,'Pinching cannot open a marker');
  assert(await evaluate('touchLog.length>=2 && touchLog.every(e=>e.trusted&&e.type==="touch")'),'Real browser touch events');
 });

 await check('A fresh tap selects the correct visible dot immediately after a pinch',async()=>{
  const target=await evaluate(`(()=>{for(const dot of document.querySelectorAll('.marker-dot')){const r=dot.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,id=dot.closest('[data-place]').dataset.place;if(x>25&&x<innerWidth-65&&y>100&&y<innerHeight-150&&document.elementFromPoint(x,y)?.closest('[data-place]')?.dataset.place===id)return {x,y,id}}})()`);
  assert(target,'At least one visible dot');await tap(target.x,target.y);
  assert.equal(await evaluate("document.querySelector('.map-marker.selected')?.dataset.place"),target.id);
  assert((await snapshot()).cardOpen);
 });

 await check('A first pinch can zoom out below the starting view without shrinking touch targets',async()=>{
  await load();
  const before=await snapshot(),map=mapPoint(before,{x:190,y:300});
  const dotSize=await evaluate("document.querySelector('.marker-dot').getBoundingClientRect().width");
  const targetSize=await evaluate("document.querySelector('.map-marker').getBoundingClientRect().width");
  await start([finger(1,70,300),finger(2,310,300)]);
  await move([finger(1,130,300),finger(2,250,300)]);await end();
  const after=await snapshot();near(after.zoom,.5,'Zoom out from initial view',.001);anchored(after,map,{x:190,y:300});
  near(await evaluate("document.querySelector('.marker-dot').getBoundingClientRect().width"),dotSize,'Dot stays readable',.01);
  near(await evaluate("document.querySelector('.map-marker').getBoundingClientRect().width"),targetSize,'Touch target keeps its size',.01);
  await dragAfterInterruption();
  const crowded=await evaluate(`(()=>{const dots=[...document.querySelectorAll('.marker-dot')].map(dot=>{const r=dot.getBoundingClientRect();return {id:dot.closest('[data-place]').dataset.place,x:r.x+r.width/2,y:r.y+r.height/2}}).filter(p=>p.x>25&&p.x<innerWidth-65&&p.y>100&&p.y<innerHeight-150);return dots.find(a=>dots.some(b=>{const d=Math.hypot(a.x-b.x,a.y-b.y);return a.id!==b.id&&d>4&&d<22}))})()`);
  assert(crowded,'Minimum zoom exposes nearby overlapping touch targets');await tap(crowded.x,crowded.y);
  assert.equal(await evaluate("document.querySelector('.map-marker.selected')?.dataset.place"),crowded.id,'Crowded dot opens the intended place');
  for(const id of ['navy-pier','cloud-gate','osterman-beach','south-shore-cultural-center']){
   await evaluate(`history.pushState(null,'','/?place=${id}');dispatchEvent(new PopStateEvent('popstate'))`);await frame();
   await fullScreenDetails();await click('.card-close');
   assert(await selectedVisible(id),`${id} is visible after closing its direct link at minimum zoom`);
  }
 });

 await check('Mobile details scroll natively and close without moving the background map',async()=>{
  await viewport(390,600);await load();const before=await snapshot();
  await evaluate("document.querySelector('[data-place=navy-pier]').click()");await frame();
  const opened=await fullScreenDetails();
  near(opened.x,before.x,'Opening keeps map X');near(opened.scrollY,before.scrollY,'Opening keeps map Y');
  await start([finger(1,200,510)]);
  for(const distance of [40,80,120,160])await move([finger(1,200,510-distance)]);
  await end();
  assert(await evaluate("document.querySelector('#card-content').scrollTop")>0,'Native swipe scrolls details');
  for(const edge of ['top','bottom']){
   await evaluate(`document.querySelector('#card-content').scrollTop=${edge==='top'?0:100000}`);await frame();
   const y=edge==='top'?180:510,direction=edge==='top'?1:-1;
   await start([finger(1,200,y)]);
   for(const distance of [30,60,90,120])await move([finger(1,200,y+direction*distance)]);
   await end();
   const after=await snapshot();near(after.scrollY,opened.scrollY,`${edge} keeps map Y`);near(after.x,opened.x,`${edge} keeps map X`);near(after.scale,opened.scale,'Reading keeps map scale',.001);
  }
  // Vertical reading gestures leave the close control available.
  const close=await evaluate("document.querySelector('.card-close').getBoundingClientRect().toJSON()");
  assert(close.top>=0&&close.bottom<=device.height,'Close remains on screen while reading');
  await tap(close.x+close.width/2,close.y+close.height/2);
  const closed=await snapshot();assert(!closed.cardOpen,'X closes details');
  near(closed.x,before.x,'Closing keeps map X');near(closed.scrollY,before.scrollY,'Closing keeps map Y');
  assert(await evaluate("getComputedStyle(document.documentElement).overflowY!=='hidden'"),'Closing restores page scrolling');
  await dragAfterInterruption();await viewport();
 });

 await check('Short, vertical, leftward, interrupted and multitouch handle gestures leave details open',async()=>{
  await load('?place=navy-pier');const before=await fullScreenDetails();
  const {x,y}=await evaluate("(()=>{const r=document.querySelector('.card-swipe-handle').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
  for(const [dx,dy] of [[24,0],[-15,0],[20,90]]){
   await start([finger(1,x,y)]);await move([finger(1,x+dx,y+dy)]);await end();
   assert((await snapshot()).cardOpen,`Gesture ${dx},${dy} does not dismiss details`);
  }
  await start([finger(1,x,y)]);await move([finger(1,x+90,y)]);await touch('touchCancel',[]);
  assert((await snapshot()).cardOpen,'Cancelled swipes do not dismiss details');
  await start([finger(1,x,y)]);await move([finger(1,x+20,y)]);
  await start([finger(1,x+20,y),finger(2,200,y)]);await end([finger(1,x+20,y)]);
  await move([finger(1,x+120,y)]);await end();
  const after=await snapshot();assert(after.cardOpen,'A second finger cancels dismissal even after it lifts');
  near(after.x,before.x,'Rejected gestures keep map X');near(after.scrollY,before.scrollY,'Rejected gestures keep map Y');near(after.scale,before.scale,'Rejected gestures keep map scale',.001);
 });

 await check('Southern direct links use full-screen details and reveal their location when closed',async()=>{
  await viewport(390,740);await load();
  await start([finger(1,70,300),finger(2,310,300)]);await move([finger(1,130,300),finger(2,250,300)]);await end();
  for(const id of ['south-shore-cultural-center','71st-street-trailhead']){
   await evaluate(`history.pushState(null,'','/?place=${id}');dispatchEvent(new PopStateEvent('popstate'))`);await frame();
   await fullScreenDetails();await click('.card-close');
   assert(await selectedVisible(id),`${id} is visible after closing its direct link`);
  }
  await viewport();
 });

 await check('Lifting one finger continues as a drag without a jump or accidental selection',async()=>{
  await load();await start([finger(1,120,300),finger(2,240,300)]);
  await move([finger(1,90,300),finger(2,270,300)]);
  const beforeLift=await snapshot();await end([finger(2,270,300)]);
  const afterLift=await snapshot();near(afterLift.x,beforeLift.x,'Finger lift X');near(afterLift.scrollY,beforeLift.scrollY,'Finger lift Y');
  await move([finger(2,290,275)]);await end();
  const dragged=await snapshot();near(dragged.x-afterLift.x,20,`Remaining finger drag X ${JSON.stringify(await evaluate('pointerTrace'))}`);near(dragged.scrollY-afterLift.scrollY,25,'Remaining finger drag Y');assert(!dragged.cardOpen&&!dragged.dragging);
 });

 await check('Third finger is stable and replacing a pinch finger rebases the gesture',async()=>{
  await load();await start([finger(1,100,300),finger(2,220,300)]);await move([finger(1,80,300),finger(2,240,300)]);
  const before=await snapshot();await start([finger(1,80,300),finger(2,240,300),finger(3,180,380)]);
  await move([finger(1,80,300),finger(2,240,300),finger(3,190,400)]);
  const third=await snapshot();near(third.scale,before.scale,'Third finger does not zoom',.001);near(third.x,before.x,'Third finger does not pan');
  await end([finger(2,240,300),finger(3,190,400)]);
  const replaced=await snapshot();near(replaced.scale,third.scale,'Replacement scale',.001);near(replaced.scrollY,third.scrollY,'Replacement position');
  await move([finger(2,250,280),finger(3,180,420)]);assert((await snapshot()).scale>replaced.scale,'New pair zooms');
  await end();assert(!(await snapshot()).dragging);
 });

 await check('Zoom limits are finite and reversing at a limit responds immediately',async()=>{
  await load();await start([finger(1,180,300),finger(2,200,300)]);await move([finger(1,40,300),finger(2,340,300)]);
  near((await snapshot()).zoom,4,'Maximum zoom',.001);
  await move([finger(1,55,300),finger(2,325,300)]);assert((await snapshot()).zoom<4,'Reverse out of maximum');
  await move([finger(1,183,300),finger(2,197,300)]);near((await snapshot()).zoom,.5,'Minimum zoom',.001);
  await move([finger(1,180,300),finger(2,200,300)]);assert((await snapshot()).zoom>.5,'Reverse out of minimum');await end();
  await start([finger(1,190,300),finger(2,191,300)]);await move([finger(1,190,300),finger(2,192,300)]);await end();
  const view=await snapshot();assert(Number.isFinite(view.scale)&&Number.isFinite(view.x)&&view.zoom>=.5&&view.zoom<=4);
 });

 for(const interruption of ['cancel','blur','lost capture'])await check(`${interruption} cleans up the pinch and permits a fresh drag`,async()=>{
  await load();await start([finger(1,120,300),finger(2,240,300)]);await move([finger(1,90,300),finger(2,270,300)]);
  if(interruption==='cancel')await touch('touchCancel',[]);
  else{
   if(interruption==='blur')await evaluate("dispatchEvent(new Event('blur'))");
   else{await evaluate("document.querySelector('#atlas').releasePointerCapture(touchLog[0].id)");await move([finger(1,89,300),finger(2,271,300)])}
   await end();
  }
  assert(!(await snapshot()).dragging);await dragAfterInterruption();
 });

 await check('Height-only resizes preserve scroll, pan, zoom, and selection',async()=>{
  await load('?place=navy-pier');const before=await snapshot();
  await viewport(390,740);const after=await snapshot();
  near(after.scrollY,before.scrollY,'Toolbar resize scroll');near(after.x,before.x,'Toolbar resize pan');near(after.scale,before.scale,'Toolbar resize zoom',.001);assert(after.cardOpen);
  await viewport();
 });

 await check('Width changes safely terminate a gesture and keep the map usable',async()=>{
  await load();await start([finger(1,120,300),finger(2,240,300)]);await move([finger(1,90,300),finger(2,270,300)]);
  const before=await snapshot();await viewport(430,932);await end();
  const after=await snapshot();near(after.zoom,before.zoom,'Width resize keeps zoom',.001);assert(!after.dragging);await dragAfterInterruption();await viewport();
 });

 await check('Mobile details retain a reachable close control after a height resize',async()=>{
  await load('?place=navy-pier');await viewport(390,390);
  await new Promise(resolve=>setTimeout(resolve,200));await frame();await fullScreenDetails();
  const close=await evaluate("document.querySelector('.card-close').getBoundingClientRect().toJSON()");
  assert(close.top>=0&&close.bottom<=390,'Close stays within the shorter screen');
  await tap(close.x+close.width/2,close.y+close.height/2);assert(!(await snapshot()).cardOpen);await viewport();
 });

 await check('Native pinch magnifies full-screen details without reflowing them or zooming the map',async()=>{
  await load('?place=navy-pier');const before=await fullScreenDetails();
  const textWidth=await evaluate("document.querySelector('.card-description').getBoundingClientRect().width");
  await nativePinch(120,240);
  const magnified=await snapshot();assert(magnified.pageScale>1.1,'Trusted pinch activates browser zoom');
  near(magnified.card.width,before.card.width,'Native zoom keeps the layout width');
  near(magnified.card.height,before.card.height,'Native zoom keeps the layout height');
  near(await evaluate("document.querySelector('.card-description').getBoundingClientRect().width"),textWidth,'Text does not reflow during pinch');
  near(magnified.scale,before.scale,'Pinch does not zoom the map',.001);near(magnified.x,before.x,'Pinch keeps map X');near(magnified.scrollY,before.scrollY,'Pinch keeps map Y');
  const panStart=await evaluate('visualViewport.offsetLeft');
  await pageTouch('touchStart',[finger(1,260,300)]);
  for(const distance of [20,40,60])await pageTouch('touchMove',[finger(1,260-distance,300)]);
  await pageTouch('touchEnd',[]);
  assert(await evaluate('visualViewport.offsetLeft')>panStart+5,'Magnified details pan horizontally with a native gesture');
  await pageTouch('touchStart',[finger(1,100,300)]);
  for(const distance of [30,60,90])await pageTouch('touchMove',[finger(1,100+distance,300)]);
  await pageTouch('touchEnd',[]);
  assert((await snapshot()).cardOpen,'Rightward panning while magnified leaves details open');
  await evaluate("document.querySelector('#card-content').scrollTop=100000");await frame();
  const panTop=await evaluate('visualViewport.offsetTop');
  await pageTouch('touchStart',[finger(1,200,550)]);
  for(const distance of [25,50,75,100])await pageTouch('touchMove',[finger(1,200,550-distance)]);
  await pageTouch('touchEnd',[]);
  assert(await evaluate('visualViewport.offsetTop')>panTop+5,'Magnified details pan vertically beyond the content scroll boundary');
  const panned=await snapshot();near(panned.x,before.x,'Native panning keeps map X');near(panned.scrollY,before.scrollY,'Native panning keeps map Y');near(panned.scale,before.scale,'Native panning keeps map scale',.001);
  await nativePinch(240,45);
  near((await snapshot()).pageScale,1,'Native pinch back out restores normal page scale',.01);
  const close=await evaluate("document.querySelector('.card-close').getBoundingClientRect().toJSON()");
  assert(close.left>=0&&close.right<=device.width&&close.top>=0&&close.bottom<=device.height,'X is reachable after browser zoom-out');
  await tap(close.x+close.width/2,close.y+close.height/2);
  const after=await snapshot();assert(!after.cardOpen);near(after.x,before.x,'Zoom and close preserve map X');near(after.scrollY,before.scrollY,'Zoom and close preserve map Y');
 });

 await check('Touching the map stops the animated introduction jump before pinching',async()=>{
  await load('');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await evaluate("document.querySelector('#begin').click()");
  await frame();const moving=await snapshot();
  await frame();assert((await snapshot()).scrollY>moving.scrollY,'Selection starts an animated jump');
  await start([finger(1,130,260),finger(2,250,260)]);
  const held=await snapshot(),map=mapPoint(held,{x:190,y:260});
  await new Promise(resolve=>setTimeout(resolve,180));await frame();
  near((await snapshot()).scrollY,held.scrollY,'Touch stops the ongoing jump');
  await move([finger(1,110,260),finger(2,270,260)]);anchored(await snapshot(),map,{x:190,y:260});await end();
 });

 await check('Browser zoom with a panned viewport preserves map pinch coordinates',async()=>{
  await load();await send('Emulation.setPageScaleFactor',{pageScaleFactor:1.5});
  await new Promise(resolve=>setTimeout(resolve,200));await frame();
  // Start on the header so the browser handles the page pan, outside the atlas.
  const headerPoint=await evaluate(`(()=>{const h=document.querySelector('.site-header').getBoundingClientRect(),v=visualViewport;return {x:v.offsetLeft+v.width*.75,y:Math.max(h.top,v.offsetTop)+Math.min(h.height,v.height)/2}})()`);
  assert(await evaluate(`!!document.elementFromPoint(${headerPoint.x},${headerPoint.y})?.closest('.site-header')`),'Page-pan gesture starts inside the header');
  await start([finger(1,headerPoint.x,headerPoint.y)]);
  for(const distance of [20,40,60])await move([finger(1,headerPoint.x-distance,headerPoint.y)]);
  await end();
  assert(await evaluate('visualViewport.offsetLeft>0'),`Browser viewport actually panned: ${JSON.stringify(await evaluate('({left:visualViewport.offsetLeft,top:visualViewport.offsetTop,trace:pointerTrace,log:touchLog})'))}`);
  const before=await snapshot();await evaluate('pointerTrace=[]');
  await start([finger(1,130,250),finger(2,250,250)]);
  const midpoint=async type=>evaluate(`(()=>{const points=pointerTrace.filter(e=>e.type==='${type}').slice(-2);return {x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2}})()`);
  const map=mapPoint(before,await midpoint('pointerdown'));
  await move([finger(1,90,260),finger(2,290,260)]);
  anchored(await snapshot(),map,await midpoint('pointermove'));await end();
  await send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await frame();
 });

 await check('Direct-link locations remain visible after closing details at maximum map zoom',async()=>{
  for(const [width,height] of [[320,740],[430,932]]){
   await viewport(width,height);await load();
   await start([finger(1,width/2-10,300),finger(2,width/2+10,300)]);
   await move([finger(1,30,300),finger(2,width-30,300)]);await end();near((await snapshot()).zoom,4,'Maximum map zoom',.001);
   for(const id of ['navy-pier','cloud-gate','osterman-beach','south-shore-cultural-center']){
    await evaluate(`history.pushState(null,'','/?place=${id}');dispatchEvent(new PopStateEvent('popstate'))`);await frame();
    await fullScreenDetails();await click('.card-close');
    assert(await selectedVisible(id),`${id} is visible at ${width}px and 4x after closing`);
   }
  }
  await viewport();
 });

 await check('A delayed final finger lift cannot select a place accidentally',async()=>{
  await load('?place=navy-pier');await evaluate("document.querySelector('#place-card').close()");await frame();
  await start([finger(1,170,260),finger(2,220,260)]);await end([finger(2,220,260)]);
  await new Promise(resolve=>setTimeout(resolve,450));await end();assert(!(await snapshot()).cardOpen);assert(!(await snapshot()).dragging);
 });

 await check('Landscape touch devices support zoom buttons and pinch zoom',async()=>{
  await viewport(844,390);await load();
  assert.notEqual(await evaluate("getComputedStyle(document.querySelector('.map-zoom')).display"),'none');
  const before=await snapshot();await start([finger(1,320,200),finger(2,440,200)]);await move([finger(1,290,200),finger(2,470,200)]);await end();
  near((await snapshot()).scale/before.scale,1.5,'Landscape pinch ratio',.01);await viewport();
 });

 await check('Pinches at the northern and southern bounds remain finite and recover',async()=>{
  for(const query of ['', '?at=41.7669']){
   await load(query);if(!query){await evaluate("scrollTo({top:0,behavior:'instant'})");await frame()}
   await start([finger(1,100,450),finger(2,240,450)]);await move([finger(1,60,450),finger(2,280,450)]);await end();
   const view=await snapshot();assert(view.scrollY>=0&&Number.isFinite(view.x)&&Number.isFinite(view.scale)&&view.pageScale===1);assert(!view.dragging);
  }
 });

 await check('Desktop retains +/− controls and zoom preserves the map center',async()=>{
  await viewport(1440,1000,false);await load();
  assert.notEqual(await evaluate("getComputedStyle(document.querySelector('.map-zoom')).display"),'none');
  const before=await snapshot(),point=await evaluate('({x:visualViewport.width*.62,y:visualViewport.height*.44})'),map=mapPoint(before,point);
  await click('#zoom-in');const after=await snapshot();near(after.zoom,1.5,'Desktop zoom',.001);anchored(after,map,point);
  await click('#zoom-out');near((await snapshot()).zoom,1,'Desktop zoom out',.001);
  assert(!await evaluate("document.querySelector('#zoom-out').disabled"),'Can zoom out beyond the starting view');
  await click('#zoom-out');near((await snapshot()).zoom,.5,'Desktop minimum zoom',.001);anchored(await snapshot(),map,point);
  assert(await evaluate("document.querySelector('#zoom-out').disabled"),'Minimum disables zoom out');
  for(let i=0;i<7;i++)await click('#zoom-in');
  near((await snapshot()).zoom,4,'Desktop maximum zoom',.001);anchored(await snapshot(),map,point);
  assert(await evaluate("document.querySelector('#zoom-in').disabled"),'Maximum disables zoom in');
  await click('#zoom-out');near((await snapshot()).zoom,3.5,'Desktop can leave maximum zoom',.001);
 });

 await check('Zooming out on a wide display centers the map when its full width fits',async()=>{
  await viewport(3200,1000,false);await load();
  await evaluate("document.querySelector('#zoom-out').click()");await frame();
  const geometry=await evaluate("({view:innerWidth,map:document.querySelector('#map-canvas').getBoundingClientRect().toJSON()})");
  assert(geometry.map.width<geometry.view,'Map actually fits within the viewport');
  near(geometry.map.left,(geometry.view-geometry.map.width)/2,'Map centered horizontally');
  await evaluate("document.querySelector('#zoom-in').click()");await frame();near((await snapshot()).zoom,1,'Can return to the initial scale',.001);
 });

 await check('Place panels contain wheel and keyboard scrolling at every edge and keep their heading visible',async()=>{
  const wheel=async(x,y,deltaY)=>{
   await send('Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaY,deltaX:0});
   await new Promise(resolve=>setTimeout(resolve,100));await frame();
  };
  const key=async(key,windowsVirtualKeyCode)=>{
   await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key,windowsVirtualKeyCode});
   await send('Input.dispatchKeyEvent',{type:'keyUp',key,windowsVirtualKeyCode});
   await new Promise(resolve=>setTimeout(resolve,100));await frame();
  };
  let checkedOverflow=false,checkedShortEntry=false;
  for(const [width,height] of [[1440,1000],[1024,500],[800,600],[390,844],[320,740]]){
   await viewport(width,height,false);await load('?place=montrose-beach-dunes');
   await evaluate('document.fonts.ready');await frame();
   const before=await snapshot();if(width>700)assert(await selectedVisible(),'Selected place clears the desktop panel');else await fullScreenDetails();
   assert(before.header.height<=64,'Header stays compact');
   if(width>700)assert(before.card.top>=before.header.bottom&&before.card.bottom<=height,'Desktop panel fits below the header');
   if(width>700){near(before.card.top,before.header.bottom,'Panel meets header');near(before.card.bottom,height,'Panel reaches viewport bottom')}
   const geometry=await evaluate(`(()=>{const c=document.querySelector('#card-content'),h=document.querySelector('.card-heading').getBoundingClientRect(),b=document.querySelector('.card-close').getBoundingClientRect();return {overflow:c.scrollHeight-c.clientHeight>1,range:c.scrollHeight-c.clientHeight,headingTop:h.top,closeX:b.x+b.width/2,closeY:b.y+b.height/2}})()`);
   checkedOverflow||=geometry.overflow;checkedShortEntry||=!geometry.overflow;
   await wheel(geometry.closeX,geometry.closeY,150);
   if(geometry.overflow)assert(await evaluate("document.querySelector('#card-content').scrollTop>0"),`${width}×${height}: wheel over close button scrolls details (range ${geometry.range}px)`);
   else assert.equal(await evaluate("document.querySelector('#card-content').scrollTop"),0,'Short entry remains still');
   for(const edge of ['top','bottom']){
    await evaluate(`document.querySelector('#card-content').scrollTop=${edge==='top'?0:100000}`);await frame();
    const direction=edge==='top'?-1:1;
    await wheel(geometry.closeX,geometry.closeY,direction*350);
    await wheel(before.card.left+30,before.card.bottom-30,direction*350);
    await evaluate("document.querySelector('#card-content').focus({preventScroll:true})");
    await key(edge==='top'?'PageUp':'PageDown',edge==='top'?33:34);
    const after=await snapshot();near(after.scrollY,before.scrollY,`${width}px: ${edge} keeps map Y`);near(after.x,before.x,`${width}px: ${edge} keeps map X`);near(after.scale,before.scale,'Details do not zoom map',.001);
    near(await evaluate("document.querySelector('.card-heading').getBoundingClientRect().top"),geometry.headingTop,'Title and close stay visible');
   }
   await evaluate("document.querySelector('#card-content').scrollTop=0");
   await key('PageDown',34);
   if(geometry.overflow)assert(await evaluate("document.querySelector('#card-content').scrollTop>0"),`${width}×${height}: keyboard scrolls details (range ${geometry.range}px)`);
   near((await snapshot()).scrollY,before.scrollY,'Keyboard reading keeps map Y');
   await wheel(100,Math.min(300,height/2),150);
   if(width>700)assert((await snapshot()).scrollY>before.scrollY,'Wheel outside desktop panel still explores the map');
   else near((await snapshot()).scrollY,before.scrollY,'Full-screen details keep the map locked');
   const reading=await snapshot();await key('Escape',27);
   assert(!(await snapshot()).cardOpen,'Escape closes the panel');near((await snapshot()).scrollY,reading.scrollY,'Close preserves map position');
  }
  assert(checkedOverflow&&checkedShortEntry,'Checked both scrollable and short entries');
 });

 await check('Touch zoom controls work on the map and are blocked behind full-screen details',async()=>{
  for(const [width,height] of [[320,740],[390,844],[667,375],[844,390]]){
   await viewport(width,height);await load();
   const button=await evaluate("document.querySelector('#zoom-in').getBoundingClientRect().toJSON()");
   assert(button.width>=44&&button.height>=44,'Zoom target is at least 44px');
   const point={x:button.x+button.width/2,y:button.y+button.height/2};
   assert.equal(await evaluate(`document.elementFromPoint(${point.x},${point.y})?.id`),'zoom-in','Zoom button is unobscured on the map');
   const before=await snapshot();await tap(point.x,point.y);near((await snapshot()).zoom,before.zoom+.5,'Single-finger zoom',.01);
   await evaluate("document.querySelector('[data-place=navy-pier]').click()");await frame();await fullScreenDetails();
   assert(await evaluate(`!!document.elementFromPoint(${point.x},${point.y})?.closest('#place-card')`),'Details cover the background zoom button');
   const opened=await snapshot();await tap(point.x,point.y);near((await snapshot()).zoom,opened.zoom,'Touching covered controls cannot zoom the map',.01);
  }
 });

 await check('Native full-screen swipes stay in details at both scroll boundaries',async()=>{
  await viewport(390,600);await load('?place=navy-pier');
  assert(await evaluate("document.querySelector('#card-content').scrollHeight-document.querySelector('#card-content').clientHeight")>20,'The short viewport has scrollable content');
  const before=await snapshot(),x=before.card.left+45,y=before.card.bottom-35;
  for(const edge of ['middle','top','bottom']){
   await evaluate(`document.querySelector('#card-content').scrollTop=${edge==='top'?0:edge==='bottom'?100000:20}`);await frame();
   const initial=await evaluate("document.querySelector('#card-content').scrollTop");
   await start([finger(1,x,edge==='top'?before.card.top+100:y)]);
   for(let step=1;step<=10;step++)await move([finger(1,x,edge==='top'?before.card.top+100+step*10:y-step*35)]);
   await end();await new Promise(resolve=>setTimeout(resolve,350));
   near((await snapshot()).scrollY,before.scrollY,`${edge}: card swipe preserves map Y`);
   near((await snapshot()).x,before.x,`${edge}: card swipe preserves map X`);
   if(edge==='middle')assert(await evaluate("document.querySelector('#card-content').scrollTop")>initial,'Native swipe scrolls the details');
   assert(!(await snapshot()).dragging,'Card swipe does not start a map drag');
  }
 });

 await check('A map drag ending over a zoom button does not activate it',async()=>{
  await viewport();await load();
  const before=await snapshot(),button=await evaluate("document.querySelector('#zoom-in').getBoundingClientRect().toJSON()");
  await start([finger(1,button.x-60,button.y-70)]);await move([finger(1,button.x+button.width/2,button.y+button.height/2)]);await end();
  near((await snapshot()).zoom,before.zoom,'Ending a drag on + cannot activate zoom',.001);
  assert(!(await snapshot()).cardOpen&&!((await snapshot()).dragging),'Drag finishes without selecting a discovery');
 });

 await check('One-finger dragging reverses immediately at either document bound',async()=>{
  await viewport();
  for(const south of [false,true]){
   await load(south?'?at=41.7669':'');
   await evaluate(`scrollTo({top:${south?'document.documentElement.scrollHeight':0},behavior:'instant'})`);await frame();
   const before=await snapshot(),y=south?200:450,direction=south?-1:1;
   await start([finger(1,150,y)]);await move([finger(1,150,y+direction*80)]);
   near((await snapshot()).scrollY,before.scrollY,'Drag clamps at document bound');
   await move([finger(1,150,y+direction*50)]);await end();
   near((await snapshot()).scrollY,before.scrollY+direction*30,'Reversal responds without a dead zone');
  }
 });

 await check('Large moving pinches keep entering markers readable and restore every target on cancellation',async()=>{
  await viewport();await load();await click('#zoom-out');
  await start([finger(1,175,300),finger(2,215,300)]);
  for(const y of [300,170,420]){
   await move([finger(1,20,y),finger(2,370,y)]);
   const incorrect=await evaluate(`(()=>{return [...document.querySelectorAll('.map-marker')].filter(el=>{const r=el.getBoundingClientRect(),label=el.querySelector('.marker-label'),l=label.getBoundingClientRect(),visible=b=>b.left<innerWidth&&b.right>0&&b.top<innerHeight&&b.bottom>50;return (visible(r)||(getComputedStyle(label).visibility==='visible'&&visible(l)))&&Math.abs(r.width-44)>.1}).map(el=>el.dataset.place)})()`);
   assert.deepEqual(incorrect,[],'Every entering marker has its fixed-size target and label');
  }
  await touch('touchCancel',[]);
  assert(await evaluate("[...document.querySelectorAll('.map-marker')].every(el=>Math.abs(el.getBoundingClientRect().width-44)<.1)"),'Cancellation restores all 185 targets, including offscreen markers');
  await dragAfterInterruption();
 });

 await check('The desktop scrollbar remains draggable without moving the map',async()=>{
  await viewport(1440,650,false);await load('?place=navy-pier');
  const before=await snapshot(),thumb=await evaluate("document.querySelector('.card-scrollbar-thumb').getBoundingClientRect().toJSON()");
  const x=thumb.x+thumb.width/2,y=thumb.y+thumb.height/2;
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y:y+90,buttons:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y:y+90,button:'left',clickCount:1});await frame();
  assert(await evaluate("document.querySelector('#card-content').scrollTop")>100,'Mouse dragging the thumb scrolls details');
  near((await snapshot()).scrollY,before.scrollY,'Scrollbar keeps map Y');near((await snapshot()).x,before.x,'Scrollbar keeps map X');
  assert(!await evaluate("document.querySelector('.card-scrollbar').hidden"),'Desktop overflow scrollbar remains visible');
 });

 assert.deepEqual(errors,[],'No uncaught browser errors');
 console.log(`PASS: ${report.length} zoom regression scenarios; trusted Chromium touch input. Real iOS verification still required.`);
}finally{
 if(testTarget&&socket?.readyState===WebSocket.OPEN)await send('Target.closeTarget',{targetId:testTarget},null);
 for(const request of pending.values()){clearTimeout(request.timer);request.reject(new Error('Browser test ended'))}
 pending.clear();socket?.close();browser('close');
}
