import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (!fs.existsSync('public/index.html')) throw new Error('Missing public/index.html; restore the committed website files.');
const output = fs.realpathSync('public');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };
const port = Number(process.env.PORT || 4179);
assertPort(port);
function assertPort(value) {
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error('PORT must be an integer between 1 and 65535');
}
const server = http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.includes('\0') || pathname.split('/').some(part => part.startsWith('.'))) throw new Error('Forbidden');
    let target = path.resolve(output, `.${pathname}`);
    if (!target.startsWith(output + path.sep) && target !== output) throw new Error('Forbidden');
    if (fs.statSync(target).isDirectory()) {
      if (!pathname.endsWith('/')) { res.writeHead(308, { Location: pathname + '/' }); res.end(); return; }
      target = path.join(target, 'index.html');
    }
    if (!fs.realpathSync(target).startsWith(output + path.sep)) throw new Error('Forbidden');
    const stat = fs.statSync(target);
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Content-Length': stat.size, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(target).pipe(res);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Website: http://127.0.0.1:${port} (serving public/; refresh after edits)`));
