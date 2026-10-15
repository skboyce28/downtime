// The shop as a buyer sees it on a phone: browsing without an account, filters, countdowns, an item's
// page, being asked to sign in to bid, bidding (too low, OK, outbid by someone else), the late-bid
// extension, buying fixed-price stock and Buy It Now, and the Yours tab (notices, bids, purchases).
import { phone, account, signIn, settle, txt, toastText, closeSheets, errs, finish, ok, done, su, call, inMinutes, OUT } from './support/phone.mjs';
import { shopStaff } from './support/db.mjs';

await su(`update dt_listings set status = 'withdrawn' where status = 'live'`);
await su(`update dt_shop set about = 'Small-batch goods for your off hours. Custom pieces, one-offs, and good finds.', payment_note = 'We''ll send a PayPal or Venmo request within a day.' where id = 1`);
const { seller } = await shopStaff();
const mk = async p => { const l = await call(seller, 'dt_save_listing', { p }); return call(seller, 'dt_publish', { p_id: l.id }); };
const hoodie = await mk({ title: 'Sunset hoodie', kind: 'auction', start_cents: 3000, reserve_cents: 4000, ends_at: inMinutes(180), line: 'custom', description: 'Heavyweight fleece, hand-printed.\nSize L.' });
const mug = await mk({ title: 'Speckled camp mug', kind: 'auction', start_cents: 1200, buy_now_cents: 3000, ends_at: inMinutes(50), line: 'one-off' });
const tee = await mk({ title: 'Off-hours tee', kind: 'fixed', price_cents: 2800, quantity: 3, line: 'custom' });
const jacket = await mk({ title: 'Vintage chore jacket', kind: 'fixed', price_cents: 6500, quantity: 1, line: 'resale' });

// --- browsing without an account
const A = await phone('ann');
ok('the shop opens without signing in', /Small-batch goods/.test(await txt(A, '#about')) && (await A.$$('#grid .card')).length === 4);
ok('the brand and tagline show', /downtime/.test(await txt(A, '.brand')) && /goods by SB\.co/.test(await txt(A, '#tagline')));
ok('auctions show the starting bid and time left; fixed show price and stock',
  /\$30 starting bid/.test(await txt(A, `.card[data-id="${hoodie.id}"]`)) && /2h 5\dm left|2h 59m left|3h 0m left/.test(await txt(A, `.card[data-id="${hoodie.id}"] .left`)) &&
  /\$28 3 left/.test(await txt(A, `.card[data-id="${tee.id}"]`)), await txt(A, `.card[data-id="${hoodie.id}"]`));
ok('auctions ending within the hour are highlighted', await A.$eval(`.card[data-id="${mug.id}"] .left`, e => e.classList.contains('soon')));
ok('one-offs and resale are tagged', /One-off/.test(await txt(A, `.card[data-id="${mug.id}"]`)) && /Resale/.test(await txt(A, `.card[data-id="${jacket.id}"]`)));
await A.screenshot({ path: OUT + 'shop.png' });
await A.click('#chips [data-f=auction]'); ok('the Auctions filter shows only auctions', (await A.$$('#grid .card')).length === 2);
await A.click('#chips [data-f=resale]'); ok('the Resale filter shows the jacket', (await A.$$('#grid .card')).length === 1 && /chore jacket/.test(await txt(A, '#grid')));
await A.click('#chips [data-f=all]');
const t0 = await txt(A, `.card[data-id="${mug.id}"] .left`); await A.waitForTimeout(2100);
ok('countdowns tick down on their own', t0 !== await txt(A, `.card[data-id="${mug.id}"] .left`), t0);

// --- an auction's page, and being asked to sign in
await A.click(`.card[data-id="${hoodie.id}"]`); await A.waitForSelector('#bidAmt');
ok('the item page shows the description, starting bid, reserve status, and end time',
  /Heavyweight fleece/.test(await txt(A, '#itBody')) && /\$30/.test(await txt(A, '#itBody .big')) && /Reserve not met/.test(await txt(A, '#itBody')) && /ends /.test(await txt(A, '#itBody .clock')));
ok('bidding rules are spelled out next to the button', /Bids are binding/.test(await txt(A, '#itBody')) && /last 2 minutes adds time/.test(await txt(A, '#itBody')));
await A.fill('#bidAmt', '35'); await A.click('#bidGo');
ok('bidding without an account asks you to sign in first', await A.isVisible('#authSheet.open') && /Sign in to bid/.test(await txt(A, '#aWhy')));
const ann = await account('ann'), ben = await account('ben');
await A.fill('#aEmail', ann.email); await A.fill('#aPass', 'longenough1'); await A.click('#aGo'); await A.waitForSelector('#authSheet:not(.open)', { state: 'attached' }); await settle(A, 900);
ok('after signing in you’re back on the item, still able to bid', await A.isVisible('#itemSheet.open') && await A.isVisible('#bidGo'));
ok('signed in: the tabs change to Shop, Yours, Account', (await A.$$eval('#tabs button', b => b.map(x => x.dataset.tab))).join() === 'shop,mine,account');

// --- bidding
await A.fill('#bidAmt', '25'); await A.click('#bidGo');
ok('a bid under the minimum is refused on the phone', /Bid at least \$30\.00/.test(await toastText(A, /Bid at least \$30\.00/)));
await A.fill('#bidAmt', '30'); await A.click('#bidGo'); await settle(A, 900);
ok('a valid bid goes through', /Bid placed/.test(await toastText(A, /Bid placed/)) && /You’re the high bidder/.test(await txt(A, '#itBody')) && /1 bid/.test(await txt(A, '#itBody')));
ok('the bid history shows "You"', /You .*\$30\.00/.test(await txt(A, '#itBody .bids')));
await A.screenshot({ path: OUT + 'item-auction.png' });

const B = await phone('ben'); await signIn(B, ben);
await B.click(`.card[data-id="${hoodie.id}"]`); await B.waitForSelector('#bidAmt');
ok('another buyer sees the current high bid and the next minimum', /\$30/.test(await txt(B, '#itBody .big')) && (await B.getAttribute('#bidAmt', 'placeholder')) === '32 or more' && /a•••/i.test(await txt(B, '#itBody .bids')), [await B.getAttribute('#bidAmt', 'placeholder'), await txt(B, '#itBody .bids')]);
await B.fill('#bidAmt', '41'); await B.click('#bidGo'); await settle(B, 900);
ok('they outbid, and the reserve is now met', /You’re the high bidder/.test(await txt(B, '#itBody')) && /Reserve met/.test(await txt(B, '#itBody')));
await A.waitForTimeout(5600);
ok('the first buyer’s open page updates on its own: outbid', /You’ve been outbid/.test(await txt(A, '#itBody')) && /\$41/.test(await txt(A, '#itBody .big')));
await closeSheets(A);
await A.click('#tabs [data-tab=mine]'); await settle(A, 900);
ok('Yours shows the outbid notice and the bid as outbid', /You.ve been outbid on Sunset hoodie/.test(await txt(A, '#notices')) && /Outbid/.test(await txt(A, '#myBids')) && /Your top bid \$30\.00/.test(await txt(A, '#myBids')));
ok('opening Yours clears the badge', !(await A.isVisible('#tabs .dot')));
await A.screenshot({ path: OUT + 'yours.png' });

// --- a late bid adds time
await su(`update dt_listings set ends_at = now() + interval '40 seconds' where id = $1`, [hoodie.id]);
await A.click('#tabs [data-tab=shop]'); await settle(A); await A.click(`.card[data-id="${hoodie.id}"]`); await A.waitForSelector('#bidAmt');
await A.fill('#bidAmt', '43'); await A.click('#bidGo');
ok('a bid in the last 2 minutes says the clock got more time', /clock got a little more time/.test(await toastText(A, /clock got a little more time/)) && /^[12]m \d+s left$/.test(await txt(A, '#itClock')), await txt(A, '#itClock'));
await closeSheets(A);

// --- buying fixed-price stock
await A.click(`.card[data-id="${tee.id}"]`); await A.waitForSelector('#buyGo');
await A.fill('#buyQty', '2'); await A.click('#buyGo');
ok('buying asks to confirm, with the total', /Off-hours tee ×2 for \$56\.00/.test(await txt(A, '#cfBody')));
await A.click('#cfYes'); await settle(A, 900);
ok('bought: the shop’s payment note is shown', /It’s yours\. We.ll send a PayPal or Venmo request/.test(await toastText(A, /It’s yours\. We.ll send a PayPal or Venmo request/)) && /1 available/.test(await txt(A, '#itBody')));
await closeSheets(A);

// --- Buy It Now (before anyone bids)
await closeSheets(B); await B.click('#tabs [data-tab=shop]'); await settle(B);
await B.click(`.card[data-id="${mug.id}"]`); await B.waitForSelector('#buyNowGo');
await B.click('#buyNowGo'); await B.click('#cfYes'); await settle(B, 900);
ok('Buy It Now sells it on the spot', /Sold for \$30/.test(await txt(B, '#itBody .big')) && /You got this one/.test(await txt(B, '#itBody')));
await closeSheets(B); await B.click('#tabs [data-tab=shop]'); await settle(B, 900);
ok('it moves to Recently sold', !(await B.$(`#grid .card[data-id="${mug.id}"]`)) && !!(await B.$(`#soldGrid .card[data-id="${mug.id}"]`)));
await B.click('#tabs [data-tab=mine]'); await settle(B, 900);
ok('Yours lists it as awaiting payment, with how to pay', /Speckled camp mug/.test(await txt(B, '#myBuys')) && /Awaiting payment/.test(await txt(B, '#myBuys')) && /PayPal or Venmo/.test(await txt(B, '#payNote')));

// --- the auction ends: the winner finds out
await su(`update dt_listings set ends_at = now() - interval '1 second' where id = $1`, [hoodie.id]);
await A.click('#tabs [data-tab=shop]'); await settle(A, 900);
await A.click('#tabs [data-tab=mine]'); await settle(A, 900);
ok('the winner gets a notice with the price and payment note', /You won Sunset hoodie for \$43\.00/.test(await txt(A, '#notices')) && /Won/.test(await txt(A, '#myBids')));
ok('and it’s under Bought and won', /Sunset hoodie/.test(await txt(A, '#myBuys')) && /Off-hours tee ×2/.test(await txt(A, '#myBuys')));
await A.click('#tabs [data-tab=shop]'); await settle(A, 900);
ok('in Recently sold, the winner’s card says they got it (not “winning”)', /You got it/.test(await txt(A, `#soldGrid .card[data-id="${hoodie.id}"]`)) && !/winning/.test(await txt(A, '#soldGrid')));
await B.click('#tabs [data-tab=shop]'); await B.click('#tabs [data-tab=mine]'); await settle(B, 900);
ok('the other bidder is told it ended', /Bidding ended on Sunset hoodie/.test(await txt(B, '#notices')));

// --- dark mode, and the page at desktop width
await A.click('#tabs [data-tab=account]'); await settle(A); await A.click('#acTheme'); await A.click('#tabs [data-tab=shop]'); await settle(A);
ok('dark mode switches and sticks', await A.evaluate(() => document.documentElement.dataset.theme === 'dark' && localStorage.getItem('dt-theme') === '"dark"'));
await A.screenshot({ path: OUT + 'shop-dark.png' });
const W = await phone('wide', { viewport: { width: 1280, height: 900 } });
ok('on a wide screen the grid has 4 columns', await W.$eval('#grid', g => getComputedStyle(g).gridTemplateColumns.split(' ').length) === 4);
ok('no sideways scrolling on a phone', await A.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

await finish(); await done(errs);
