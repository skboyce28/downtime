// The owner's Admin tab and payment follow-up, checked against the database: only the owner gets in,
// money owed / not invoiced / overdue, marking an order invoiced (buyer told once), reminders (and the
// once-a-day limit), every account with its totals, one customer's history, and blocking a buyer
// (can browse, can't bid or buy; staff and yourself can't be blocked).
import { su, su1, account, call, err, ok, done, shopStaff } from './support/db.mjs';

await su(`update dt_listings set status = 'withdrawn' where status in ('live','sold')`);
await su(`update dt_shop set overdue_days = 3 where id = 1`);
await su(`update dt_sales set status = 'cancelled' where status = 'awaiting payment'`);   // start with nothing owed
const { owner, seller } = await shopStaff();
const ann = await account('ann'), ben = await account('ben'), cal = await account('cal');
for (const u of [ann, ben, cal]) await call(u, 'dt_bootstrap');
await call(ann, 'dt_set_name', { p_name: 'Ann Lee' });
const mk = async p => call(seller, 'dt_publish', { p_id: (await call(seller, 'dt_save_listing', { p })).id });
const tee = await mk({ title: 'Tee', kind: 'fixed', price_cents: 2500, quantity: 20 });
const cap = await mk({ title: 'Cap', kind: 'fixed', price_cents: 3000, quantity: 20 });

// --- who gets in
ok('sellers can’t open Admin', /Only the shop owner can open Admin/.test(await err(seller, 'dt_admin_overview')));
ok('buyers can’t open Admin', /Only the shop owner/.test(await err(ann, 'dt_admin_overview')) && /Only the shop owner/.test(await err(ann, 'dt_admin_block', { p_user: ben.id, p_blocked: true })));
ok('signed-out visitors can’t either', /permission denied/.test(await err(null, 'dt_admin_overview')));

// --- some orders: Ann's cart (old, overdue), Ben's single (new), Cal's paid one
const o1 = await call(ann, 'dt_checkout', { p_items: [{ listing_id: tee.id, qty: 2 }, { listing_id: cap.id, qty: 1 }] });
await su(`update dt_sales set at = now() - interval '5 days' where order_id = $1`, [o1.order_id]);
await call(ben, 'dt_checkout', { p_items: [{ listing_id: cap.id, qty: 1 }] });
const o3 = await call(cal, 'dt_checkout', { p_items: [{ listing_id: tee.id, qty: 1 }] });
const calSale = await su1('select id from dt_sales where order_id = $1', [o3.order_id]);
await call(seller, 'dt_sale_status', { p_id: calSale, p_status: 'paid' });

let ov = await call(owner, 'dt_admin_overview');
ok('owed: 2 orders, $110 (Ann $80 + Ben $30)', ov.owed.orders === 2 && ov.owed.cents === 11000, ov.owed);
ok('neither is invoiced yet', ov.owed.not_invoiced === 2 && ov.owed.not_invoiced_cents === 11000);
ok('Ann’s 5-day-old order is overdue (3-day setting); Ben’s isn’t', ov.owed.overdue === 1 && ov.owed.overdue_cents === 8000);
const annRow = ov.unpaid.find(u => u.buyer_id === ann.id);
ok('unpaid orders list oldest first, with buyer, items, and the overdue flag', ov.unpaid[0].buyer_id === ann.id && annRow.overdue && annRow.cents === 8000 && /Cap, Tee ×2/.test(annRow.items) && annRow.buyer_name === 'Ann Lee', annRow);

// --- invoiced
const annSale = annRow.sale_id;
ok('only staff mark invoiced', /Only shop staff/.test(await err(ann, 'dt_sale_invoiced', { p_id: annSale })));
let r = await call(seller, 'dt_sale_invoiced', { p_id: annSale, p_on: true });
ok('marking one line invoiced marks the whole order', r.sales === 2 && (await su1(`select count(*) from dt_sales where order_id = $1 and invoiced_at is not null`, [o1.order_id])) == 2);
const n1 = (await call(ann, 'dt_me')).notices.filter(n => n.kind === 'invoiced');
ok('the buyer is told a payment request is on its way', n1.length === 1 && /Payment request sent for your order \(\$80\.00\)/.test(n1[0].title), n1);
await call(seller, 'dt_sale_invoiced', { p_id: annSale, p_on: true });
ok('marking it again doesn’t notify twice or move the date', (await call(ann, 'dt_me')).notices.filter(n => n.kind === 'invoiced').length === 1);
ok('Yours shows the purchase as invoiced', (await call(ann, 'dt_me')).purchases.some(p => p.order_id === o1.order_id && p.invoiced_at));
ov = await call(owner, 'dt_admin_overview');
ok('not invoiced drops to 1 ($30)', ov.owed.not_invoiced === 1 && ov.owed.not_invoiced_cents === 3000);
await call(owner, 'dt_sale_invoiced', { p_id: annSale, p_on: false });
ok('invoiced can be undone', (await su1(`select count(*) from dt_sales where order_id = $1 and invoiced_at is not null`, [o1.order_id])) == 0);
await call(owner, 'dt_sale_invoiced', { p_id: annSale, p_on: true });
ok('paid sales can’t be marked invoiced', /Only sales awaiting payment/.test(await err(owner, 'dt_sale_invoiced', { p_id: calSale })));

// --- reminders
r = await call(owner, 'dt_sale_remind', { p_id: annSale });
const rem = (await call(ann, 'dt_me')).notices.filter(n => n.kind === 'reminder');
ok('a reminder notifies the buyer with the total and payment note', r.sales === 2 && rem.length === 1 && /Reminder: payment for your order \(\$80\.00\) is still open/.test(rem[0].title) && rem[0].body.length > 0);
ok('only one reminder a day', /in the last day/.test(await err(owner, 'dt_sale_remind', { p_id: annSale })));
await su(`update dt_sales set reminded_at = now() - interval '2 days' where order_id = $1`, [o1.order_id]);
await call(owner, 'dt_sale_remind', { p_id: annSale });
ok('…then another the next day, counted', (await su1(`select max(reminders) from dt_sales where order_id = $1`, [o1.order_id])) === 2);
const logged = (await call(seller, 'dt_log_sale', { p: { title: 'Sticker', amount_cents: 300, status: 'awaiting payment', buyer_name: 'Walk-up' } })).sale_id;
ok('a logged sale with no buyer account can’t be reminded in the app', /no buyer account/.test(await err(owner, 'dt_sale_remind', { p_id: logged })));
const list = await call(seller, 'dt_sales_list', { p_days: 30 });
ok('the sales list carries invoiced and reminded dates', list.some(x => x.order_id === o1.order_id && x.invoiced_at && x.reminded_at && x.reminders === 2));

// --- customers
ov = await call(owner, 'dt_admin_overview');
const byId = Object.fromEntries(ov.customers.map(c => [c.user_id, c]));
ok('every account is listed, staff marked', !!byId[ann.id] && !!byId[ben.id] && !!byId[cal.id] && byId[owner.id].role === 'owner' && byId[seller.id].role === 'seller');
ok('Ann: 1 order, owes $80, spent $0, oldest unpaid 5 days ago', byId[ann.id].orders === 1 && byId[ann.id].owed_cents === 8000 && byId[ann.id].spent_cents === 0 && byId[ann.id].name === 'Ann Lee' && !!byId[ann.id].oldest_unpaid);
ok('Cal: paid, so spent $25 and owes nothing', byId[cal.id].spent_cents === 2500 && !byId[cal.id].owed_cents);
ok('people who owe money come first', ov.customers[0].owed_cents > 0);
const det = await call(owner, 'dt_admin_customer', { p_user: ann.id });
ok('one customer: their orders with status and invoiced date', det.orders.length === 1 && det.orders[0].cents === 8000 && det.orders[0].status === 'awaiting payment' && !!det.orders[0].invoiced_at && det.confirmed === true);

// --- blocking
await call(owner, 'dt_publish', { p_id: (await call(owner, 'dt_save_listing', { p: { title: 'Lamp', kind: 'auction', start_cents: 1000, ends_at: new Date(Date.now() + 864e5).toISOString() } })).id });
const lamp = await su1(`select id from dt_listings where title = 'Lamp' order by created_at desc limit 1`);
const b = await call(owner, 'dt_admin_block', { p_user: ben.id, p_blocked: true, p_note: 'Never paid' });
ok('the owner blocks a buyer, with a note', b.blocked === true && b.blocked_note === 'Never paid');
ok('a blocked buyer can’t check out, buy, or bid', /can.t buy or bid right now/.test(await err(ben, 'dt_checkout', { p_items: [{ listing_id: tee.id }] })) &&
  /can.t buy or bid/.test(await err(ben, 'dt_buy', { p_id: tee.id })) && /can.t buy or bid/.test(await err(ben, 'dt_bid', { p_id: lamp, p_cents: 1000 })));
ok('…but can still browse and see their account', !!(await call(ben, 'dt_storefront')).shop && (await call(ben, 'dt_me')).blocked === true);
await call(owner, 'dt_admin_block', { p_user: ben.id, p_blocked: false });
ok('unblocking lets them buy again (and clears the note)', !!(await call(ben, 'dt_checkout', { p_items: [{ listing_id: tee.id }] })).order_id && (await call(owner, 'dt_admin_customer', { p_user: ben.id })).blocked_note === '');
ok('you can’t block yourself', /your own account/.test(await err(owner, 'dt_admin_block', { p_user: owner.id, p_blocked: true })));
ok('staff can’t be blocked (remove them from staff first)', /Remove them from staff first/.test(await err(owner, 'dt_admin_block', { p_user: seller.id, p_blocked: true })));

// --- the overdue setting
await call(owner, 'dt_save_shop', { p: { overdue_days: 7 } });
ok('with 7 days, Ann’s 5-day-old order isn’t overdue', (await call(owner, 'dt_admin_overview')).owed.overdue === 0);
ok('overdue days must be 1 to 60', /dt_shop_overdue_days|check constraint/.test(await err(owner, 'dt_save_shop', { p: { overdue_days: 0 } })));

await done();
