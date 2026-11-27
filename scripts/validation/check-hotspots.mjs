const base=process.env.LAKEFRONT_TEST_URL||'http://127.0.0.1:4179';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
fs.mkdirSync('.cache/reports',{recursive:true});
const session='lakefront-hotspots';
const places=JSON.parse(fs.readFileSync('data/places/places.json'));
const b=(...args)=>{const r=JSON.parse(execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:60000}));assert(r.success,JSON.stringify(r));return r.data};
const ev=code=>b('eval',code).result;
const reports=[];
try{
 b('set','media','light','reduced-motion');
 for(const [w,h] of [[1440,1000],[390,844],[320,740]])for(const zoom of [.5,4]){
  b('set','viewport',String(w),String(h));b('open',base+'/');b('wait','--fn',"document.querySelector('#atlas')?.dataset.ready==='true'");
  // Gesture input is covered separately by check-map-zoom.mjs. Set the zoom
  // through the same handler here to audit every discovery at both extremes.
  ev(`for(let i=0;i<${Math.abs(zoom-1)/.5};i++)document.querySelector('#zoom-${zoom<1?'out':'in'}').click()`);
  assert.equal(ev("Number(document.querySelector('#zoom-level').textContent.replace('×',''))"),zoom,'Requested zoom reached');
  const records=[];
  // Small batches keep each browser evaluation responsive on slow machines.
  for(let start=0;start<places.length;start+=15){
   const batch=places.slice(start,start+15).map(p=>({id:p.id,name:p.name}));
   records.push(...ev(`(async()=>{const places=${JSON.stringify(batch)},records=[],frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))),push=history.pushState,replace=history.replaceState;history.pushState=()=>{};history.replaceState=()=>{};try{for(const p of places){push.call(history,null,'','/?place='+p.id);dispatchEvent(new PopStateEvent('popstate'));await frame();const fullScreen=matchMedia('(max-width:700px), (hover:none) and (pointer:coarse)').matches;if(fullScreen){document.querySelector('.card-close').click();await frame()}const dot=document.querySelector('[data-place="'+p.id+'"] .marker-dot'),d=dot.getBoundingClientRect(),c=document.querySelector('#place-card').getBoundingClientRect();const v=visualViewport,header=document.querySelector('.site-header').getBoundingClientRect(),visible=d.left>=v.offsetLeft&&d.right<=v.offsetLeft+v.width&&d.top>=Math.max(v.offsetTop,header.bottom)&&d.bottom<=v.offsetTop+v.height,coveredByCard=!fullScreen&&d.right>c.left&&d.left<c.right&&d.bottom>c.top&&d.top<c.bottom;if(!fullScreen){document.querySelector('.card-close').click();await frame()}const r=dot.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,target=document.elementFromPoint(x,y);target?.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse',isPrimary:true,clientX:x,clientY:y}));await frame();document.elementFromPoint(x,y)?.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1,clientX:x,clientY:y}));const filtersClosed=document.querySelector('#filters').hidden,openedCorrectPlace=document.querySelector('#place-card').open&&document.querySelector('#card-title').textContent===p.name;document.querySelector('.card-close').click();await frame();const focusReturned=document.activeElement?.dataset.place===p.id;records.push({id:p.id,visible,coveredByCard,openedCorrectPlace,filtersClosed,focusReturned})}return records}finally{history.pushState=push;history.replaceState=replace}})()`));
  }
  const failures=records.filter(p=>!p.visible||p.coveredByCard||!p.openedCorrectPlace||!p.filtersClosed||!p.focusReturned);
  console.log(JSON.stringify({viewport:[w,h],zoom,checked:records.length,failures}));
  reports.push({viewport:`${w}x${h}`,zoom,checked:records.length,failures});
  assert.deepEqual(failures,[],'Every exact dot center must open its own discovery when the map is available');
 }
 fs.writeFileSync('.cache/reports/hotspot-interaction-audit.json',JSON.stringify({reviewedAt:new Date().toISOString().slice(0,10),method:'Open each discovery by link at 0.5× and 4× map zoom. Verify its dot beside desktop details or after closing full-screen details, then dispatch a coordinate-based hover and pointer click through the actual element under the dot. Includes overlapping hit targets at all three viewport sizes. Native touch gestures are checked separately by check-map-zoom.mjs.',reports},null,2)+'\n');
}finally{b('close')}
