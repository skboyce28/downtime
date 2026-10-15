// Two-step sign-in for staff and the 16-character share key, checked against the database. A staff
// account signed in with only a password (aal1) is turned away from every staff-only thing (listings,
// sales, dashboard, Admin, settings, photo uploads), but still can't bid or buy; with the code step
// (aal2) it all opens. Joining the staff works before setting up the app, so a new seller can join
// and then set it up. Share keys are 16 characters from a strong random source.
import { su, su1, account, call, err, ok, done, shopStaff } from './support/db.mjs';
import pg from 'pg';

const { owner, seller } = await shopStaff();
const pw = u => ({ ...u, aal: 'aal1' });   // the same account, signed in with just a password

// --- the share key
const key = await su1('select join_code from dt_shop where id = 1');
ok('the share key is 16 characters in 4 groups, without look-alike letters', /^[A-HJKMNP-Z2-9]{4}(-[A-HJKMNP-Z2-9]{4}){3}$/.test(key), key);
const keys = new Set(); for (let i = 0; i < 300; i++) keys.add(await su1('select public.dt_fmt_code(public.dt_gen_code())'));
ok('300 new keys are all different', keys.size === 300);
ok('a key typed in lower case without dashes still matches', (await su1(`select public.dt_fmt_code($1)`, [key.toLowerCase().replace(/-/g, '')])) === key);
await su(`update dt_shop set join_code = 'ABCD-EFGH' where id = 1`);
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
await c.query((await import('fs')).readFileSync(new URL('../supabase/1-shop.sql', import.meta.url), 'utf8')); await c.end();
ok('rerunning the script replaces an old 8-character key', /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(await su1('select join_code from dt_shop where id = 1')));

// --- password only: staff powers stay locked
const staffOnly = [['dt_staff_listings'], ['dt_sales_list', { p_days: 30 }], ['dt_dashboard', { p_days: 30 }], ['dt_shop_admin'],
  ['dt_save_listing', { p: { title: 'X', kind: 'fixed', price_cents: 100 } }], ['dt_log_sale', { p: { title: 'X', amount_cents: 100 } }]];
for (const [fn, args] of staffOnly) ok(`password only: ${fn} asks for the code step`, /Finish two-step sign-in first/.test(await err(pw(seller), fn, args || {})));
ok('password only: the owner can’t open Admin', /Finish two-step sign-in first/.test(await err(pw(owner), 'dt_admin_overview')));
ok('password only: the owner can’t change settings or the key', /Only the shop owner/.test(await err(pw(owner), 'dt_save_shop', { p: { name: 'X' } })) && /Only the shop owner/.test(await err(pw(owner), 'dt_new_code')));
ok('password only: the share key isn’t shown', (await err(pw(owner), 'dt_shop_admin')) !== null);
const live = await call(owner, 'dt_publish', { p_id: (await call(owner, 'dt_save_listing', { p: { title: 'Cap', kind: 'fixed', price_cents: 2000, quantity: 3 } })).id });
ok('password only: staff still can’t buy their own shop’s items', /log sales in the back office/.test(await err(pw(seller), 'dt_checkout', { p_items: [{ listing_id: live.id }] })));
const me1 = await call(pw(seller), 'dt_me');
ok('dt_me tells the app what’s needed: on staff, no app set up, code step not done', me1.role === 'seller' && me1.mfa === false && me1.aal2 === false && me1.staff_ok === false);

// photo uploads go through the storage rule, which checks the same thing
async function upload(who) {
  const cl = new pg.Client({ connectionString: process.env.DATABASE_URL }); await cl.connect();
  try { await cl.query('begin'); await cl.query('set local role authenticated');
    await cl.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: who.id, email: who.email, role: 'authenticated', aal: who.aal })]);
    await cl.query(`insert into storage.objects (bucket_id, name) values ('listing-photos', $1)`, [`listings/${live.id}/t${Date.now()}${Math.random().toString(36).slice(2, 6)}.jpg`]);
    await cl.query('rollback'); return 'ok'; } catch (e) { await cl.query('rollback').catch(() => {}); return e.message; } finally { await cl.end(); } }
ok('password only: photo uploads are refused', /row-level security/.test(await upload(pw(seller))));
ok('with the code step: photo uploads work', (await upload(seller)) === 'ok');

// --- with the code step
ok('with the code step: listings, sales, dashboard, Admin all open', Array.isArray(await call(seller, 'dt_staff_listings')) && !!(await call(owner, 'dt_dashboard', { p_days: 7 })).totals && !!(await call(owner, 'dt_admin_overview')).owed);
await su(`insert into auth.mfa_factors (user_id, factor_type, status, secret) values ($1, 'totp', 'verified', 'X')`, [seller.id]);
const me2 = await call(seller, 'dt_me');
ok('dt_me with an app set up and the code step done: staff_ok', me2.mfa === true && me2.aal2 === true && me2.staff_ok === true);
ok('the storefront shows staff details only after the code step', 'reserve_cents' in (await call(owner, 'dt_listing', { p_id: live.id })) && !('reserve_cents' in (await call(pw(owner), 'dt_listing', { p_id: live.id }))));

// --- joining before the app is set up
const newbie = await account('newseller');
const joined = await call(newbie, 'dt_join_staff', { p_code: await su1('select join_code from dt_shop where id = 1') });
ok('a new seller can join with just a password (then sets up the app)', joined.role === 'seller' && joined.staff_ok === false);
ok('…and is asked for the code step before the back office opens', /Finish two-step/.test(await err(newbie, 'dt_staff_listings')));
ok('buyers who aren’t staff are just told it’s staff-only', /Only shop staff/.test(await err(await account('shopper'), 'dt_staff_listings')));

await done();
