// Store rules, checked against the database: sizes and colors with their own stock, checking out a
// cart as one order (all or nothing), two buyers racing for the last one, orders moving and cancelling
// together, logging a sale of one size, restocking a sold-out item, relisting with options, and the
// dashboard's low stock per size.
import { su, su1, account, call, err, ok, done, shopStaff } from './support/db.mjs';

await su(`update dt_listings set status = 'withdrawn' where status = 'live'`);
const { owner, seller } = await shopStaff();
const ann = await account('ann'), ben = await account('ben'), cal = await account('cal');
for (const u of [ann, ben, cal]) await call(u, 'dt_bootstrap');

// --- a tee with sizes and colors
const opts = [{ size: 'S', color: 'Black', qty: 1 }, { size: 'M', color: 'Black', qty: 3 }, { size: 'L', color: 'Sand', qty: 0 }];
let tee = await call(seller, 'dt_save_listing', { p: { title: 'Downtime tee', kind: 'fixed', price_cents: 2800, cost_cents: 900, category: 'Shirts', variants: opts } });
ok('options are saved with ids made from size and color', tee.variants.map(v => v.id).join() === 's-black,m-black,l-sand' && tee.variants[1].qty === 3, tee.variants);
ok('the listing’s stock is the options’ total', tee.quantity === 4);
ok('duplicate options are refused', /S \/ Black is listed twice/.test(await err(seller, 'dt_save_listing', { p: { id: tee.id, kind: 'fixed', price_cents: 2800, variants: [opts[0], opts[0]] } })));
ok('an option needs a size or a color', /needs a size or a color/.test(await err(seller, 'dt_save_listing', { p: { id: tee.id, kind: 'fixed', price_cents: 2800, variants: [{ qty: 2 }] } })));
ok('a negative stock count is refused', /has to be 0 to 10,000/.test(await err(seller, 'dt_save_listing', { p: { id: tee.id, kind: 'fixed', price_cents: 2800, variants: [{ size: 'XL', qty: -1 }] } })));
const zero = await call(seller, 'dt_save_listing', { p: { title: 'Empty hat', kind: 'fixed', price_cents: 2000, variants: [{ color: 'Olive', qty: 0 }] } });
ok('publishing with no stock in any option says so', /Add stock for at least one size or color/.test(await err(seller, 'dt_publish', { p_id: zero.id })));
tee = await call(seller, 'dt_publish', { p_id: tee.id });
const pub = (await call(null, 'dt_listing', { p_id: tee.id }));
ok('shoppers see the options and their stock', pub.variants.length === 3 && pub.variants.find(v => v.id === 'l-sand').qty === 0);

const hat = await call(seller, 'dt_publish', { p_id: (await call(seller, 'dt_save_listing', { p: { title: 'Dad cap', kind: 'fixed', price_cents: 2500, quantity: 2, category: 'Hats' } })).id });
const shades = await call(seller, 'dt_publish', { p_id: (await call(seller, 'dt_save_listing', { p: { title: 'Wayfarer shades', kind: 'fixed', price_cents: 1800, quantity: 5, category: 'Sunglasses' } })).id });

// --- direct Buy needs an option on option listings
ok('buying an option listing without picking one is refused', /Pick a size or color/.test(await err(ann, 'dt_buy', { p_id: tee.id })));

// --- checkout
ok('an empty cart is refused', /cart is empty/.test(await err(ann, 'dt_checkout', { p_items: [] })));
ok('signed-out checkout is refused', /permission denied/.test(await err(null, 'dt_checkout', { p_items: [{ listing_id: hat.id }] })));
ok('staff can’t check out', /log sales in the back office/.test(await err(owner, 'dt_checkout', { p_items: [{ listing_id: hat.id }] })));
ok('a cart line for an option listing needs the option', /Pick a size or color for Downtime tee/.test(await err(ann, 'dt_checkout', { p_items: [{ listing_id: tee.id, qty: 1 }] })));
ok('a sold-out option is refused by name', /Downtime tee \(L \/ Sand\) is sold out/.test(await err(ann, 'dt_checkout', { p_items: [{ listing_id: tee.id, variant: 'l-sand', qty: 1 }] })));
const o = await call(ann, 'dt_checkout', { p_items: [{ listing_id: tee.id, variant: 'm-black', qty: 2 }, { listing_id: hat.id, qty: 1 }, { listing_id: shades.id, qty: 1 }] });
ok('a 3-line cart checks out as one order', !!o.order_id && o.total_cents === 2 * 2800 + 2500 + 1800 && o.units === 4 && o.lines.length === 3, o);
const lines = await su('select * from dt_sales where order_id = $1 order by title', [o.order_id]);
ok('…with a sale per line, awaiting payment, remembering the size and color', lines.length === 3 && lines.every(l => l.status === 'awaiting payment' && l.how === 'buy') &&
  lines.find(l => l.title === 'Downtime tee').variant === 'M / Black' && lines.find(l => l.title === 'Downtime tee').cost_cents === 1800);
ok('stock came off the right option and listings', (await su1(`select variants->1->>'qty' from dt_listings where id = $1`, [tee.id])) === '1' &&
  (await su1('select quantity from dt_listings where id = $1', [tee.id])) === 2 && (await su1('select quantity from dt_listings where id = $1', [hat.id])) === 1);
const annMe = await call(ann, 'dt_me'), ownMe = await call(owner, 'dt_me');
ok('the buyer gets one notice for the order', annMe.notices.filter(n => n.kind === 'bought').length === 1 && /You got 4 items for \$99\.00/.test(annMe.notices[0].title), annMe.notices[0]);
ok('staff get one notice for the order', ownMe.notices.some(n => n.kind === 'sold' && /bought 4 items for \$99\.00/.test(n.title)));
ok('Yours lists each line with its order and option', annMe.purchases.filter(p => p.order_id === o.order_id).length === 3 && annMe.purchases.some(p => p.variant === 'M / Black'));

// --- all or nothing
const before = await su1('select quantity from dt_listings where id = $1', [shades.id]);
const bad = await err(ben, 'dt_checkout', { p_items: [{ listing_id: shades.id, qty: 1 }, { listing_id: tee.id, variant: 's-black', qty: 2 }] });
ok('if one line can’t be filled, nothing is bought', /Only 1 left of Downtime tee \(S \/ Black\)/.test(bad) && (await su1('select quantity from dt_listings where id = $1', [shades.id])) === before &&
  (await su1('select count(*) from dt_sales where buyer_id = $1', [ben.id])) == 0, bad);

// --- two buyers race for the last small
const race = await Promise.allSettled([call(ben, 'dt_checkout', { p_items: [{ listing_id: tee.id, variant: 's-black' }] }), call(cal, 'dt_checkout', { p_items: [{ listing_id: tee.id, variant: 's-black' }] })]);
ok('two buyers at once for the last one: exactly one gets it', race.filter(r => r.status === 'fulfilled').length === 1 && /sold out/.test((race.find(r => r.status === 'rejected') || {}).reason?.message || ''), race.map(r => r.status));
ok('that option is now 0', (await su1(`select variants->0->>'qty' from dt_listings where id = $1`, [tee.id])) === '0');

// --- paying and cancelling move the whole order
await call(seller, 'dt_sale_status', { p_id: lines[0].id, p_status: 'paid' });
ok('marking one line paid marks the whole order paid', (await su1(`select string_agg(distinct status, ',') from dt_sales where order_id = $1`, [o.order_id])) === 'paid');
ok('…and the buyer hears once, with the order total', (await call(ann, 'dt_me')).notices.filter(n => n.kind === 'paid').length === 1 && /your order \(\$99\.00\)/.test((await call(ann, 'dt_me')).notices.find(n => n.kind === 'paid').title));
const r = await call(owner, 'dt_sale_status', { p_id: lines[1].id, p_status: 'cancelled' });
ok('cancelling cancels every line', r.sales === 3 && (await su1(`select string_agg(distinct status, ',') from dt_sales where order_id = $1`, [o.order_id])) === 'cancelled');
ok('…and puts every item back, on the right option', (await su1(`select variants->1->>'qty' from dt_listings where id = $1`, [tee.id])) === '3' &&
  (await su1('select quantity from dt_listings where id = $1', [hat.id])) === 2 && (await su1('select quantity from dt_listings where id = $1', [shades.id])) === 5);

// --- selling the last of everything, then restocking
await call(cal, 'dt_checkout', { p_items: [{ listing_id: hat.id, qty: 2 }] });
ok('the last cap sells it out (it stays listed as sold)', (await su1('select status from dt_listings where id = $1', [hat.id])) === 'sold' && (await call(null, 'dt_storefront')).sold.some(l => l.id === hat.id));
const back = await call(owner, 'dt_save_listing', { p: { id: hat.id, kind: 'fixed', price_cents: 2500, quantity: 6 } });
ok('restocking a sold-out item puts it back on sale', back.status === 'live' && back.quantity === 6 && (await call(null, 'dt_storefront')).live.some(l => l.id === hat.id));

// --- logging an event sale of one size
await call(seller, 'dt_log_sale', { p: { listing_id: tee.id, variant: 'm-black', qty: 2, amount_cents: 5000, channel: 'event', event: 'Pop-up' } });
ok('an event sale takes stock off that size', (await su1(`select variants->1->>'qty' from dt_listings where id = $1`, [tee.id])) === '1' &&
  (await su1(`select variant from dt_sales where event = 'Pop-up' order by at desc limit 1`)) === 'M / Black');
ok('logging an option listing without the option is refused', /Pick a size or color/.test(await err(seller, 'dt_log_sale', { p: { listing_id: tee.id, amount_cents: 100 } })));

// --- the dashboard shows low stock per option
const d = await call(owner, 'dt_dashboard', { p_days: 30 });
ok('low stock lists each low option by name', d.stock.low.some(x => x.title === 'Downtime tee' && x.variant === 'M / Black' && x.quantity === 1) &&
  d.stock.low.some(x => x.variant === 'S / Black' && x.quantity === 0), d.stock.low);
ok('awaiting payment counts orders, not lines', d.totals.awaiting_count >= 1 && Number.isInteger(d.totals.awaiting_count));

// --- relisting keeps the options with fresh stock
await su(`update dt_listings set status = 'sold' where id = $1`, [tee.id]);
const re = await call(owner, 'dt_relist', { p_id: tee.id });
ok('relisting keeps the sizes and colors, stock reset to 0', re.variants.length === 3 && re.variants.every(v => v.qty === 0) && re.quantity === 0 && re.status === 'draft');

// --- unpaid limit counts orders, not lines
const many = await call(seller, 'dt_publish', { p_id: (await call(seller, 'dt_save_listing', { p: { title: 'Sticker', kind: 'fixed', price_cents: 300, quantity: 100 } })).id });
const dee = await account('dee'); await call(dee, 'dt_bootstrap');
for (let i = 0; i < 5; i++) await call(dee, 'dt_checkout', { p_items: [{ listing_id: many.id, qty: 1 }, { listing_id: shades.id, qty: 1 }] });
ok('5 unpaid orders (10 lines) hits the limit', /5 purchases waiting/.test(await err(dee, 'dt_checkout', { p_items: [{ listing_id: many.id }] })));

await done();
