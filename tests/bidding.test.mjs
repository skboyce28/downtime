// Bidding and buying rules, checked directly against the database (the database is what enforces them):
// who can do what, minimum raises, the late-bid extension, reserve prices, Buy It Now, closing an
// auction (winner, sale, notices), two people bidding at the same moment, and fixed-price stock.
import { su, su1, account, call, err, ok, done, shopStaff, inMinutes } from './support/db.mjs';

const { owner, seller } = await shopStaff();
const ann = await account('ann'), ben = await account('ben'), cal = await account('cal'), dee = await account('dee');
for (const u of [ann, ben, cal, dee]) await call(u, 'dt_bootstrap');
await call(ann, 'dt_set_name', { p_name: 'Annabel' });

// --- who can call what
ok('anyone can open the storefront without signing in', !!(await call(null, 'dt_storefront')).shop);
ok('signed-out visitors can’t bid', /permission denied/.test(await err(null, 'dt_bid', { p_id: '00000000-0000-0000-0000-000000000000', p_cents: 100 })));
ok('buyers can’t reach the back office', /Only shop staff/.test(await err(ann, 'dt_staff_listings')) && /Only shop staff/.test(await err(ann, 'dt_dashboard')));
ok('the app can’t make anyone an owner (SQL Editor only)', /permission denied/.test(await err(ann, 'dt_make_owner', { p_email: ann.email })));
ok('tables can’t be read directly, only through the functions',
  (await su1(`select count(*) from pg_policies where schemaname = 'public' and tablename like 'dt\\_%'`)) == 0 &&
  (await su1(`select bool_and(relrowsecurity) from pg_class where relname like 'dt\\_%' and relkind = 'r'`)) === true);

// --- listing an auction
const draft = await call(seller, 'dt_save_listing', { p: { title: 'Hand-dyed hoodie', kind: 'auction', start_cents: 2000, reserve_cents: 1500, ends_at: inMinutes(60) } });
ok('a seller can save an auction draft', draft.status === 'draft' && draft.kind === 'auction');
ok('reserve below the starting bid is refused', /reserve can’t be below|reserve can't be below/.test(await err(seller, 'dt_publish', { p_id: draft.id })));
await call(seller, 'dt_save_listing', { p: { id: draft.id, title: 'Hand-dyed hoodie', kind: 'auction', start_cents: 2000, reserve_cents: 5000, buy_now_cents: 4000, ends_at: inMinutes(60) } });
ok('Buy It Now at or below the reserve is refused', /Buy It Now has to be more/.test(await err(seller, 'dt_publish', { p_id: draft.id })));
await call(seller, 'dt_save_listing', { p: { id: draft.id, title: 'Hand-dyed hoodie', kind: 'auction', start_cents: 2000, reserve_cents: 5000, buy_now_cents: 9000, ends_at: inMinutes(5) } });
ok('an end time less than 10 minutes away is refused', /at least 10 minutes/.test(await err(seller, 'dt_publish', { p_id: draft.id })));
ok('unexpected photo names are refused', /Unexpected photo name/.test(await err(seller, 'dt_save_listing', { p: { id: draft.id, photos: ['../../etc/passwd'] } })));
ok('drafts are hidden from shoppers', /isn.t available/.test(await err(ann, 'dt_listing', { p_id: draft.id })) && !(await call(null, 'dt_storefront')).live.some(l => l.id === draft.id));
await call(seller, 'dt_save_listing', { p: { id: draft.id, title: 'Hand-dyed hoodie', kind: 'auction', start_cents: 2000, reserve_cents: 5000, buy_now_cents: 9000, ends_at: inMinutes(60), cost_cents: 1200 } });
const live = await call(seller, 'dt_publish', { p_id: draft.id });
const pub = (await call(null, 'dt_storefront')).live.find(l => l.id === draft.id);
ok('published auctions show on the storefront', live.status === 'live' && !!pub);
ok('the public never sees the reserve amount or cost', !('reserve_cents' in pub) && !('cost_cents' in pub) && !JSON.stringify(pub).includes('5000') && pub.has_reserve && !pub.reserve_met, pub);
ok('Buy It Now shows before any bids', pub.buy_now_open && pub.buy_now_cents === 9000 && pub.min_next === 2000);

// --- bidding
ok('a bid below the starting bid is refused', /Bid at least \$20\.00/.test(await err(ann, 'dt_bid', { p_id: draft.id, p_cents: 1999 })));
let v = await call(ann, 'dt_bid', { p_id: draft.id, p_cents: 2000 });
ok('the first bid can be exactly the starting bid', v.high_cents === 2000 && v.bid_count === 1 && v.you_high && v.min_next === 2100, v);
ok('Buy It Now disappears after the first bid', !v.buy_now_open && v.buy_now_cents == null && /Buy It Now is gone/.test(await err(ben, 'dt_buy', { p_id: draft.id })));
ok('you can’t outbid yourself', /already the high bidder/.test(await err(ann, 'dt_bid', { p_id: draft.id, p_cents: 2500 })));
ok('a raise smaller than the increment is refused', /Bid at least \$21\.00/.test(await err(ben, 'dt_bid', { p_id: draft.id, p_cents: 2050 })));
ok('shop staff can’t bid on shop items', /staff can.t bid/.test(await err(seller, 'dt_bid', { p_id: draft.id, p_cents: 3000 })));
v = await call(ben, 'dt_bid', { p_id: draft.id, p_cents: 2100 });
ok('the next bid at the minimum raise works', v.high_cents === 2100 && v.you_high && !v.extended);
const annMe = await call(ann, 'dt_me');
ok('the person outbid gets a notice', annMe.notices.some(n => n.kind === 'outbid' && /Hand-dyed hoodie/.test(n.title) && /\$21\.00/.test(n.body)) && annMe.unread >= 1);
ok('their bids list shows they’re no longer winning', annMe.bids.some(b => b.id === draft.id && !b.you_high && b.my_top === 2000));
const pubBids = (await call(null, 'dt_listing', { p_id: draft.id })).bids, staffBids = (await call(owner, 'dt_listing', { p_id: draft.id })).bids;
ok('bidders show masked to the public, in full to staff', pubBids.some(b => b.name === 'A•••l') && !JSON.stringify(pubBids).includes('Annabel') && staffBids.some(b => b.name === 'Annabel'), pubBids);
ok('increments step up with the price', (await su1('select array[public.dt_increment(1000),public.dt_increment(2500),public.dt_increment(10000),public.dt_increment(25000),public.dt_increment(100000)]::text')) === '{100,200,500,1000,2500}');

// --- two people bidding the same amount at the same moment: exactly one wins
const both = await Promise.allSettled([call(cal, 'dt_bid', { p_id: draft.id, p_cents: 2200 }), call(dee, 'dt_bid', { p_id: draft.id, p_cents: 2200 })]);
const won = both.filter(r => r.status === 'fulfilled').length, lost = both.filter(r => r.status === 'rejected');
ok('simultaneous equal bids: exactly one is accepted', won === 1 && lost.length === 1 && /Bid at least \$23\.00/.test(lost[0].reason.message), both.map(r => r.status + ' ' + (r.reason ? r.reason.message : '')));
ok('the database has one high bid at that amount', (await su1('select count(*) from dt_bids where listing_id = $1 and amount_cents = 2200', [draft.id])) == 1);

// --- a late bid extends the auction
await su(`update dt_listings set ends_at = now() + interval '30 seconds' where id = $1`, [draft.id]);
const lateBidder = both[0].status === 'fulfilled' ? dee : cal;
v = await call(lateBidder, 'dt_bid', { p_id: draft.id, p_cents: 5200 });
const left = (new Date(v.ends_at) - new Date(v.now)) / 1000;
ok('a bid in the last 2 minutes pushes the end out to 2 minutes from now', v.extended && left > 110 && left <= 121, left);
ok('reserve shows as met once a bid reaches it', v.reserve_met);

// --- closing: sold at auction
await su(`update dt_listings set ends_at = now() - interval '1 second' where id = $1`, [draft.id]);
ok('a bid after the end is turned away (and the auction closes)', /Bidding has ended/.test((await call(ann, 'dt_bid', { p_id: draft.id, p_cents: 9999 })).problem || ''));
const closed = await call(owner, 'dt_listing', { p_id: draft.id });
ok('the high bidder wins at their bid', closed.status === 'sold' && closed.final_cents === 5200 && closed.winner_email === lateBidder.email, closed.status);
const sale = (await su('select * from dt_sales where listing_id = $1', [draft.id]))[0];
ok('a sale is recorded, awaiting payment, with the cost for profit', sale && sale.how === 'auction' && sale.amount_cents === 5200 && sale.status === 'awaiting payment' && sale.cost_cents === 1200 && sale.buyer_email === lateBidder.email);
const winMe = await call(lateBidder, 'dt_me'), annMe2 = await call(ann, 'dt_me'), ownMe = await call(owner, 'dt_me');
ok('the winner is told, with the shop’s payment note', winMe.notices.some(n => n.kind === 'won' && /\$52\.00/.test(n.title) && /arrange payment/.test(n.body)) && winMe.purchases.some(p => p.listing_id === draft.id && p.status === 'awaiting payment'));
ok('other bidders are told someone else won', annMe2.notices.some(n => n.kind === 'lost' && n.listing_id === draft.id));
ok('staff are told it sold', ownMe.notices.some(n => n.kind === 'sold' && /sold at auction for \$52\.00/.test(n.title)));
ok('sold items stay on the storefront under Recently sold', (await call(null, 'dt_storefront')).sold.some(l => l.id === draft.id && l.final_cents === 5200));

// --- closing: reserve not met
const r2 = await call(seller, 'dt_save_listing', { p: { title: 'Vintage enamel mug', kind: 'auction', start_cents: 500, reserve_cents: 3000, ends_at: inMinutes(30) } });
await call(seller, 'dt_publish', { p_id: r2.id });
await call(ben, 'dt_bid', { p_id: r2.id, p_cents: 900 });
await su(`update dt_listings set ends_at = now() - interval '1 second' where id = $1`, [r2.id]);
ok('the store closes due auctions when someone opens it', (await call(null, 'dt_storefront')) && (await su1('select status from dt_listings where id = $1', [r2.id])) === 'unsold');
ok('reserve not met: no sale, and both sides are told', (await su1('select count(*) from dt_sales where listing_id = $1', [r2.id])) == 0 &&
  (await call(ben, 'dt_me')).notices.some(n => n.kind === 'reserve' && n.listing_id === r2.id) &&
  (await call(owner, 'dt_me')).notices.some(n => n.kind === 'unsold' && /reserve wasn.t met/.test(n.body)));
const re = await call(seller, 'dt_relist', { p_id: r2.id });
ok('an unsold item can be relisted as a fresh draft', re.status === 'draft' && re.title === 'Vintage enamel mug' && re.bid_count === 0 && re.id !== r2.id);

// --- Buy It Now
const bn = await call(seller, 'dt_save_listing', { p: { title: 'Patch set', kind: 'auction', start_cents: 1000, buy_now_cents: 2500, ends_at: inMinutes(120) } });
await call(seller, 'dt_publish', { p_id: bn.id });
const got = await call(cal, 'dt_buy', { p_id: bn.id });
ok('Buy It Now ends the auction and sells it at that price', got.status === 'sold' && got.final_cents === 2500 && got.you_won && got.paid_cents === 2500);
ok('…and records a "buy now" sale', (await su1(`select how from dt_sales where listing_id = $1`, [bn.id])) === 'buy now');
ok('nobody can bid after that', /isn.t open for bids/.test(await err(dee, 'dt_bid', { p_id: bn.id, p_cents: 3000 })));

// --- withdrawing and editing
const w = await call(seller, 'dt_save_listing', { p: { title: 'Sticker pack', kind: 'auction', start_cents: 300, ends_at: inMinutes(90) } });
await call(seller, 'dt_publish', { p_id: w.id }); await call(ann, 'dt_bid', { p_id: w.id, p_cents: 300 });
ok('an auction with bids can’t be taken down', /has bids/.test(await err(seller, 'dt_withdraw', { p_id: w.id })));
const ed = await call(seller, 'dt_save_listing', { p: { id: w.id, title: 'Sticker pack (10)', kind: 'auction', start_cents: 100, ends_at: inMinutes(5) } });
ok('after bids, only the wording changes (price and end time stay put)', ed.title === 'Sticker pack (10)' && ed.start_cents === 300 && Math.abs(new Date(ed.ends_at) - Date.now() - 90 * 60000) < 120000);

// --- fixed price with stock
const fx = await call(seller, 'dt_save_listing', { p: { title: 'Logo tee', kind: 'fixed', price_cents: 2800, quantity: 3, cost_cents: 900 } });
await call(seller, 'dt_publish', { p_id: fx.id });
v = await call(ann, 'dt_buy', { p_id: fx.id, p_qty: 2 });
ok('buying 2 of 3 leaves 1', v.quantity === 1 && v.status === 'live' && v.paid_cents === 5600);
ok('can’t buy more than is left', /Only 1 left/.test(await err(ben, 'dt_buy', { p_id: fx.id, p_qty: 2 })));
v = await call(ben, 'dt_buy', { p_id: fx.id, p_qty: 1 });
ok('the last one sells it out', v.quantity === 0 && v.status === 'sold');
ok('sold out: no more buying', /no longer available/.test(await err(dee, 'dt_buy', { p_id: fx.id })));
const cnt = await su1(`select count(*) from dt_sales where listing_id = $1`, [fx.id]);
ok('each purchase is its own sale', cnt == 2);

// a buyer can only have 5 purchases waiting for payment
const many = await call(seller, 'dt_save_listing', { p: { title: 'Button', kind: 'fixed', price_cents: 100, quantity: 50 } });
await call(seller, 'dt_publish', { p_id: many.id });
for (let i = 0; i < 4; i++) await call(dee, 'dt_buy', { p_id: many.id });
const deeWaiting = await su1(`select count(*) from dt_sales where buyer_id = $1 and status = 'awaiting payment'`, [dee.id]);
ok('a buyer can’t pile up more than 5 unpaid purchases', deeWaiting == 5 && /5 purchases waiting/.test(await err(dee, 'dt_buy', { p_id: many.id })), deeWaiting);

// --- staff share key
ok('a wrong share key is refused politely', /doesn.t match/.test((await call(dee, 'dt_join_staff', { p_code: 'AAAA-AAAA' })).problem));
ok('someone who has bid can’t become staff', /can.t become staff/.test(await err(ann, 'dt_join_staff', { p_code: await su1('select join_code from dt_shop') })));
const guess = await account('guess');
for (let i = 0; i < 10; i++) await call(guess, 'dt_join_staff', { p_code: 'ZZZZ-ZZZZ' });
ok('after 10 wrong keys in an hour, even the right one waits', /Too many wrong keys/.test(await err(guess, 'dt_join_staff', { p_code: await su1('select join_code from dt_shop') })));
ok('only the owner sees the share key', !!(await call(owner, 'dt_shop_admin')).join_code && (await call(seller, 'dt_shop_admin')).join_code == null);
ok('only the owner changes shop settings', /Only the shop owner/.test(await err(seller, 'dt_save_shop', { p: { name: 'X' } })));

await done();
