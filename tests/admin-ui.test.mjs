// The owner's Admin tab on a phone, and item links: what you're owed, not invoiced, overdue; marking
// an order invoiced and sending a reminder (the buyer sees both); searching customers and opening one;
// blocking and unblocking a buyer (who then sees a banner and can't check out); the overdue setting.
// Item links: Share copies the item's own address; opening that address goes straight to the item;
// closing it puts the address back.
import { phone, account, owner, signIn, settle, txt, toastText, closeSheets, errs, finish, ok, done, su, su1, call, SITE, OUT } from './support/phone.mjs';
import { shopStaff } from './support/db.mjs';

await su(`update dt_listings set status = 'withdrawn' where status in ('live','sold')`);
await su(`update dt_sales set status = 'cancelled' where status = 'awaiting payment'`);
const { seller } = await shopStaff();
const mk = async p => call(seller, 'dt_publish', { p_id: (await call(seller, 'dt_save_listing', { p })).id });
const tee = await mk({ title: 'Sunrise tee', kind: 'fixed', price_cents: 2800, quantity: 20, category: 'Shirts' });
const hat = await mk({ title: 'Trail hat', kind: 'fixed', price_cents: 3200, quantity: 20, category: 'Hats' });

// buyers: Ann has an old (overdue) order; Ben a new one
const ann = await account('ann'), ben = await account('ben');
await call(ann, 'dt_bootstrap'); await call(ann, 'dt_set_name', { p_name: 'Ann Reyes' }); await call(ben, 'dt_bootstrap'); await call(ben, 'dt_set_name', { p_name: 'Ben Ford' });
const o1 = await call(ann, 'dt_checkout', { p_items: [{ listing_id: tee.id, qty: 2 }, { listing_id: hat.id }] });
await su(`update dt_sales set at = now() - interval '6 days' where order_id = $1`, [o1.order_id]);
await call(ben, 'dt_checkout', { p_items: [{ listing_id: hat.id }] });

// --- the owner signs in (with the two-step code) and opens Admin
const O = await phone('owner'), boss = await owner(); await signIn(O, boss);
ok('after the code step the owner lands on Admin', await O.isVisible('#v-admin') && (await O.$$eval('#tabs button', b => b.map(x => x.dataset.tab))).includes('admin'));
await settle(O, 900);
const k = await txt(O, '#admin .kpis');
ok('Admin shows what you’re owed, not invoiced, and overdue', /\$120 Owed to you · 2 orders/.test(k) && /2 Not invoiced yet · \$120/.test(k) && /1 Overdue \(3\+ days\) · \$88/.test(k), k);
ok('waiting for payment lists the overdue order first, with what’s in it', /Ann Reyes/.test(await txt(O, '#adUnpaid .li >> nth=0')) && /Sunrise tee ×2/.test(await txt(O, '#adUnpaid .li >> nth=0')) && /Overdue/.test(await txt(O, '#adUnpaid .li >> nth=0')) && /6 days ago/.test(await txt(O, '#adUnpaid .li >> nth=0')));
await O.screenshot({ path: OUT + 'admin.png', fullPage: true });

// --- invoiced and a reminder
await O.click('#adUnpaid .li >> nth=0'); await O.waitForSelector('#saleSheet.open');
ok('the order says what to do next', /Send Ann Reyes a payment request .* \$88\.00/.test(await txt(O, '#saBody')) && await O.isVisible('#saBody [data-inv="1"]') && await O.isVisible('#saRemind'));
await O.click('#saBody [data-inv="1"]'); await settle(O, 1200);
ok('marked invoiced', /Marked invoiced/.test(await toastText(O, /Marked invoiced/)) && /1 Not invoiced yet · \$32/.test(await txt(O, '#admin .kpis')));
await O.click('#adUnpaid .li >> nth=0'); await O.waitForSelector('#saleSheet.open');
ok('the order now shows the invoiced date and can be undone', /Invoiced/.test(await txt(O, '#saBody')) && await O.isVisible('#saBody [data-inv="0"]'));
await O.click('#saRemind'); await settle(O, 1200);
ok('a reminder goes out', /Reminder sent/.test(await toastText(O, /Reminder sent/)) && /reminded/.test(await txt(O, '#adUnpaid .li >> nth=0')));
await O.click('#adUnpaid .li >> nth=0'); await O.waitForSelector('#saleSheet.open'); await O.click('#saRemind'); await settle(O, 600);
ok('a second reminder the same day is held back', /in the last day/.test(await toastText(O, /in the last day/)));
await closeSheets(O);

const A = await phone('ann'); await signIn(A, ann); await A.click('#tabs [data-tab=mine]'); await settle(A, 900);
ok('Ann sees the payment request and the reminder', /Payment request sent for your order \(\$88\.00\)/.test(await txt(A, '#notices')) && /Reminder: payment for your order/.test(await txt(A, '#notices')) && /Payment requested/.test(await txt(A, '#myBuys')));

// --- customers
await O.fill('#cq', 'ford'); await settle(O, 200);
ok('customer search narrows the list', (await O.$$('#adCust .li')).length === 1 && /Ben Ford/.test(await txt(O, '#adCust')) && /owes \$32\.00/.test(await txt(O, '#adCust')));
ok('typing keeps the cursor in the search box', await O.evaluate(() => document.activeElement.id === 'cq'));
await O.click('#adCust .li'); await O.waitForSelector('#custSheet.open'); await settle(O, 500);
ok('a customer shows their email, what they owe, and their orders', /Ben Ford/.test(await txt(O, '#cuHead')) && /\$32 Owes/.test(await txt(O, '#cuBody')) && /Trail hat/.test(await txt(O, '#cuBody')) && /Not invoiced/.test(await txt(O, '#cuBody')));
O.once('dialog', d => d.accept('Ordered and never paid'));
await O.click('#cuBlock'); await settle(O, 900);
ok('the owner blocks Ben, with a note', /Blocked from buying and bidding: Ordered and never paid/.test(await txt(O, '#cuBody')) && await O.isVisible('#cuUnblock'));
await O.screenshot({ path: OUT + 'admin-customer.png' });
const B = await phone('ben'); await signIn(B, ben); await settle(B, 600);
ok('Ben sees a banner saying his account can’t buy', /can’t buy or bid right now/.test(await txt(B, '#banner')));
await B.click(`.card[data-id="${tee.id}"]`); await B.waitForSelector('#addCart'); await B.click('#addCart'); await closeSheets(B);
await B.click('#cartBtn'); await B.waitForSelector('#checkout'); await B.click('#checkout'); await B.click('#cfYes'); await settle(B, 900);
ok('…and checkout is refused by the shop', /can.t buy or bid/.test(await txt(B, '#cartMsg')));
await O.click('#cuUnblock'); await settle(O, 900);
ok('unblocking gives him his account back', /Unblocked/.test(await toastText(O, /Unblocked/)) && !(await su1('select blocked from dt_profiles where user_id = $1', [ben.id])));
await closeSheets(O); await O.fill('#cq', ''); await settle(O, 200);
ok('the owner’s own account is listed as Owner', /Owner/.test(await txt(O, '#adCust')));
const shown = (await O.$$('#adCust .li')).length, total = await su1('select count(*)::int from auth.users');
ok('a long customer list shows 30 first, with Show all', total <= 30 ? shown === total : (shown === 30 && /Show all \d+ accounts/.test(await txt(O, '#cMore'))));
if (total > 30) { await O.click('#cMore'); await settle(O, 300); ok('Show all shows everyone', (await O.$$('#adCust .li')).length === total); }

// --- the overdue setting
await O.click('#tabs [data-tab=account]'); await settle(O, 1200);
await O.fill('#shOver', '10'); await O.click('#shSave'); await settle(O, 900);
await O.click('#tabs [data-tab=admin]'); await settle(O, 1200);
ok('with overdue at 10 days, nothing is overdue', /0 Overdue \(10\+ days\)/.test(await txt(O, '#admin .kpis')));
await O.click('#tabs [data-tab=sales]'); await settle(O, 1200);
ok('Sales labels unpaid orders Invoiced or Not invoiced', /Invoiced/.test(await txt(O, '#salesList')) && /Not invoiced/.test(await txt(O, '#salesList')));

// --- item links
const V = await phone('visitor', { permissions: ['clipboard-read', 'clipboard-write'] });
await V.evaluate(() => { try { delete Navigator.prototype.share; } catch (e) {} });   // a phone without a share menu: the link is copied
await V.click(`.card[data-id="${hat.id}"]`); await V.waitForSelector('#shareGo');
ok('opening an item puts its own link in the address bar', V.url() === `${SITE}/?item=${hat.id}`, V.url());
await V.click('#shareGo'); await settle(V, 400);
ok('Share copies the item’s link', /Link copied/.test(await toastText(V, /Link copied/)) && (await V.evaluate(() => navigator.clipboard.readText())) === `${SITE}/?item=${hat.id}`);
await V.click('#itemSheet [data-close].x'); await settle(V, 200);
ok('closing the item puts the shop’s address back', V.url() === `${SITE}/`);
const L = await phone('from-a-text'); await L.goto(`${SITE}/?item=${tee.id}`); await L.waitForSelector('#itemSheet.open #addCart', { timeout: 8000 });
ok('opening a shared link goes straight to that item', (await txt(L, '#itTitle')) === 'Sunrise tee');
const sh = await phone('with-share'); await sh.evaluate(() => { window.__shared = null; navigator.share = d => { window.__shared = d; return Promise.resolve(); }; });
await sh.click(`.card[data-id="${tee.id}"]`); await sh.waitForSelector('#shareGo'); await sh.click('#shareGo'); await settle(sh, 300);
const shared = await sh.evaluate(() => window.__shared);
ok('on a phone with a share menu, it opens with the title, price, and link', shared && shared.title === 'Sunrise tee' && /Sunrise tee · \$28 at Downtime/.test(shared.text) && shared.url === `${SITE}/?item=${tee.id}`, shared);

await su(`update dt_shop set overdue_days = 3 where id = 1`);
await finish(); await done(errs);
