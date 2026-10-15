// The store on a phone: sections built from categories, search, picking a size and color (sold-out
// options crossed out), adding to the cart (capped at what's in stock), the cart surviving a reload,
// checkout asking to sign in, one order for the whole cart, the order grouped in Yours and in Sales,
// a stale cart, sold-out items staying in their section, and the owner setting up sizes and colors
// in the editor and restocking a sold-out item.
import { phone, account, owner, signIn, settle, txt, toastText, closeSheets, errs, finish, ok, done, su, su1, call, OUT } from './support/phone.mjs';
import { shopStaff } from './support/db.mjs';

await su(`update dt_listings set status = 'withdrawn' where status in ('live','sold')`);
await su(`update dt_shop set payment_note = 'We''ll send a PayPal or Venmo request within a day.' where id = 1`);
const { seller } = await shopStaff();
const mk = async p => call(seller, 'dt_publish', { p_id: (await call(seller, 'dt_save_listing', { p })).id });
const tee = await mk({ title: 'Off-hours tee', kind: 'fixed', price_cents: 2800, category: 'Shirts', line: 'custom',
  variants: [{ size: 'S', color: 'Black', qty: 2 }, { size: 'M', color: 'Black', qty: 1 }, { size: 'M', color: 'Sand', qty: 0 }, { size: 'L', color: 'Sand', qty: 3 }] });
const cap = await mk({ title: 'Corduroy cap', kind: 'fixed', price_cents: 3200, quantity: 4, category: 'Hats', line: 'custom', description: 'Washed corduroy, brass buckle.' });
const shades = await mk({ title: 'Tortoise shades', kind: 'fixed', price_cents: 2200, quantity: 2, category: 'Sunglasses', line: 'custom' });
const lamp = await mk({ title: 'Brass desk lamp', kind: 'auction', start_cents: 1500, ends_at: new Date(Date.now() + 3 * 864e5).toISOString(), category: 'Odds & ends', line: 'resale' });
const mug = await mk({ title: 'Speckle mug', kind: 'fixed', price_cents: 1800, quantity: 1, category: 'Odds & ends', line: 'one-off' });
await call(seller, 'dt_log_sale', { p: { listing_id: mug.id, amount_cents: 1800 } });   // sold out before anyone looks

// --- sections and search
const A = await phone('ann');
const chips = await A.$$eval('#chips .chip', b => b.map(x => x.textContent));
ok('sections come from the categories in use, after Everything and Auctions', chips.slice(0, 2).join() === 'Everything,Auctions' && ['Shirts', 'Hats', 'Sunglasses', 'Odds & ends'].every(c => chips.includes(c)) && chips.includes('One-offs') && chips.includes('Resale'), chips);
ok('the sold-out mug stays in the shop, last and greyed', await A.$eval('#grid .card:last-child', c => c.classList.contains('sold') && /Speckle mug/.test(c.innerText) && /Sold out/.test(c.innerText)));
await A.click('#chips [data-f="cat:Odds & ends"]');
ok('a section shows only its items, sold-out included', (await A.$$('#grid .card')).length === 2 && /Brass desk lamp/.test(await txt(A, '#grid')) && /Speckle mug/.test(await txt(A, '#grid')));
await A.click('#chips [data-f=all]');
await A.fill('#q', 'corduroy');
ok('search finds words in the description too', (await A.$$('#grid .card')).length === 1 && /Corduroy cap/.test(await txt(A, '#grid')));
await A.fill('#q', 'sand');
ok('search finds colors', (await A.$$('#grid .card')).length === 1 && /Off-hours tee/.test(await txt(A, '#grid')));
await A.fill('#q', 'zebra');
ok('no match says so and how to fix it', /Nothing matches “zebra”/.test(await txt(A, '#grid')) && /clear the search/.test(await txt(A, '#grid')));
await A.fill('#q', '');
ok('the tee’s card shows its size range and colors', /S–L · 2 colors/.test(await txt(A, `.card[data-id="${tee.id}"]`)), await txt(A, `.card[data-id="${tee.id}"]`));
await A.screenshot({ path: OUT + 'store-sections.png' });

// --- picking a size and color
await A.click(`.card[data-id="${tee.id}"]`); await A.waitForSelector('#optSize');
ok('nothing picked yet: it asks for a size, buttons wait', /Pick a size/.test(await txt(A, '#stockNote')) && await A.isDisabled('#addCart'));
await A.click('#optSize [data-size=M]');
ok('after M, Sand is crossed out (M in Sand is sold out)', await A.$eval('#optColor [data-color=Sand]', b => b.classList.contains('out')) && !(await A.$eval('#optColor [data-color=Black]', b => b.classList.contains('out'))));
await A.click('#optColor [data-color=Black]');
ok('M / Black: only 1 left, and the buttons wake up', /Only 1 left/.test(await txt(A, '#stockNote')) && !(await A.isDisabled('#addCart')));
await A.screenshot({ path: OUT + 'store-options.png' });
await A.click('#addCart');
ok('added to the cart, with the count on the cart button', /Added to cart\. 1 in your cart/.test(await toastText(A, /Added to cart/)) && (await txt(A, '#cartN')) === '1');
ok('the last one is now in your cart, so you can’t add more', /1 in your cart/.test(await txt(A, '#stockNote')) && await A.isDisabled('#addCart'));
await A.click('#optSize [data-size=L]'); await A.click('#optColor [data-color=Sand]');
await A.fill('#buyQty', '2'); await A.click('#addCart'); await settle(A, 300);
await closeSheets(A);
await A.click(`.card[data-id="${cap.id}"]`); await A.waitForSelector('#addCart');
await A.click('#addCart'); await settle(A, 300); await closeSheets(A);
ok('three lines, four items in the cart', (await txt(A, '#cartN')) === '4');
await A.reload(); await A.waitForSelector('#grid .card'); await settle(A);
ok('the cart is still there after closing and reopening', (await txt(A, '#cartN')) === '4');

// --- the cart
await A.click('#cartBtn'); await A.waitForSelector('#checkout');
ok('the cart lists each item with its option and the total', /Off-hours tee M \/ Black/.test(await txt(A, '#cartList')) && /L \/ Sand/.test(await txt(A, '#cartList')) && (await txt(A, '#cartTotal')) === '$116.00', await txt(A, '#cartFoot'));
const plusM = await A.$$eval('#cartList [data-cp]', bs => bs.map(b => b.disabled));
ok('you can’t step past what’s in stock', plusM[0] === true && plusM[2] === false, plusM);
await A.click('#cartList [data-cm="1"]'); await settle(A, 200);
ok('minus takes one off the line and the total', (await txt(A, '#cartTotal')) === '$88.00');
await A.screenshot({ path: OUT + 'cart.png' });
await A.click('#checkout');
ok('checking out signed out asks to sign in first', await A.isVisible('#authSheet.open') && /Sign in to check out/.test(await txt(A, '#aWhy')));
const ann = await account('ann');
await A.fill('#aEmail', ann.email); await A.fill('#aPass', 'longenough1'); await A.click('#aGo');
await A.waitForSelector('#authSheet:not(.open)', { state: 'attached' }); await settle(A, 900);
await A.click('#checkout');
ok('it confirms the order total first', /3 items for \$88\.00/.test(await txt(A, '#cfBody')));
await A.click('#cfYes'); await settle(A, 1500);
ok('order placed: the payment note, an empty cart, and Yours opens', /Order placed\. We.ll send a PayPal or Venmo request/.test(await toastText(A, /Order placed/)) && await A.isHidden('#cartN') && await A.isVisible('#v-mine'));
ok('Yours shows one order with its items', /Order of 3 items/.test(await txt(A, '#myBuys')) && /Off-hours tee \(M \/ Black\), Off-hours tee \(L \/ Sand\), Corduroy cap/.test(await txt(A, '#myBuys')) && /\$88\.00/.test(await txt(A, '#myBuys')) && /Awaiting payment/.test(await txt(A, '#myBuys')));
const sales = await su(`select title, variant, qty, amount_cents, order_id from dt_sales where buyer_id = $1`, [ann.id]);
ok('the database has one order with three lines', sales.length === 3 && new Set(sales.map(x => x.order_id)).size === 1 && sales.some(x => x.variant === 'L / Sand' && x.qty === 1));
await A.screenshot({ path: OUT + 'yours-order.png' });

// --- a stale cart: someone else bought the shades first
await A.click('#tabs [data-tab=shop]'); await settle(A);
await A.click(`.card[data-id="${shades.id}"]`); await A.waitForSelector('#addCart'); await A.fill('#buyQty', '2'); await A.click('#addCart'); await settle(A, 300); await closeSheets(A);
const ben = await account('ben'); await call(ben, 'dt_bootstrap'); await call(ben, 'dt_checkout', { p_items: [{ listing_id: shades.id, qty: 1 }] });
await A.click('#cartBtn'); await settle(A, 1200);
ok('the cart notices only 1 is left and trims the line', (await txt(A, '#cartTotal')) === '$22.00' && (await A.$eval('#cartList .stepper span', e => e.textContent)) === '1');
await call(ben, 'dt_checkout', { p_items: [{ listing_id: shades.id, qty: 1 }] });
await A.click('#checkout'); await A.click('#cfYes'); await settle(A, 1200);
ok('checking out after it sold out says so, nothing is bought, and the cart shows why', /sold out|no longer available/.test(await txt(A, '#cartMsg')) && /Sold out/.test(await txt(A, '#cartList')) && (await su1(`select count(*) from dt_sales where buyer_id = $1 and title = 'Tortoise shades'`, [ann.id])) == 0, await txt(A, '#cartMsg'));
await A.click('#cartList [data-cx="0"]'); await settle(A, 200);
ok('removing the sold-out line empties the cart', /Your cart is empty/.test(await txt(A, '#cartList')));
await closeSheets(A);

// --- staff: the order in Sales, marking it paid
const O = await phone('owner'), boss = await owner(); await signIn(O, boss);
ok('staff don’t get a cart', await O.isHidden('#cartBtn'));
await O.click('#tabs [data-tab=sales]'); await settle(O, 1200);
ok('Sales shows the cart as one order of 3 items, $88', /Order of 3 items/.test(await txt(O, '#salesList')) && /\$88\.00/.test(await txt(O, '#salesList')));
await O.click('#salesList .li:has-text("Order of 3 items")'); await O.waitForSelector('#saleSheet.open');
ok('the order lists each line and asks for one payment of the total', /Off-hours tee \(M \/ Black\)/.test(await txt(O, '#saBody')) && /payment request .* \$88\.00/.test(await txt(O, '#saBody')));
await O.click('#saBody [data-st=paid]'); await settle(O, 900);
ok('marking it paid marks every line', (await su1(`select string_agg(distinct status, ',') from dt_sales where buyer_id = $1`, [ann.id])) === 'paid');

// --- the editor: sizes, colors, and a stock box for each
await O.click('#tabs [data-tab=listings]'); await settle(O); await O.click('#newListing');
await O.fill('#edTitle', 'Pocket tee'); await O.fill('#edPrice', '30'); await O.fill('#edCat', 'Shirts');
await O.fill('#edSizes', 'S, M, L'); await O.fill('#edColors', 'Olive, Black');
ok('sizes × colors makes a stock box for each, and hides How many', (await O.$$('#edStock [data-vk]')).length === 6 && await O.isHidden('#edQtyRow'));
await O.fill('#edStock [data-vk="M / Olive"]', '4'); await O.fill('#edStock [data-vk="L / Black"]', '2');
await O.fill('#edColors', 'Olive, Black, Rust');
ok('adding a color keeps the counts already typed', (await O.$$('#edStock [data-vk]')).length === 9 && (await O.inputValue('#edStock [data-vk="M / Olive"]')) === '4' && /Total 6 in stock/.test(await txt(O, '#edStock')));
await O.screenshot({ path: OUT + 'editor-options.png' });
await O.click('#edPublish'); await settle(O, 900);
const pt = (await su(`select * from dt_listings where title = 'Pocket tee' order by created_at desc limit 1`))[0];
ok('published with 9 options and 6 in stock', pt.status === 'live' && pt.variants.length === 9 && pt.quantity === 6 && pt.variants.find(v => v.id === 'm-olive').qty === 4, pt.variants);

// --- restocking the sold-out mug
await O.click('#lsChips [data-lf=ended]'); await O.click(`#staffList [data-edit="${mug.id}"]`); await O.waitForSelector('#edSheet.open');
ok('a sold-out item opens ready to restock', /Sold out\. Add stock/.test(await txt(O, '#edLocked')) && !(await O.isDisabled('#edQty')) && await O.isVisible('#edSave'));
await O.fill('#edQty', '3'); await O.click('#edSave'); await settle(O, 900);
ok('saving with stock puts it back on sale', (await su1('select status || \' \' || quantity from dt_listings where id = $1', [mug.id])) === 'live 3');

// --- logging an event sale of one size
await O.click('#tabs [data-tab=sales]'); await settle(O, 900); await O.click('#logSale'); await O.waitForSelector('#lsSheet.open');
await O.selectOption('#lsItem', pt.id);
ok('picking a listing with sizes asks which one, listing only those in stock', await O.isVisible('#lsVarRow') && (await O.$$('#lsVar option')).length === 2);
await O.selectOption('#lsVar', 'l-black'); await O.click('#lsGo'); await settle(O, 900);
ok('the event sale comes off that size', (await su1(`select (select v->>'qty' from jsonb_array_elements(variants) v where v->>'id' = 'l-black') from dt_listings where id = $1`, [pt.id])) === '1');

// --- the dashboard names the low size
await O.click('#tabs [data-tab=dash]'); await settle(O, 1200);
ok('low stock names sizes and colors', /Pocket tee \(L \/ Black\)/.test(await txt(O, '#dash')) && /Off-hours tee \(M \/ Black\)/.test(await txt(O, '#dash')));

await finish(); await done(errs);
