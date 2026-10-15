// The back office on a phone: the owner signs in and gets the staff tabs, lists a fixed-price item with
// photos (shrunk on the phone, uploaded, shown in the shop), sets up an auction (and is told what's
// missing), takes a listing down, logs an event sale, moves a sale to paid, reads the dashboard,
// changes shop settings, and shares the staff key with a new seller.
import { phone, account, owner, signIn, settle, txt, toastText, closeSheets, photo, errs, finish, ok, done, su, su1, call, OUT, DB } from './support/phone.mjs';

await su(`update dt_listings set status = 'withdrawn' where status in ('live','sold')`); await su('delete from dt_sales');
const O = await phone('owner'), boss = await owner();
await signIn(O, boss);
ok('staff get the back office tabs', (await O.$$eval('#tabs button', b => b.map(x => x.dataset.tab))).join() === 'shop,listings,sales,dash,account');
ok('the header says they’re the owner', /Owner/.test(await txt(O, '#who')));

// --- a fixed-price listing with photos
await O.click('#tabs [data-tab=listings]'); await settle(O);
ok('no live listings yet: it says how to start', /Nothing live/.test(await txt(O, '#staffList')));
await O.click('#newListing');
await O.setInputFiles('#edFile', [await photo(O, '#d08a3a'), await photo(O, '#46568a')]); await O.waitForFunction(() => document.querySelectorAll('#edThumbs .thumb').length === 2, null, { timeout: 15000 });
ok('photos upload and show as thumbnails, the first marked as the cover', /Photos added/.test(await txt(O, '#edMsg')) && /Cover/.test(await txt(O, '#edThumbs')));
const objs = await su(`select name, metadata from storage.objects where bucket_id = 'listing-photos' order by created_at desc limit 2`);
ok('photos are stored under the listing’s folder as JPEGs, shrunk on the phone', objs.length === 2 && objs.every(o => /^listings\/[0-9a-f-]{36}\/[\w-]+\.jpg$/.test(o.name) && o.metadata.mimetype === 'image/jpeg' && o.metadata.size < 400000), objs);
await O.fill('#edTitle', 'Downtime logo tee'); await O.fill('#edDesc', 'Garment-dyed, relaxed fit.');
await O.fill('#edCat', 'Shirts'); await O.fill('#edPrice', '28'); await O.fill('#edQty', '6'); await O.fill('#edCost', '9.50');
await O.screenshot({ path: OUT + 'editor.png' });
await O.click('#edPublish'); await settle(O, 900);
ok('publish puts it in the shop', /Published/.test(await toastText(O, /Published/)) && /Downtime logo tee/.test(await txt(O, '#staffList')) && /\$28\.00 · 6 in stock/.test(await txt(O, '#staffList')));
const tee = (await su(`select * from dt_listings where title = 'Downtime logo tee' order by created_at desc limit 1`))[0];
ok('saved with the right price, stock, cost, category, and both photos', tee.price_cents === 2800 && tee.quantity === 6 && tee.cost_cents === 950 && tee.category === 'Shirts' && tee.photos.length === 2);

const V = await phone('visitor');
await V.waitForSelector(`.card[data-id="${tee.id}"] img`);
ok('visitors see the cover photo in the shop', await V.$eval(`.card[data-id="${tee.id}"] img`, i => i.complete && i.naturalWidth > 0));
await V.click(`.card[data-id="${tee.id}"]`); await V.waitForSelector('#gal img');
await V.waitForFunction(() => [...document.querySelectorAll('#gal img')].every(i => i.complete && i.naturalWidth > 0));
ok('the item page has both photos', (await V.$$('#gal img')).length === 2 && /2 photos/.test(await txt(V, '#itBody')));
const vurl = await V.$eval('#gal img', i => i.src);
ok('photos come from the public photo bucket', vurl.startsWith(DB + '/storage/v1/object/public/listing-photos/listings/'));
await V.screenshot({ path: OUT + 'item-photos.png' });
// someone who isn't staff can't upload
const nobody = await account('nobody');
const tk = await (await fetch(DB + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'sb_publishable_testkey_1234567890', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: nobody.email, password: 'longenough1' }) })).json();
const up = await fetch(DB + `/storage/v1/object/listing-photos/listings/${tee.id}/sneaky.jpg`, { method: 'POST', headers: { apikey: 'sb_publishable_testkey_1234567890', Authorization: 'Bearer ' + tk.access_token, 'Content-Type': 'image/jpeg' }, body: Buffer.from('x') });
ok('buyers can’t add photos to listings', up.status >= 400);

// --- an auction: the editor explains what's missing
await O.click('#newListing'); await O.fill('#edTitle', 'One-off painted denim jacket'); await O.click('#edKind [data-v=auction]'); await O.click('#edLine [data-v=one-off]');
await O.click('#edPublish'); await settle(O);
ok('publishing without a starting bid says so', /Set a starting bid/.test(await txt(O, '#edMsg')));
await O.fill('#edStart', '40'); await O.fill('#edReserve', '80'); await O.fill('#edBuyNow', '60');
await O.click('#edPublish'); await settle(O);
ok('Buy It Now below the reserve is explained', /Buy It Now has to be more/.test(await txt(O, '#edMsg')));
await O.fill('#edBuyNow', '150'); await O.fill('#edReserve', 'abc');
await O.click('#edPublish'); await settle(O);
ok('bad dollar amounts are caught before saving', /Check the dollar amounts/.test(await txt(O, '#edMsg')));
await O.fill('#edReserve', '80'); await O.click('#edPublish'); await settle(O, 900);
const jk = (await su(`select * from dt_listings where title = 'One-off painted denim jacket' order by created_at desc limit 1`))[0];
ok('the auction goes live, ending a week out at 8 pm by default', jk.status === 'live' && jk.start_cents === 4000 && jk.reserve_cents === 8000 && jk.buy_now_cents === 15000 && jk.line === 'one-off' &&
  Math.abs(new Date(jk.ends_at) - Date.now() - 7 * 864e5) < 864e5 && /^\d+d \d+h left$/.test(await txt(O, `#staffList [data-edit="${jk.id}"] [data-left]`)));

// --- edit, take down, delete
await O.click(`#staffList [data-edit="${jk.id}"]`); await O.waitForSelector('#edSheet.open');
ok('editing a live listing offers Save changes and Take down', await O.isVisible('#edSave') && await O.isVisible('#edDown') && !(await O.isVisible('#edPublish')));
await O.click('#edDown'); await O.click('#cfYes'); await settle(O, 900);
ok('taking it down moves it to Drafts', /Taken down/.test(await toastText(O, /Taken down/)) && (await su1('select status from dt_listings where id = $1', [jk.id])) === 'draft');
await O.click('#lsChips [data-lf=draft]'); await O.click(`#staffList [data-edit="${jk.id}"]`); await O.waitForSelector('#edSheet.open');
await O.click('#edDelete'); await O.click('#cfYes'); await settle(O, 900);
ok('a draft can be deleted', /Draft deleted/.test(await toastText(O, /Draft deleted/)) && (await su1('select count(*) from dt_listings where id = $1', [jk.id])) == 0);

// --- log an event sale of the tee
await O.click('#tabs [data-tab=sales]'); await settle(O);
ok('no sales yet: it says how sales get here', /Online sales appear on their own/.test(await txt(O, '#salesList')));
await O.click('#logSale'); await O.waitForSelector('#lsSheet.open');
await O.selectOption('#lsItem', tee.id); await O.fill('#lsQty', '2'); await O.dispatchEvent('#lsQty', 'input');
ok('picking a listed item fills in the total', (await O.inputValue('#lsAmt')) === '56' && await O.isHidden('#lsTitleRow'));
await O.fill('#lsAmt', '50'); await O.click('#lsChan [data-v=event]'); await O.fill('#lsEvent', 'Fall night market'); await O.fill('#lsBuyer', 'Rae');
await O.click('#lsGo'); await settle(O, 900);
ok('the sale is logged and listed', /Sale logged/.test(await toastText(O, /Sale logged/)) && /Downtime logo tee ×2/.test(await txt(O, '#salesList')) && /Fall night market/.test(await txt(O, '#salesList')) && /\$50\.00/.test(await txt(O, '#salesList')));
ok('stock came off the listing', (await su1('select quantity from dt_listings where id = $1', [tee.id])) === 4);

// --- an online purchase arrives; the owner marks it paid
const buyer = await account('buyer');
await call(buyer, 'dt_bootstrap'); await call(buyer, 'dt_buy', { p_id: tee.id, p_qty: 1 });
await O.click('#tabs [data-tab=shop]'); await O.click('#tabs [data-tab=sales]'); await settle(O, 1200);
ok('staff see a notice about the new sale', /bought Downtime logo tee for \$28\.00/.test(await txt(O, '#staffNotes')));
await O.click('#saleChips [data-sf="awaiting payment"]');
ok('the Awaiting payment filter shows it', (await O.$$('#salesList [data-sale]')).length === 1);
await O.click('#salesList [data-sale]'); await O.waitForSelector('#saleSheet.open');
ok('the sale shows the buyer and how to ask for payment', new RegExp('payment request .* \\$28\\.00 at ' + buyer.email.replace(/[.+]/g, '\\$&')).test(await txt(O, '#saBody')));
await O.click('#saBody [data-st=paid]'); await settle(O, 900);
ok('marked paid', /Marked paid/.test(await toastText(O, /Marked paid/)) && (await su1(`select status from dt_sales where buyer_id = $1`, [buyer.id])) === 'paid');
await O.click('#saleChips [data-sf=all]');
await O.screenshot({ path: OUT + 'sales.png' });

// --- dashboard
await O.click('#tabs [data-tab=dash]'); await settle(O, 1200);
ok('the dashboard shows today’s total', /\$78 Today/.test(await txt(O, '#dash .kpis')), await txt(O, '#dash .kpis'));
ok('the chart has a bar for each day, today highlighted', (await O.$$('#dash svg rect')).length === 30 && await O.$eval('#dash svg rect:last-of-type', r => r.getAttribute('fill') === 'var(--sun)' && +r.getAttribute('height') > 50));
ok('profit is shown when costs are known', /\$49\.50 profit|\$49 profit|\$49\.5 profit/.test(await txt(O, '#dash .chart')), await txt(O, '#dash .chart'));
ok('by seller: the owner’s event sale and the online store', /Online store/.test(await txt(O, '#dash')) && /\$50/.test(await txt(O, '#dash .grid2')));
ok('best sellers list the tee', /Downtime logo tee \$78 · 3 sold/.test(await txt(O, '#dash .grid2')));
await O.click('#dashDays [data-d="7"]'); await settle(O, 900);
ok('switching to 7 days redraws the chart', (await O.$$('#dash svg rect')).length === 7);
await O.screenshot({ path: OUT + 'dashboard.png', fullPage: true });

// --- shop settings and the share key
await O.click('#tabs [data-tab=account]'); await settle(O, 1200);
await O.fill('#shAbout', 'Things for your off hours.'); await O.fill('#shExt', '3'); await O.click('#shSave'); await settle(O, 900);
ok('the owner saves shop settings', /Shop settings saved/.test(await toastText(O, /Shop settings saved/)) && (await su1('select extend_minutes from dt_shop')) === 3);
await O.click('#tabs [data-tab=shop]'); await settle(O, 900);
ok('the shop shows the new about text', /Things for your off hours/.test(await txt(O, '#about')));
await O.click('#tabs [data-tab=account]'); await settle(O, 1200);
const key = await txt(O, '#shCode');
ok('the share key is shown to the owner', /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(key), key);

const S = await phone('seller'), sel = await account('sam');
await signIn(S, sel); await S.click('#tabs [data-tab=account]'); await settle(S);
await S.fill('#acKey', 'ZZZZ-ZZZZ'); await S.click('#acJoin');
ok('a wrong key is refused', /doesn.t match/.test(await toastText(S, /doesn.t match/)));
await S.fill('#acKey', key.toLowerCase().replace('-', '')); await S.click('#acJoin'); await settle(S, 900);
ok('the right key (any case, dash optional) joins the staff', /Welcome to the team/.test(await toastText(S, /Welcome to the team/)) && (await S.$$eval('#tabs button', b => b.length)) === 5);
await S.click('#tabs [data-tab=account]'); await settle(S, 1200);
ok('sellers see settings but can’t change them or see the key', /Only the owner can change these/.test(await txt(S, '#shopAdmin')) && !(await S.$('#shCode')) && await S.isDisabled('#shName'));
await O.click('#tabs [data-tab=shop]'); await O.click('#tabs [data-tab=account]'); await settle(O, 1200);
ok('the owner sees the new seller in the staff list', new RegExp(sel.email.replace(/[.+]/g, '\\$&')).test(await txt(O, '#shopAdmin')));
await su('update dt_shop set extend_minutes = 2');

await finish(); await done(errs);
