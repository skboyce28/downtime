// The sales log and dashboard, checked against the database: logging sales made at events or in
// person, stock coming off listed items, moving sales from awaiting payment to paid, cancelling (the
// item goes back), and the dashboard's totals, day-by-day chart, per-seller numbers, best sellers, and stock.
import { su, su1, account, call, err, ok, done, shopStaff } from './support/db.mjs';

// a clean sales history, so the totals below are exact
await su('delete from dt_sales'); await su(`update dt_listings set status = 'withdrawn' where status = 'live'`);
const { owner, seller } = await shopStaff();
await call(seller, 'dt_set_name', { p_name: 'Sam Seller' });
const buyer = await account('buyer'); await call(buyer, 'dt_bootstrap');

const tee = await call(owner, 'dt_save_listing', { p: { title: 'Downtime tee', kind: 'fixed', price_cents: 3000, quantity: 5, cost_cents: 1000, line: 'custom', category: 'Shirts' } });
await call(owner, 'dt_publish', { p_id: tee.id });
const cap = await call(owner, 'dt_save_listing', { p: { title: 'Dad cap', kind: 'fixed', price_cents: 2500, quantity: 2 } });
await call(owner, 'dt_publish', { p_id: cap.id });

// logged at a pop-up: 2 tees by the seller, takes them out of stock
let r = await call(seller, 'dt_log_sale', { p: { listing_id: tee.id, qty: 2, amount_cents: 5500, channel: 'event', event: 'Fall market' } });
ok('a seller logs an event sale of a listed item', !!r.sale_id);
ok('stock comes off the listing', (await su1('select quantity from dt_listings where id = $1', [tee.id])) === 3);
const s1 = (await su('select * from dt_sales where id = $1', [r.sale_id]))[0];
ok('it’s saved as paid, with who sold it and the cost for profit', s1.status === 'paid' && s1.seller_id === seller.id && s1.cost_cents === 2000 && s1.event === 'Fall market' && s1.title === 'Downtime tee');
ok('can’t log more than is in stock', /Only 3 in stock/.test(await err(seller, 'dt_log_sale', { p: { listing_id: tee.id, qty: 4, amount_cents: 1 } })));
ok('a sale needs an amount', /Enter what it sold for/.test(await err(seller, 'dt_log_sale', { p: { title: 'Thing' } })));
r = await call(owner, 'dt_log_sale', { p: { title: 'Thrifted denim jacket', amount_cents: 4500, cost_cents: 800, channel: 'in person', buyer_name: 'Neighbor' } });
ok('the owner logs a one-off that was never listed', !!r.sale_id);
ok('buyers can’t log sales', /Only shop staff/.test(await err(buyer, 'dt_log_sale', { p: { title: 'x', amount_cents: 1 } })));

// an online purchase, then payment
const bought = await call(buyer, 'dt_buy', { p_id: cap.id });
const capSale = await su1('select id from dt_sales where listing_id = $1', [cap.id]);
ok('online purchases wait for payment', (await su1('select status from dt_sales where id = $1', [capSale])) === 'awaiting payment' && bought.quantity === 1);
await call(seller, 'dt_sale_status', { p_id: capSale, p_status: 'paid' });
ok('marking it paid tells the buyer', (await call(buyer, 'dt_me')).notices.some(n => n.kind === 'paid' && /Dad cap/.test(n.title)));
ok('unknown statuses are refused', /Unknown status/.test(await err(seller, 'dt_sale_status', { p_id: capSale, p_status: 'shipped!' })));

// cancelling puts the item back
const cancelMe = (await call(seller, 'dt_log_sale', { p: { listing_id: cap.id, amount_cents: 2500 } })).sale_id;
ok('the last cap sold out', (await su1('select status from dt_listings where id = $1', [cap.id])) === 'sold');
await call(owner, 'dt_sale_status', { p_id: cancelMe, p_status: 'cancelled' });
ok('cancelling a sale puts the item back on sale', (await su1(`select status||' '||quantity from dt_listings where id = $1`, [cap.id])) === 'live 1');
ok('cancelled stays cancelled', /stay cancelled/.test(await err(owner, 'dt_sale_status', { p_id: cancelMe, p_status: 'paid' })));

// yesterday's sale, for the chart
await su(`insert into dt_sales (title, qty, amount_cents, channel, how, seller_id, status, at) values ('Tote bag', 1, 2000, 'in person', 'manual', $1, 'paid', now() - interval '1 day')`, [owner.id]);

// the dashboard
const d = await call(owner, 'dt_dashboard', { p_days: 30 });
const T = d.totals;
ok('today: 5500 + 4500 + 2500 (cancelled doesn’t count)', T.today === 12500, T);
ok('this week and month include yesterday', T.week === 14500 && T.month === 14500 && T.all === 14500);
ok('counts, units, and profit where cost is known', T.period_count === 4 && T.period_units === 5 && T.period_profit === (5500 - 2000) + (4500 - 800), T);
ok('nothing awaiting payment once it’s paid', T.awaiting === 0 && T.awaiting_count === 0);
ok('the chart has one point per day, ending today', d.series.length === 30 && d.series[29].cents === 12500 && d.series[28].cents === 2000 && d.series[29].day === d.today);
const by = Object.fromEntries(d.sellers.map(s => [s.name, s]));
ok('per seller: Sam, the owner, and the online store', by['Sam Seller'].cents === 5500 && by['Sam Seller'].units === 2 && by['Online store'].cents === 2500 && d.sellers.length === 3, d.sellers);
ok('best sellers lead with the most revenue', d.best[0].title === 'Downtime tee' && d.best[0].cents === 5500 && d.best[0].units === 2 && d.best[0].line === 'custom', d.best);
ok('stock: the cap is low (1 left, threshold 2)', d.stock.low.some(x => x.title === 'Dad cap' && x.quantity === 1) && !d.stock.low.some(x => x.title === 'Downtime tee'));
ok('stock counts live listings by kind', d.stock.live_fixed >= 2 && typeof d.stock.live_auctions === 'number');
ok('a shorter window still has today', (await call(owner, 'dt_dashboard', { p_days: 7 })).series.length === 7);

// the sales list
const list = await call(seller, 'dt_sales_list', { p_days: 30 });
ok('the sales list shows every sale, newest first, with who sold it', list.length === 5 && list[list.length - 1].title === 'Tote bag' && list.some(s => s.seller === 'Online store' && s.buyer_email === buyer.email));

// the shop's time zone decides what "today" is
await call(owner, 'dt_save_shop', { p: { tz: 'Pacific/Kiritimati' } });
ok('shop time zone can be changed (and bad ones refused)', (await call(owner, 'dt_shop_admin')).tz === 'Pacific/Kiritimati' && /Unknown time zone/.test(await err(owner, 'dt_save_shop', { p: { tz: 'Mars/Base' } })));
await call(owner, 'dt_save_shop', { p: { tz: 'America/New_York' } });

await done();
