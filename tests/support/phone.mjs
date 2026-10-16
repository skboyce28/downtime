// Shared helpers for the browser tests: Chromium playing Android phones against the built site
// (http://localhost:8099, served with its real security headers) and the Supabase stand-in.
import { chromium } from 'playwright';
export { ok, done, su, su1, call, sfx, inMinutes } from './db.mjs';
import { su, sfx } from './db.mjs';
import { totp } from './totp.mjs';

export const SITE = process.env.SITE || 'http://localhost:8099', DB = process.env.DB || 'http://localhost:54321';
export const KEY = 'sb_publishable_testkey_1234567890', PW = 'longenough1', OUT = (process.env.DOWNTIME_OUT || 'out') + '/';
export const errs = [];
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
export const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

export async function phone(name, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA, hasTouch: true, ...opts });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(name + ': ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(name + ' console: ' + m.text().slice(0, 200)); });
  await p.goto(SITE + '/'); await p.waitForSelector('#grid'); await settle(p);
  return p;
}
export const settle = (p, ms = 700) => p.waitForTimeout(ms);
export const txt = async (p, s) => (await p.innerText(s)).replace(/\s+/g, ' ').trim();
// the toast's text; with a pattern, waits (up to 6 s) for a toast that matches it
export const toastText = async (p, re) => {
  if (re) await p.waitForFunction(r => new RegExp(r).test(document.getElementById('toast').textContent), re.source, { timeout: 6000 }).catch(() => {});
  else await p.waitForSelector('#toast.show', { timeout: 6000 }).catch(() => {});
  return txt(p, '#toast'); };

// an account made the way a person would: sign up, then click the email link
export async function account(name) {
  const email = `${name}-${sfx}@example.com`;
  const h = { apikey: KEY, 'Content-Type': 'application/json' };
  await fetch(DB + '/auth/v1/signup', { method: 'POST', headers: h, body: JSON.stringify({ email, password: PW }) });
  const s = await (await fetch(DB + '/__test/confirm?email=' + encodeURIComponent(email))).json();
  return { id: s.user.id, email, name };
}
export async function signIn(p, u) {
  if (await p.isVisible('#signInTop')) await p.click('#signInTop'); else if (!(await p.isVisible('#authSheet.open'))) await p.click('#tabs [data-tab=account]');
  await p.fill('#aEmail', u.email); await p.fill('#aPass', PW); await p.click('#aGo');
  try { await p.waitForSelector('#authSheet:not(.open)', { state: 'attached', timeout: 8000 }); }
  catch (e) { throw new Error('sign-in for ' + u.email + ' didn’t finish: ' + await p.innerText('#aMsg').catch(() => '?')); }
  await settle(p, 900);
  if (await p.isVisible('#mfaSheet.open')) await passMfa(p, u);   // staff: the two-step code, like a person with an authenticator app
}
// Staff two-step sign-in: the first time, read the key off the setup screen (like adding it to an app),
// then type the current 6-digit code. Later sign-ins just type the code.
export async function passMfa(p, u) {
  await p.waitForSelector('#mfaSheet.open #mfCode', { timeout: 8000 });
  if (await p.isVisible('#mfKey')) u.secret = (await p.innerText('#mfKey')).replace(/\s/g, '');
  if (!u.secret) throw new Error('no authenticator key for ' + u.email);
  await p.fill('#mfCode', totp(u.secret)); await p.click('#mfGo');
  try { await p.waitForSelector('#mfaSheet:not(.open)', { state: 'attached', timeout: 8000 }); }
  catch (e) { throw new Error('two-step for ' + u.email + ' didn’t finish: ' + await p.innerText('#mfMsg').catch(() => '?')); }
  await settle(p, 900);
}
// close open screens the way the × button does (so an item's link leaves the address bar too)
export const closeSheets = async p => { await p.evaluate(() => document.querySelectorAll('.sheet.open').forEach(m => close(m.id)));
  await p.waitForFunction(() => !document.querySelector('.sheet.open'), null, { timeout: 5000 }).catch(() => {}); };
export async function owner() {
  const u = await account('shopowner'); await su('select public.dt_make_owner($1)', [u.email]); return u;
}
// a small photo, like one from a phone camera (drawn in the page, so no files needed)
export async function photo(p, color = '#d08a3a') {
  return { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(await p.evaluate(c => { const v = document.createElement('canvas'); v.width = 1200; v.height = 900; const x = v.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, 1200, 900); x.fillStyle = '#20302b'; x.fillRect(200, 200, 800, 500); return v.toDataURL('image/png').split(',')[1]; }, color), 'base64') };
}
export async function finish() { await browser.close(); }
