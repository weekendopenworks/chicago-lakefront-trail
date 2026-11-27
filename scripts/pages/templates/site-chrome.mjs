import fs from 'node:fs';
import {createHash} from 'node:crypto';
const revision=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0,12);
export const siteScriptUrl=()=>`/site.js?v=${revision('public/site.js')}`;
const logo=`<svg viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="21" r="19" fill="none" stroke="currentColor" stroke-width=".8"/><path d="M8 27q7-7 14-3t13-1M8 31q7-7 14-3t13-1M14 20V12h5v9m3-1V8h4v12m3 0v-6h4v9" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="11" cy="12" r="1.7" fill="currentColor"/></svg>`;
export function siteHeader(route='/'){
 const links=[['/','Explore the map'],['/places/','Explore the list']].map(([href,label])=>{const active=href==='/'?route==='/':route.startsWith(href);return `<a href="${href}"${active?` class="active" aria-current="${route===href?'page':'location'}"`:''}>${label}</a>`}).join('');
 return `<header class="site-header" data-site-script="${siteScriptUrl()}"><a class="brand" href="/" aria-label="Chicago Lakefront Trail home">${logo}<span>Chicago Lakefront Trail</span></a><nav class="desktop-nav" aria-label="Main navigation">${links}</nav><details class="mobile-menu"><summary aria-label="Open navigation"><span></span><span></span></summary><nav aria-label="Mobile navigation">${links}</nav></details></header>`;
}
export function siteFooter(){
 return `<footer class="site-footer"><a class="brand-word" href="/">Chicago Lakefront Trail</a><nav aria-label="Footer navigation"><a href="/">Explore the map</a><a href="/places/">Explore the list</a><a href="/credits/">About & credits</a><a href="/privacy/">Privacy</a></nav></footer>`;
}
