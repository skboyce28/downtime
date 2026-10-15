// Test-only stand-in for Supabase's HTTP layer: Auth (with email confirmation, like the real
// project is set up), PostgREST function calls, and Storage for listing photos. It's backed by a real
// Postgres running Downtime's actual SQL, with Supabase-like roles and row-level security.
// Keys here are fake test values, not real Supabase keys.
import http from 'http';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import crypto from 'crypto';
import { newSecret, totpOk } from './totp.mjs';
const KEY = 'sb_publishable_testkey_1234567890';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const PORT = +(process.env.STANDIN_PORT || 54321);
const FILES = path.join(process.env.DOWNTIME_OUT || 'out', 'storage'); fs.mkdirSync(FILES, { recursive: true });
const passwords = {}, access = {}, refresh = {}, mail = [], challenges = {};   // mail: what Supabase would have emailed
const tok = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
async function userByEmail(e) { return (await pool.query('select id, email, email_confirmed_at from auth.users where lower(email) = lower($1)', [e])).rows[0]; }
// aal1 after a password, aal2 after the two-step code (like Supabase); refreshing keeps the level
function session(u, aal = 'aal1') {
  const a = b64u({ alg: 'HS256', typ: 'JWT' }) + '.' + b64u({ sub: u.id, email: u.email, role: 'authenticated', aal }) + '.fake' + tok(), r = 'r' + tok();
  access[a] = { id: u.id, email: u.email, aal }; refresh[r] = { u: { id: u.id, email: u.email }, aal };
  return { access_token: a, refresh_token: r, expires_in: 3600, token_type: 'bearer', user: { id: u.id, email: u.email } };
}
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' };
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', ...CORS }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
async function as(u, fn) {
  const c = await pool.connect();
  try {
    await c.query('begin'); await c.query(`set local role ${u ? 'authenticated' : 'anon'}`);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(u ? { sub: u.id, email: u.email, role: 'authenticated', aal: u.aal || 'aal1' } : { role: 'anon' })]);
    const r = await fn(c); await c.query('commit'); return r;
  } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
}
const pgErr = (res, e) => e.code === '42883' ? send(res, 404, { code: 'PGRST202', message: 'Could not find the function' })
  : send(res, e.code === '42501' ? 401 : 400, { code: e.code, message: e.message });

http.createServer((req, res) => {
  const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', async () => {
    try {
      if (req.method === 'OPTIONS') return send(res, 204);
      const u = new URL(req.url, 'http://x'), raw = Buffer.concat(chunks);
      // test helpers: what clicking an email link would do
      if (u.pathname === '/__test/mail') return send(res, 200, mail);
      if (u.pathname === '/__test/confirm') {
        const x = await userByEmail(u.searchParams.get('email')); if (!x) return send(res, 404, {});
        await pool.query('update auth.users set email_confirmed_at = now() where id = $1', [x.id]);
        return send(res, 200, session(x));
      }
      if (u.pathname === '/__test/recovery') { const x = await userByEmail(u.searchParams.get('email')); return x ? send(res, 200, session(x)) : send(res, 404, {}); }
      // public photos, like https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
      let m = u.pathname.match(/^\/storage\/v1\/object\/public\/([\w-]+)\/(.+)$/);
      if (m && req.method === 'GET') {
        const b = (await pool.query('select public from storage.buckets where id = $1', [m[1]])).rows[0];
        const f = path.join(FILES, m[1], decodeURIComponent(m[2]));
        if (!b || !b.public || !f.startsWith(FILES) || !fs.existsSync(f)) { res.writeHead(404, CORS); return res.end(); }
        res.writeHead(200, { 'Content-Type': 'image/jpeg', ...CORS }); return fs.createReadStream(f).pipe(res);
      }
      if (req.headers.apikey !== KEY) return send(res, 401, { message: 'Invalid API key' });
      const j = raw.length && (req.headers['content-type'] || '').includes('json') ? JSON.parse(raw.toString()) : {};
      // --- Auth. Like a project with "Confirm email" on: sign-up sends a link and gives no session yet.
      if (u.pathname === '/auth/v1/signup' && req.method === 'POST') {
        const em = String(j.email || '').toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return send(res, 400, { code: 400, error_code: 'email_address_invalid', msg: 'Unable to validate email address: invalid format' });
        if (String(j.password || '').length < 6) return send(res, 422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.' });
        const ex = await userByEmail(em);
        if (ex && ex.email_confirmed_at) return send(res, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
        const x = ex || (await pool.query('insert into auth.users(email) values ($1) returning id, email', [em])).rows[0];
        passwords[em] = j.password; mail.push({ to: em, type: 'signup', redirect_to: u.searchParams.get('redirect_to') || '' });
        return send(res, 200, { id: x.id, email: em, confirmation_sent_at: new Date().toISOString() });
      }
      if (u.pathname === '/auth/v1/token') {
        if (u.searchParams.get('grant_type') === 'password') {
          const x = await userByEmail(j.email || '');
          if (!x || passwords[x.email] !== j.password) return send(res, 400, { error: 'invalid_grant', error_code: 'invalid_credentials', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
          if (!x.email_confirmed_at) return send(res, 400, { error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
          return send(res, 200, session(x));
        }
        if (u.searchParams.get('grant_type') === 'refresh_token') {
          const x = refresh[j.refresh_token]; if (!x) return send(res, 400, { error: 'invalid_grant', msg: 'Invalid Refresh Token' });
          delete refresh[j.refresh_token]; return send(res, 200, session(x.u, x.aal));
        }
      }
      if (u.pathname === '/auth/v1/recover' && req.method === 'POST') { mail.push({ to: String(j.email || '').toLowerCase(), type: 'recovery', redirect_to: u.searchParams.get('redirect_to') || '' }); return send(res, 200, {}); }
      if (u.pathname === '/auth/v1/logout') return send(res, 204);
      const auth = req.headers.authorization;
      const who = auth ? access[auth.replace('Bearer ', '')] : null;
      if (auth && !who) return send(res, 401, { code: 'PGRST301', message: 'JWT expired' });
      // two-step sign-in: authenticator apps (TOTP factors), like Supabase's /auth/v1/factors
      const factorsOf = async id => (await pool.query(`select id, friendly_name, factor_type, status, secret, created_at from auth.mfa_factors where user_id = $1 order by created_at`, [id])).rows;
      if (u.pathname === '/auth/v1/user') {
        if (!who) return send(res, 401, { message: 'not signed in' });
        if (req.method === 'PUT') { if (j.password) passwords[who.email] = j.password; }
        const fs = await factorsOf(who.id);
        return send(res, 200, { id: who.id, email: who.email, factors: fs.length ? fs.map(({ secret, ...f }) => f) : undefined });
      }
      if (u.pathname === '/auth/v1/factors' && req.method === 'POST') {
        if (!who) return send(res, 401, {});
        const fs = await factorsOf(who.id);
        if (fs.some(f => f.status === 'verified') && who.aal !== 'aal2') return send(res, 403, { code: 403, error_code: 'insufficient_aal', msg: 'AAL2 required to enroll a new factor' });
        if (j.factor_type !== 'totp') return send(res, 400, { code: 400, error_code: 'validation_failed', msg: 'Invalid factor type' });
        const secret = newSecret(), r = await pool.query(`insert into auth.mfa_factors (user_id, friendly_name, factor_type, status, secret) values ($1, $2, 'totp', 'unverified', $3) returning id`, [who.id, j.friendly_name || null, secret]);
        const uri = `otpauth://totp/${encodeURIComponent(j.issuer || 'localhost')}:${encodeURIComponent(who.email)}?issuer=${encodeURIComponent(j.issuer || 'localhost')}&secret=${secret}&algorithm=SHA1&digits=6&period=30`;
        return send(res, 200, { id: r.rows[0].id, type: 'totp', friendly_name: j.friendly_name || '', totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#fff"/><rect x="1" y="1" width="3" height="3"/><rect x="6" y="1" width="3" height="3"/><rect x="1" y="6" width="3" height="3"/></svg>', secret, uri } });
      }
      const fm = u.pathname.match(/^\/auth\/v1\/factors\/([0-9a-f-]{36})(\/challenge|\/verify)?$/);
      if (fm) {
        if (!who) return send(res, 401, {});
        const f = (await factorsOf(who.id)).find(x => x.id === fm[1]); if (!f) return send(res, 404, { code: 404, error_code: 'mfa_factor_not_found', msg: 'Factor not found' });
        if (fm[2] === '/challenge') { const id = crypto.randomUUID(); challenges[id] = { factor: f.id, exp: Date.now() + 300e3 }; return send(res, 200, { id, type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 }); }
        if (fm[2] === '/verify') {
          const ch = challenges[j.challenge_id]; if (!ch || ch.factor !== f.id) return send(res, 404, { code: 404, error_code: 'mfa_factor_not_found', msg: 'Challenge not found' });
          if (!totpOk(f.secret, j.code)) return send(res, 422, { code: 422, error_code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' });
          delete challenges[j.challenge_id]; await pool.query(`update auth.mfa_factors set status = 'verified', updated_at = now() where id = $1`, [f.id]);
          return send(res, 200, session({ id: who.id, email: who.email }, 'aal2'));
        }
        if (req.method === 'DELETE') { if (f.status === 'verified' && who.aal !== 'aal2') return send(res, 403, { error_code: 'insufficient_aal', msg: 'AAL2 required' }); await pool.query('delete from auth.mfa_factors where id = $1', [f.id]); return send(res, 200, { id: f.id }); }
      }
      // --- PostgREST: functions only (the app never touches tables directly)
      m = u.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
      if (m && req.method === 'POST') {
        const keys = Object.keys(j);
        try { const r = await as(who, c => c.query(`select public.${m[1]}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map(k => j[k] !== null && typeof j[k] === 'object' ? JSON.stringify(j[k]) : j[k]))); return send(res, 200, r.rows[0].r); }
        catch (e) { return pgErr(res, e); }
      }
      if (u.pathname.startsWith('/rest/v1/')) return send(res, 404, { message: 'not used by Downtime' });
      // --- Storage uploads and deletes, checked by storage.objects' row-level security like Supabase
      m = u.pathname.match(/^\/storage\/v1\/object\/([\w-]+)\/(.+)$/);
      if (m && req.method === 'POST') {
        if (!who) return send(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
        const b = (await pool.query('select * from storage.buckets where id = $1', [m[1]])).rows[0];
        if (!b) return send(res, 400, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
        const type = (req.headers['content-type'] || '').split(';')[0];
        if (b.allowed_mime_types && !b.allowed_mime_types.includes(type)) return send(res, 400, { statusCode: '415', error: 'invalid_mime_type', message: `mime type ${type} is not supported` });
        if (b.file_size_limit && raw.length > b.file_size_limit) return send(res, 400, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' });
        const name = decodeURIComponent(m[2]);
        try { await as(who, c => c.query('insert into storage.objects (bucket_id, name, metadata) values ($1, $2, $3)', [m[1], name, JSON.stringify({ size: raw.length, mimetype: type })])); }
        catch (e) { return send(res, 400, { statusCode: e.code === '23505' ? '409' : '403', error: e.code === '23505' ? 'Duplicate' : 'Unauthorized', message: e.code === '23505' ? 'The resource already exists' : 'new row violates row-level security policy' }); }
        const f = path.join(FILES, m[1], name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, raw);
        return send(res, 200, { Key: `${m[1]}/${name}` });
      }
      send(res, 404, { message: 'not found' });
    } catch (e) { send(res, 500, { message: String(e.message || e) }); }
  });
}).listen(PORT, () => console.log('supabase stand-in on ' + PORT));
