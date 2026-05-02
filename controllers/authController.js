'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../models');
const emailService = require('../services/emailService');

const TOKEN_TTL_HOURS = 24;
const AUTH_COOKIE = 'autodash_auth';
const USER_COOKIE = 'autodash_user';

function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '')); }

function setAuthCookie(res, user) {
  const token = crypto.randomBytes(24).toString('hex');
  const maxAge = 60 * 60 * 24 * 7; // 7 days
  const userPayload = encodeURIComponent(JSON.stringify({ id: user.id, name: user.name, email: user.email }));
  res.setHeader('Set-Cookie', [
    AUTH_COOKIE + '=' + token + '; Max-Age=' + maxAge + '; Path=/; HttpOnly; SameSite=Lax',
    USER_COOKIE + '=' + userPayload + '; Max-Age=' + maxAge + '; Path=/; SameSite=Lax',
  ]);
}

function siteOrigin(req) {
  if (process.env.SITE_URL) return String(process.env.SITE_URL).replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return proto + '://' + host;
}

// POST /auth/signup  { name, email, password }
exports.signup = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!name) return res.status(400).json({ success: false, error: 'Name is required.' });
    if (!isEmail(email)) return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    if (password.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' });

    const existing = await db.User.findOne({ where: { email } });
    if (existing) return res.status(409).json({ success: false, error: 'An account with this email already exists. Please sign in.' });

    const passwordHash = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);

    // Replace any prior pending row for this email
    await db.PendingSignup.destroy({ where: { email } });
    await db.PendingSignup.create({ name, email, passwordHash, token, expiresAt });

    const verifyUrl = siteOrigin(req) + '/auth/verify?token=' + token;
    const result = await emailService.sendVerificationEmail({ to: email, name, verifyUrl });

    return res.json({
      success: true,
      message: 'Verification email sent. Please check your inbox to activate your account.',
      // Only expose the link directly when running without SMTP, so dev users can click through.
      devVerifyUrl: result.mode === 'console' ? verifyUrl : undefined,
    });
  } catch (err) {
    console.error('[auth.signup]', err);
    return res.status(500).json({ success: false, error: 'Signup failed. Please try again.' });
  }
};

// GET /auth/verify?token=...
exports.verify = async (req, res) => {
  try {
    const token = String(req.query.token || '');
    if (!token) return res.status(400).render('verify-email', { layout: false, ok: false, message: 'Missing verification token.' });

    const pending = await db.PendingSignup.findOne({ where: { token } });
    if (!pending) {
      // Maybe already verified — check users table for matching token? simpler: just generic message.
      return res.status(400).render('verify-email', { layout: false, ok: false, message: 'This verification link is invalid or has already been used.' });
    }
    if (pending.expiresAt && new Date(pending.expiresAt).getTime() < Date.now()) {
      await pending.destroy();
      return res.status(400).render('verify-email', { layout: false, ok: false, message: 'This verification link has expired. Please sign up again.' });
    }

    // Create the real user (if it somehow already exists, just clean up)
    let user = await db.User.findOne({ where: { email: pending.email } });
    if (!user) {
      user = await db.User.create({
        name: pending.name,
        email: pending.email,
        passwordHash: pending.passwordHash,
        emailVerified: true,
      });
    }
    await pending.destroy();

    setAuthCookie(res, user);
    return res.render('verify-email', { layout: false, ok: true, message: 'Your email is verified — your account is ready.', user: { name: user.name, email: user.email } });
  } catch (err) {
    console.error('[auth.verify]', err);
    return res.status(500).render('verify-email', { layout: false, ok: false, message: 'Something went wrong. Please try again.' });
  }
};

// POST /auth/signin  { email, password }
exports.signin = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!isEmail(email) || !password) return res.status(400).json({ success: false, error: 'Email and password are required.' });

    const user = await db.User.findOne({ where: { email } });
    if (!user) {
      // Check pending — give a hint
      const pending = await db.PendingSignup.findOne({ where: { email } });
      if (pending) return res.status(403).json({ success: false, error: 'Please verify your email before signing in. Check your inbox for the verification link.' });
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ success: false, error: 'Invalid email or password.' });

    user.lastLoginAt = new Date();
    await user.save();
    setAuthCookie(res, user);
    return res.json({ success: true, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error('[auth.signin]', err);
    return res.status(500).json({ success: false, error: 'Sign-in failed. Please try again.' });
  }
};

// POST /auth/resend  { email }
exports.resend = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!isEmail(email)) return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    const pending = await db.PendingSignup.findOne({ where: { email } });
    if (!pending) return res.json({ success: true, message: 'If an unverified account exists for that email, a new link was sent.' });
    pending.token = crypto.randomBytes(24).toString('hex');
    pending.expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);
    await pending.save();
    const verifyUrl = siteOrigin(req) + '/auth/verify?token=' + pending.token;
    const result = await emailService.sendVerificationEmail({ to: pending.email, name: pending.name, verifyUrl });
    return res.json({
      success: true,
      message: 'A fresh verification email has been sent.',
      devVerifyUrl: result.mode === 'console' ? verifyUrl : undefined,
    });
  } catch (err) {
    console.error('[auth.resend]', err);
    return res.status(500).json({ success: false, error: 'Could not resend verification email.' });
  }
};
