// Deploys wait for tests: tools/netlify_ignore.py, run against a stand-in GitHub API.
// Netlify's ignore step: exit 1 means build, exit 0 means skip.
import http from 'http'; import { spawn } from 'child_process'; import path from 'path'; import { fileURLToPath } from 'url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ok = (n, c, x = '') => console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (x ? '  | ' + String(x).replace(/\s+/g, ' ').slice(0, 300) : ''));
const LIVE = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const gh = { runs: {}, down: false };
const srv = http.createServer((req, res) => {
  if (gh.down) { res.writeHead(500); return res.end('down'); }
  const m = new URL(req.url, 'http://x').pathname.match(/^\/repos\/[^/]+\/[^/]+\/commits\/([^/]+)\/check-runs$/);
  if (m) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ check_runs: gh.runs[m[1]] || [] })); }
  res.writeHead(404); res.end('{}');
});
await new Promise(r => srv.listen(8096, r));
// spawn (not spawnSync): the stand-in GitHub above runs in this same process and must keep answering
const ign = env => new Promise(res => {
  const p = spawn('python3', [path.join(repo, 'tools', 'netlify_ignore.py')], { env: { PATH: process.env.PATH, DOWNTIME_GITHUB_API: 'http://localhost:8096', REPOSITORY_URL: 'https://github.com/skboyce28/Downtime', CONTEXT: 'production', COMMIT_REF: LIVE, ...env } });
  let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d); p.on('close', code => res({ code, out }));
});
gh.runs[LIVE] = [{ name: 'test', status: 'in_progress', conclusion: null }];
let r = await ign(); ok('push while the tests are still running: Netlify skips the build', r.code === 0 && /in_progress; skipping/.test(r.out), r.out);
gh.runs[LIVE] = [{ name: 'test', status: 'completed', conclusion: 'failure' }];
r = await ign(); ok('tests failed: skipped, so the last good version stays live', r.code === 0 && /failure; skipping/.test(r.out), r.out);
gh.runs[LIVE] = [{ name: 'test', status: 'completed', conclusion: 'failure' }, { name: 'test', status: 'completed', conclusion: 'success' }];
r = await ign(); ok('tests passed (a rerun counts): builds', r.code === 1 && /tests passed/.test(r.out), r.out);
gh.runs[LIVE] = []; r = await ign(); ok('no test run yet: skipped', r.code === 0 && /not started/.test(r.out), r.out);
gh.down = true; r = await ign(); gh.down = false; ok('GitHub not answering (or a private repo): skipped, the tests start the deploy instead', r.code === 0 && /could not ask GitHub/.test(r.out), r.out);
r = await ign({ CONTEXT: 'deploy-preview' }); ok('deploy previews build as usual', r.code === 1);
r = await ign({ COMMIT_REF: '' }); ok('nothing to check: builds as usual', r.code === 1);
srv.close(); console.log('errors []');
