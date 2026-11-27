const base=process.env.LAKEFRONT_TEST_URL||'http://127.0.0.1:4179';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('.cache/reports',{recursive:true});
const session='lakefront-interactions',report=[];
function b(...args){const r=JSON.parse(execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:60000}));assert(r.success,JSON.stringify(r));return r.data}
const ev=code=>b('eval',code).result;
const ready=()=>b('wait','--fn',"document.querySelector('#atlas')?.dataset.ready==='true'");
const coords=()=>ev(`({scrollY,x:new DOMMatrix(getComputedStyle(document.querySelector('#map-canvas')).transform).m41})`);
try{
 b('set','media','light','reduced-motion');
 for(const [width,height] of [[1440,1000],[390,844],[320,740]]){
  b('set','viewport',String(width),String(height));b('open',base+'/?at=41.895');ready();
  assert(ev(`[...document.querySelectorAll('.marker-dot')].every(e=>!e.textContent.trim()&&getComputedStyle(e).width==='12px'&&getComputedStyle(e).height==='12px')`),'Every discovery uses the same dot');
  assert(ev(`!document.querySelector('#atlas .site-footer')`),'Footer must not cover map');
  const before=coords(),x=Math.round(width*.4),y=Math.round(height*.45);
  b('mouse','move',String(x),String(y));b('mouse','down');b('mouse','move',String(x+70),String(y-100));b('mouse','up');
  const after=coords();assert(Math.abs(after.scrollY-before.scrollY-100)<3,'Drag vertically');assert(Math.abs(after.x-before.x-70)<3,'Drag horizontally');assert(!ev(`document.querySelector('#place-card').open`),'Drag does not open a place');
  b('mouse','move','10','100');assert(Math.abs(coords().x-after.x)<1,'Pan position retained');
  ev(`history.pushState(null,'','/?place=navy-pier');dispatchEvent(new PopStateEvent('popstate'))`);
  b('wait','--fn',`document.querySelector('#place-card').open`);
  const fullScreen=ev(`matchMedia('(max-width:700px), (hover:none) and (pointer:coarse)').matches`);
  assert.equal(ev(`document.querySelector('#place-card').matches(':modal')`),fullScreen,'Only full-screen details make the map modal');
  assert(ev(`(()=>{const c=document.querySelector('#card-content');return !!document.querySelector('.card-scrollbar').getClientRects().length===(document.querySelector('#place-card').open&&c.scrollHeight>c.clientHeight+1)})()`),'Scrollbar appears only for open, overflowing details');
  const boxes=ev(`({dot:document.querySelector('[data-place="navy-pier"] .marker-dot').getBoundingClientRect().toJSON(),card:document.querySelector('#place-card').getBoundingClientRect().toJSON()})`);
  if(fullScreen){
   assert(Math.abs(boxes.card.left)<2&&Math.abs(boxes.card.top)<2&&Math.abs(boxes.card.width-width)<2&&Math.abs(boxes.card.height-height)<2,'Mobile details fill the screen');
   b('screenshot',`.cache/reports/lakefront-navy-${width}.png`);b('press','Escape');assert(!ev(`document.querySelector('#place-card').open`));
  }else assert(!(boxes.dot.right>boxes.card.left&&boxes.dot.left<boxes.card.right&&boxes.dot.bottom>boxes.card.top&&boxes.dot.top<boxes.card.bottom),'Desktop selected dot stays clear of the card');
  assert(ev(`(()=>{const d=document.querySelector('[data-place="navy-pier"] .marker-dot').getBoundingClientRect();return document.elementFromPoint(d.x+d.width/2,d.y+d.height/2)?.closest('[data-place]')?.dataset.place==='navy-pier'})()`),'Navy Pier dot receives clicks');
  assert(boxes.dot.left>=0&&boxes.dot.right<=width&&boxes.dot.top>70,'Navy Pier dot visible');
  const start=coords();b('mouse','move','80','220');b('mouse','down');b('mouse','move','110','180');b('mouse','up');assert(coords().scrollY>start.scrollY+35,fullScreen?'Map dragging resumes after closing mobile details':'Can drag map with desktop details open');
  if(!fullScreen){b('screenshot',`.cache/reports/lakefront-navy-${width}.png`);b('press','Escape');assert(!ev(`document.querySelector('#place-card').open`));}
  ev(`scrollTo({top:document.querySelector('#atlas').getBoundingClientRect().bottom+scrollY-innerHeight+100,behavior:'instant'})`);
  b('wait','--fn',`document.querySelector('#map-tools').inert`);
  assert(ev(`document.querySelector('.site-footer').getBoundingClientRect().top>=document.querySelector('#atlas').getBoundingClientRect().bottom`));
  b('screenshot',`.cache/reports/lakefront-south-${width}.png`);
  report.push({viewport:`${width}x${height}`,status:'pass',checks:['uniform unnumbered dots','shared footer below map','two-axis drag','pan retained','drag suppresses clicks',fullScreen?'full-screen modal details':'nonmodal desktop details','scrollbar follows content overflow','visible Navy Pier dot',fullScreen?'map dragging resumes after close':'drag with desktop details open','footer controls hidden']});
 }
 fs.writeFileSync('.cache/reports/map-interaction-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{b('close')}
