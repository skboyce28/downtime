// Downtime test runner: sets up a test database, builds the site, starts the stand-in servers,
// runs every *.test.mjs, and prints a summary. Exits non-zero if anything fails.
//
//   cd tests && npm ci && npx playwright install chromium
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres node run.mjs [filter...]
//
// Needs: Node 22+, Python 3 (for build_pwa.py), and a throwaway Postgres 15+ database.
// Never point DATABASE_URL at a real Supabase project: the setup adds test accounts and data.
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import net from 'net';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '..');
const out = path.join(here, 'out'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(path.join(out, 'sites'), { recursive: true });
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
const filters = process.argv.slice(2);
const env = { ...process.env, DATABASE_URL, DOWNTIME_OUT: out, SITE: 'http://localhost:8099', DB: 'http://localhost:54321' };
const log = (...a) => console.log(...a);

// 1) database: Supabase-like roles, auth and storage, then Downtime's real scripts (all safe to rerun)
async function setupDb() {
  const c = new pg.Client({ connectionString: DATABASE_URL }); await c.connect();
  for (const f of ['tests/support/auth-shim.sql', 'supabase/1-shop.sql', 'supabase/2-photos.sql', 'supabase/3-schedule.sql'])
    await c.query(fs.readFileSync(path.join(repo, f), 'utf8'));
  await c.end(); log('✓ database ready');
}

// 2) built sites, as Netlify would serve them (each with its own config)
function build(name, extra) {
  const r = spawnSync('python3', ['build_pwa.py'], { cwd: repo, env: { ...process.env, NETLIFY: '', DOWNTIME_SUPABASE_URL: '', DOWNTIME_SUPABASE_KEY: '', ...extra }, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('build failed: ' + r.stderr + r.stdout);
  const dest = path.join(out, 'sites', name); fs.cpSync(path.join(repo, 'pwa'), dest, { recursive: true }); return { dest, out: r.stdout + r.stderr };
}

const procs = [];
function start(args, name) { const p = spawn('node', args, { cwd: here, env, stdio: ['ignore', 'pipe', 'pipe'] }); p.stderr.on('data', d => process.stderr.write(`[${name}] ${d}`)); procs.push(p); return p; }
const waitPort = (port, ms = 10000) => new Promise((res, rej) => { const t0 = Date.now(); const tryit = () => { const s = net.connect(port, '127.0.0.1', () => { s.end(); res(); }); s.on('error', () => Date.now() - t0 > ms ? rej(new Error('port ' + port + ' not ready')) : setTimeout(tryit, 200)); }; tryit(); });

// 3) run one test file: it passes when it prints PASS lines, no FAIL lines, no page errors, and exits 0
function runTest(file) {
  return new Promise(res => {
    const t0 = Date.now(); let text = '';
    const p = spawn('node', [file], { cwd: here, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const kill = setTimeout(() => { text += '\nTIMEOUT'; p.kill('SIGKILL'); }, 8 * 60 * 1000);
    p.stdout.on('data', d => text += d); p.stderr.on('data', d => text += d);
    p.on('close', code => {
      clearTimeout(kill);
      const pass = (text.match(/^PASS /gm) || []).length, fail = (text.match(/^FAIL /gm) || []).length;
      const errLine = (text.match(/^errors (.*)$/m) || [])[1];
      const ok = code === 0 && fail === 0 && pass > 0 && errLine !== undefined && errLine.trim() === '[]' && !/TIMEOUT/.test(text);
      fs.writeFileSync(path.join(out, path.basename(file) + '.log'), text);
      res({ file, ok, pass, fail, code, secs: Math.round((Date.now() - t0) / 1000), text });
    });
  });
}

let results = [];
try {
  await setupDb();
  build('app', { DOWNTIME_SUPABASE_URL: 'http://localhost:54321', DOWNTIME_SUPABASE_KEY: 'sb_publishable_testkey_1234567890', COMMIT_REF: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', CONTEXT: 'production' });
  build('csp', { DOWNTIME_SUPABASE_URL: 'https://demo.supabase.co', DOWNTIME_SUPABASE_KEY: 'sb_publishable_demo_key_000000000000' });
  build('bare', {});
  log('✓ sites built');
  start(['support/supabase-standin.mjs'], 'supabase');
  start(['support/site-server.mjs', path.join(out, 'sites/app'), '8099'], 'site');
  start(['support/site-server.mjs', path.join(out, 'sites/csp'), '8098'], 'csp-site');
  start(['support/site-server.mjs', path.join(out, 'sites/bare'), '8097'], 'bare-site');
  await Promise.all([waitPort(54321), waitPort(8099), waitPort(8098), waitPort(8097)]); log('✓ servers up\n');

  const files = fs.readdirSync(here).filter(f => f.endsWith('.test.mjs')).sort().filter(f => !filters.length || filters.some(x => f.includes(x)));
  // each test file starts from the default shop settings, whatever the one before it changed
  const RESET = 'delete from public.dt_shop; insert into public.dt_shop (id) values (1)';
  for (const f of files) {
    { const c = new pg.Client({ connectionString: DATABASE_URL }); await c.connect(); await c.query(RESET); await c.end(); }
    const r = await runTest(f); results.push(r);
    log(`${r.ok ? '✅' : '❌'} ${f.padEnd(28)} ${String(r.pass).padStart(3)} passed${r.fail ? `, ${r.fail} failed` : ''}  (${r.secs}s)`);
    if (!r.ok) log(r.text.split('\n').filter(l => /^FAIL |^errors |Error|TIMEOUT/.test(l)).slice(0, 12).map(l => '     ' + l.slice(0, 240)).join('\n'));
    if (!r.ok && process.env.GITHUB_ACTIONS) {
      const lines = r.text.split('\n').filter(l => /^FAIL |^errors \[.+\]|Error|TIMEOUT/.test(l)).slice(0, 8);
      const e = t => t.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
      console.log(`::error title=${f} failed::${e((lines.join('\n') || ('exit code ' + r.code)).slice(0, 3000))}`);
    }
  }
} finally {
  for (const p of procs) p.kill();
  // leave the repo's pwa/ as an unconfigured build so nothing test-specific lingers
  spawnSync('python3', ['build_pwa.py'], { cwd: repo, env: { ...process.env, NETLIFY: '', DOWNTIME_SUPABASE_URL: '', DOWNTIME_SUPABASE_KEY: '' } });
}
const bad = results.filter(r => !r.ok), total = results.reduce((n, r) => n + r.pass, 0);
log(`\n${bad.length ? '❌' : '✅'} ${results.length - bad.length} of ${results.length} test files passed, ${total} checks. Logs and screenshots: tests/out/`);
process.exit(bad.length || !results.length ? 1 : 0);
