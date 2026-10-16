// Test-only Netlify stand-in: serves a built site folder and applies its _headers rules
// Usage: node site-server.mjs <folder> <port>
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = path.resolve(process.argv[2] || 'site'), PORT = +(process.argv[3] || 8099), rules = []; let cur = null;
for (const line of fs.readFileSync(path.join(root, '_headers'), 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  if (!line.startsWith(' ')) { cur = { pat: line.trim(), h: {} }; rules.push(cur); }
  else { const i = line.indexOf(':'); cur.h[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
}
const match = (pat, p) => pat.endsWith('/*') ? p.startsWith(pat.slice(0, -1)) : pat === p;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname), f = path.join(root, p.endsWith('/') ? p + 'index.html' : p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  const h = { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' };
  for (const r of rules) if (match(r.pat, p)) Object.assign(h, r.h);
  res.writeHead(200, h); fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log('site on ' + PORT));
