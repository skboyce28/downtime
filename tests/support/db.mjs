// Test helpers for calling Downtime's database functions the way Supabase would: as a signed-in
// account (role "authenticated" with that account in the token), as nobody (role "anon"), or as the
// database owner (the SQL Editor). Every call is its own transaction, like a real API request.
import pg from 'pg';
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres', max: 8 });
export const sfx = Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 5);

// the SQL Editor
export const su = async (sql, vals = []) => (await pool.query(sql, vals)).rows;
export const su1 = async (sql, vals = []) => { const r = await su(sql, vals); return r[0] ? Object.values(r[0])[0] : undefined; };

// a confirmed account, like after clicking the email link
export async function account(name) {
  const email = `${name}-${sfx}@example.com`;
  const id = await su1('insert into auth.users(email, email_confirmed_at) values ($1, now()) returning id', [email]);
  return { id, email, name };
}

// call public.<fn>(args) as an account (or anon when who is null); args are named
export async function call(who, fn, args = {}) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${who ? 'authenticated' : 'anon'}`);
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify(who ? { sub: who.id, email: who.email, role: 'authenticated', aal: 'aal1' } : { role: 'anon' })]);
    const keys = Object.keys(args);
    const r = await c.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map(k => args[k]));
    await c.query('commit');
    return r.rows[0].r;
  } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
}
// same, but returns the error message instead of throwing (null when it worked)
export async function err(who, fn, args = {}) { try { await call(who, fn, args); return null; } catch (e) { return e.message; } }

let fails = 0;
export const ok = (n, c, x = '') => { if (!c) fails++; console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (x ? '  | ' + String(typeof x === 'string' ? x : JSON.stringify(x)).replace(/\s+/g, ' ').slice(0, 260) : '')); };
export async function done(errors = []) { await pool.end(); console.log('errors ' + JSON.stringify(errors)); process.exit(fails || errors.length ? 1 : 0); }

// a shop owner and one seller, ready to list things
export async function shopStaff() {
  const owner = await account('owner'), seller = await account('seller');
  await su('select public.dt_make_owner($1)', [owner.email]);
  await call(owner, 'dt_bootstrap'); await call(seller, 'dt_bootstrap');
  const code = await su1('select join_code from public.dt_shop where id = 1');
  await call(seller, 'dt_join_staff', { p_code: code });
  return { owner, seller };
}
export const inMinutes = m => new Date(Date.now() + m * 60000).toISOString();
