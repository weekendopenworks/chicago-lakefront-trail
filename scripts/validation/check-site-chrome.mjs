const base=process.env.LAKEFRONT_TEST_URL||'http://127.0.0.1:4179';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
fs.mkdirSync('.cache/reports',{recursive:true});
const session='lakefront-chrome',routes=process.argv.slice(2),reportPath='.cache/reports/site-chrome-verification.json';
const report=routes.length&&fs.existsSync(reportPath)?JSON.parse(fs.readFileSync(reportPath)).report.filter(r=>!routes.includes(r.route)):[];
function b(...args){const r=JSON.parse(execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:60000}));assert(r.success,JSON.stringify(r));return r.data}
const ev=code=>b('eval',code).result;
const ready=()=>b('wait','--fn',"document.readyState==='complete'&&(!document.querySelector('#atlas')||document.querySelector('#atlas')?.dataset.ready==='true')");
let footerMarkup;
try{
 b('set','media','light','reduced-motion');
 for(const [width,height] of [[1440,1000],[800,900],[390,844],[320,740]]){
  b('set','viewport',String(width),String(height));
  for(const route of routes.length?routes:['/','/places/','/places/promontory-point/','/credits/']){
   b('open',base+route);ready();
   const openingY=route==='/'?ev('scrollY'):null;
   const mobileControls=ev("matchMedia('(max-width:700px), (hover:none) and (pointer:coarse)').matches");
   if(route==='/')assert.equal(ev('document.querySelector(".overview").getClientRects().length>0'),!mobileControls,'Trail overview is desktop-only');
   assert(!ev('document.documentElement.scrollWidth>innerWidth'),'Page fits viewport');
   assert(!ev('document.querySelector(".map-end,.atlas-colophon")'),'Retired footer blocks removed');
   assert.deepEqual(ev('[...document.querySelectorAll(".desktop-nav a")].map(a=>a.textContent)'),['Explore the map','Explore the list']);
   assert(ev('document.querySelector(".brand svg")!==null'),'Consistent logo');
   const dimensions=ev('({header:document.querySelector(".site-header").getBoundingClientRect().toJSON(),title:document.querySelector("h1").getBoundingClientRect().toJSON(),footer:document.querySelector(".site-footer").getBoundingClientRect().toJSON()})');
   assert.equal(dimensions.header.top,0,'Header stays at top');
   assert(dimensions.title.top>=dimensions.header.bottom,'Title clears fixed header');
   assert(dimensions.footer.height<=(width<=700?220:150),'Footer remains compact');
   const html=ev('document.querySelector(".site-footer").outerHTML');
   footerMarkup??=html;assert.equal(html,footerMarkup,'One identical footer on every page');
   assert(!/Illustrated map, not for navigation|Geographic features are simplified|ARDMORE AVENUE|There’s always another way|Back to the northern shore|OpenStreetMap/.test(html),'Requested footer copy removed');
   assert(ev('document.querySelectorAll("header.site-header").length===1&&document.querySelectorAll("footer.site-footer").length===1'));
   if(width<=700){b('click','.mobile-menu summary');assert(ev('document.querySelector(".mobile-menu").open'));b('press','Escape');assert(!ev('document.querySelector(".mobile-menu").open'));}
   ev("scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'})");
   if(route==='/'){b('wait','--fn','document.querySelector("#map-tools").inert');assert(ev('document.querySelector(".map-attribution").inert'));b('screenshot',`.cache/reports/lakefront-footer-${width}.png`);}
   if(route==='/places/promontory-point/')b('screenshot',`.cache/reports/lakefront-story-footer-${width}.png`);
   ev("scrollTo({top:0,behavior:'instant'})");
   if(route==='/places/')b('screenshot',`.cache/reports/lakefront-list-header-${width}.png`);
   b('open',base+'/?place=navy-pier');ready();b('wait','--fn','document.querySelector("#place-card")?.open');
   assert.equal(ev('document.querySelector("#card-title").textContent'),'Navy Pier');
   assert(ev('location.pathname==="/"&&location.search.includes("place=navy-pier")'),'Place link opens mapped discovery');
   b('press','Escape');assert(!ev('document.querySelector("#place-card").open'));
   if(route==='/'){if(mobileControls)ev(`scrollTo({top:${openingY},behavior:'instant'})`);else b('click','#north-jump');b('wait','--fn',`Math.abs(scrollY-${openingY})<2`);assert(Math.abs(ev('scrollY')-openingY)<2,'Returning north reaches the opening view');}
   report.push({viewport:`${width}x${height}`,route,footerHeight:dimensions.footer.height,status:'pass'});
  }
  console.log(`Shared chrome verified at ${width}px: ${routes.length?routes.join(', '):'map, list, attraction and credits'}.`);
 }
 fs.writeFileSync(reportPath,JSON.stringify({tested:new Date().toISOString().slice(0,10),checks:['consistent logo/navigation','identical compact footer','removed footer text','fixed header clears titles','mobile menu and Escape','place link opens a map discovery','north control','no horizontal overflow','map controls hidden at footer'],report},null,2)+'\n');
}finally{b('close')}
