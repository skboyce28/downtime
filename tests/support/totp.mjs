// Test-only time-based codes (RFC 6238, the 6-digit codes authenticator apps show), used by the
// Supabase stand-in to check codes and by the tests to type them in like a phone would.
import crypto from 'crypto';
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const newSecret = () => { const b = crypto.randomBytes(20); let bits = '', s = ''; for (const x of b) bits += x.toString(2).padStart(8, '0'); for (let i = 0; i + 5 <= bits.length; i += 5) s += A[parseInt(bits.slice(i, i + 5), 2)]; return s; };
function unbase32(s) { let bits = ''; for (const c of s.replace(/=+$/, '').toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, '0'); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); }
export function totp(secret, at = Date.now(), step = 0) {
  const ctr = Math.floor(at / 30000) + step, buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(ctr));
  const h = crypto.createHmac('sha1', unbase32(secret)).update(buf).digest(), o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}
// like Supabase: the current 30-second code, or the one just before or after it
export const totpOk = (secret, code, at = Date.now()) => [-1, 0, 1].some(s => totp(secret, at, s) === String(code));
