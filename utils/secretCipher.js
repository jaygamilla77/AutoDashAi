'use strict';

/**
 * Symmetric AES-256-GCM helper for storing sensitive secrets at rest
 * (currently per-workspace Azure OpenAI API keys).
 *
 * Key material is derived from SESSION_SECRET (already required by the app).
 * Ciphertext format: base64(iv || authTag || ciphertext).
 *
 * If SESSION_SECRET changes, previously-encrypted values will fail to decrypt
 * and decrypt() returns null — callers must treat that as "needs to be re-entered".
 */
const crypto = require('crypto');

const ALG = 'aes-256-gcm';
const IV_LEN = 12;       // GCM standard
const TAG_LEN = 16;

function getKey() {
  const secret = process.env.SESSION_SECRET || 'autodash-dev-secret-change-me';
  // Stretch into a 32-byte key
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encrypt(plaintext) {
  if (plaintext == null || plaintext === '') return null;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(ciphertextB64) {
  if (!ciphertextB64) return null;
  try {
    const buf = Buffer.from(ciphertextB64, 'base64');
    if (buf.length < IV_LEN + TAG_LEN + 1) return null;
    const iv  = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const enc = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv(ALG, getKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  } catch (err) {
    return null;
  }
}

module.exports = { encrypt, decrypt };
