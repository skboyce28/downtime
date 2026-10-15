// Accounts on a phone: creating one (the email has to be confirmed before you can sign in), the
// confirmation link signing you in with the name you chose, signing out and back in, a forgotten
// password (reset link, new password), and wrong passwords.
import { phone, settle, txt, toastText, errs, finish, ok, done, su1, sfx, SITE, DB } from './support/phone.mjs';

const P = await phone('new');
const email = `rae-${sfx}@example.com`;
await P.click('#signInTop');
ok('sign in is one tap from the top of the shop', await P.isVisible('#authSheet.open'));
await P.fill('#aEmail', 'quick@example.com'); await P.fill('#aPass', 'typedfast1'); await P.waitForTimeout(400);
ok('typing straight away lands in the right boxes (the sheet doesn’t steal focus)', (await P.inputValue('#aEmail')) === 'quick@example.com' && (await P.inputValue('#aPass')) === 'typedfast1');
await P.fill('#aEmail', ''); await P.fill('#aPass', '');
await P.click('#aMode [data-m=up]');
ok('Create account asks for a name too', await P.isVisible('#aName') && (await txt(P, '#aGo')) === 'Create account');
await P.fill('#aEmail', email); await P.fill('#aPass', 'short'); await P.fill('#aName', 'Rae');
await P.click('#aGo'); ok('short passwords are refused before sending', /at least 8 characters/.test(await txt(P, '#aMsg')));
await P.fill('#aName', ''); await P.fill('#aPass', 'longenough1'); await P.click('#aGo');
ok('a name is required', /Add your name/.test(await txt(P, '#aMsg')));
await P.fill('#aName', 'Rae Lynn'); await P.click('#aGo'); await settle(P, 900);
ok('sign-up says to check email (no sign-in until it’s confirmed)', /we sent a link to/.test(await txt(P, '#aMsg')) && await P.isVisible('#authSheet.open'));
const mail = await (await fetch(DB + '/__test/mail')).json();
ok('a confirmation email went out, linking back to the shop', mail.some(m => m.to === email && m.type === 'signup' && m.redirect_to === SITE + '/'), mail.slice(-1));
await P.fill('#aPass', 'longenough1'); await P.click('#aGo'); await settle(P, 900);
ok('signing in before confirming explains what to do', /Confirm your email first/.test(await txt(P, '#aMsg')));

// clicking the link in the email: Supabase sends you back to the shop, signed in
const link = await (await fetch(DB + '/__test/confirm?email=' + encodeURIComponent(email))).json();
await P.goto('about:blank'); await P.goto(`${SITE}/#access_token=${link.access_token}&refresh_token=${link.refresh_token}&expires_in=3600&token_type=bearer&type=signup`); await settle(P, 1500);
ok('the email link signs you in and welcomes you', /Email confirmed/.test(await toastText(P, /Email confirmed/)) && /Rae Lynn/.test(await txt(P, '#who')), await txt(P, '#who'));
ok('the sign-in is taken out of the address bar', !P.url().includes('access_token'));
ok('the name chosen at sign-up is saved', (await su1(`select name from dt_profiles p join auth.users u on u.id = p.user_id where u.email = $1`, [email])) === 'Rae Lynn');

// sign out, then a wrong password, then the right one
await P.click('#tabs [data-tab=account]'); await settle(P);
ok('Account shows the email', new RegExp(email.replace(/[.+]/g, '\\$&')).test(await txt(P, '#acct')));
await P.click('#acOut'); await settle(P);
ok('signing out goes back to the shop', /Signed out/.test(await toastText(P, /Signed out/)) && (await P.$$eval('#tabs button', b => b.map(x => x.dataset.tab))).join() === 'shop,account');
await P.click('#signInTop'); await P.fill('#aEmail', email); await P.fill('#aPass', 'wrongpass1'); await P.click('#aGo'); await settle(P, 900);
ok('a wrong password is explained plainly', /email and password don.t match/.test(await txt(P, '#aMsg')));

// forgot password
await P.click('#aForgot');
ok('forgot password asks only for the email', (await txt(P, '#aGo')) === 'Send reset link' && await P.isHidden('#aPass'));
await P.click('#aGo'); await settle(P, 900);
ok('it says the link is on its way', /reset link is on its way/.test(await txt(P, '#aMsg')));
ok('a reset email went out', (await (await fetch(DB + '/__test/mail')).json()).some(m => m.to === email && m.type === 'recovery'));
const rec = await (await fetch(DB + '/__test/recovery?email=' + encodeURIComponent(email))).json();
await P.goto('about:blank'); await P.goto(`${SITE}/#access_token=${rec.access_token}&refresh_token=${rec.refresh_token}&expires_in=3600&type=recovery`); await settle(P, 1500);
ok('the reset link asks for a new password', await P.isVisible('#pwSheet.open'));
await P.fill('#pwNew', 'brandnewpass9'); await P.click('#pwGo'); await settle(P, 900);
ok('the new password is saved and you’re signed in', /Password changed/.test(await toastText(P, /Password changed/)) && await P.isHidden('#pwSheet.open'));
await P.click('#tabs [data-tab=account]'); await settle(P); await P.click('#acOut'); await settle(P);
await P.click('#signInTop'); await P.fill('#aEmail', email); await P.fill('#aPass', 'brandnewpass9'); await P.click('#aGo');
await P.waitForSelector('#authSheet:not(.open)', { state: 'attached', timeout: 8000 });
ok('…and works for signing in', /Signed in as Rae Lynn/.test(await toastText(P, /Signed in/)));

// a sign-in that has expired gets refreshed quietly
await P.evaluate(() => { const s = JSON.parse(localStorage.getItem('dt-session')); s.expires_at = 0; localStorage.setItem('dt-session', JSON.stringify(s)); });
await P.reload(); await settle(P, 1500);
ok('an expired sign-in renews itself on the next visit', /Rae Lynn/.test(await txt(P, '#who')) && await P.evaluate(() => JSON.parse(localStorage.getItem('dt-session')).expires_at > Date.now()));

await finish(); await done(errs);
