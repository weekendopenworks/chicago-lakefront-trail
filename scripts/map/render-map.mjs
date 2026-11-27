import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {MAP} from '../lib/map-coordinates.mjs';
// Use the same SVG renderer as the browser once at build time, then ship only
// small WebP display tiles. No new artwork or geography is generated here.
const run=promisify(execFile),tileWidth=1300,ratio=1.5,rows=MAP.height/MAP.tileHeight;
const manifestPath='data/geography/map-tile-manifest.json';let previous={};
try{previous=JSON.parse(await fs.readFile(manifestPath,'utf8'))}catch{}
const manifest={},sources=[],pending=[];let sourceBytes=0,displayBytes=0;
for(let row=0;row<rows;row++){
 const source=await fs.readFile(`public/assets/map/section-${row}.svg`);sources.push(source);sourceBytes+=source.length;
 const hash=createHash('sha256').update(source).update('chromium-webp-0.88-1.5-v1').digest('hex');manifest[row]=hash;
 const present=await Promise.all(Array.from({length:4},(_,col)=>fs.stat(`public/assets/map/tile-${row}-${col}.webp`).then(()=>true).catch(()=>false)));
 if(process.argv.includes('--force')||previous[row]!==hash||present.some(v=>!v))pending.push(row);
}
if(pending.length){
 // The server serves only this build's ten SVG buffers, never the workspace.
 const server=http.createServer((req,res)=>{const match=req.url.match(/^\/section-(\d)\.svg$/);if(match){res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'no-store'});res.end(sources[+match[1]])}else if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Map build</title>')}else{res.writeHead(404);res.end()}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 const session=`atlas-render-${process.pid}`;
 async function browser(...args){const {stdout}=await run('agent-browser',['--session',session,'--json',...args],{maxBuffer:24*1024*1024,timeout:90000});const r=JSON.parse(stdout);if(!r.success)throw Error(JSON.stringify(r));return r.data}
 try{
  await browser('open',`http://127.0.0.1:${server.address().port}/`);
  for(const row of pending){
   const result=await browser('eval',`(async()=>{const img=new Image();img.src='/section-${row}.svg';await img.decode();const outputs=[];for(let col=0;col<4;col++){const canvas=document.createElement('canvas');canvas.width=${tileWidth*ratio};canvas.height=${MAP.tileHeight*ratio};canvas.getContext('2d').drawImage(img,-col*${tileWidth*ratio},0,${MAP.width*ratio},${MAP.tileHeight*ratio});outputs.push(canvas.toDataURL('image/webp',.88))}return outputs})()`);
   for(let col=0;col<4;col++){const url=result.result[col];if(!url.startsWith('data:image/webp;base64,'))throw Error('Browser did not encode WebP');await fs.writeFile(`public/assets/map/tile-${row}-${col}.webp`,Buffer.from(url.split(',')[1],'base64'))}
   previous[row]=manifest[row];await fs.writeFile(manifestPath,JSON.stringify(previous,null,2));console.log(`Rendered map row ${row+1}/${rows}.`);
  }
 }finally{await browser('close').catch(()=>{});await new Promise(resolve=>server.close(resolve))}
}
for(let row=0;row<rows;row++)for(let col=0;col<4;col++)displayBytes+=(await fs.stat(`public/assets/map/tile-${row}-${col}.webp`)).size;
await fs.writeFile('data/geography/map-performance.json',JSON.stringify({sourceBytes,displayBytes,tileWidth,tileHeight:MAP.tileHeight,pixelRatio:ratio,tiles:40,rendering:'Geographic SVG pre-rendered to WebP; only nearby tiles loaded by the client.'},null,2));
console.log(`40 display tiles: ${(displayBytes/1048576).toFixed(2)} MiB (vector sources ${(sourceBytes/1048576).toFixed(2)} MiB).`);
