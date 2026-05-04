'use strict';

/**
 * Stateless signed-token auth.
 *
 * Token format:  base64url(JSON.stringify({uid, exp})) + '.' + hex(hmacSha256)
 *
 * - `uid` is the User.id, `exp` is a unix-ms expiry.
 * - HMAC is computed with process.env.SESSION_SECRET so the cookie cannot
 *   be tampered with client-side.
 * - Used for the primary `autodash_auth` cookie; the secondary `autodash_user`
 *   cookie is purely for client UI (display name, plan) and is never trusted.
 */

const crypto = require('crypto');

const SECRET = process.env.SESSION_SECRET || 'dev_secret_change_me';
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function b64urlDecode(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString();
}
function hmac(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
}
function timingSafeEq(a, b) {
  const ab = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function sign(userId, ttlMs = DEFAULT_TTL_MS) {
  const payload = b64url(JSON.stringify({ uid: userId, exp: Date.now() + ttlMs }));
  return payload + '.' + hmac(payload);
}

function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!timingSafeEq(sig, hmac(payload))) return null;
  let obj;
  try { obj = JSON.parse(b64urlDecode(payload)); } catch { return null; }
  if (!obj || !obj.uid || !obj.exp) return null;
  if (obj.exp < Date.now()) return null;
  return { uid: Number(obj.uid), exp: obj.exp };
}

module.exports = { sign, verify, DEFAULT_TTL_MS };
