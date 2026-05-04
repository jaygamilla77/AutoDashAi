'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../models');
const emailService = require('../services/emailService');
const planService = require('../services/planService');
const workspaceService = require('../services/workspaceService');
const authToken = require('../utils/authToken');

const TOKEN_TTL_HOURS = 24;
const AUTH_COOKIE = 'autodash_auth';
const USER_COOKIE = 'autodash_user';

function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '')); }

function setAuthCookie(res, user) {
  const token = authToken.sign(user.id);
  const maxAge = Math.floor(authToken.DEFAULT_TTL_MS / 1000);
  const userPayload = encodeURIComponent(JSON.stringify({
    id: user.id, name: user.name, email: user.email,
    plan: user.plan || 'starter',
    role: user.role || 'admin',
    workspaceId: user.workspaceId || null,
    onboardingCompleted: !!user.onboardingCompleted,
    avatarUrl: user.avatarUrl || null,
  }));
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

function postAuthRedirect(user) {
  if (user && !user.onboardingCompleted) return '/onboarding';
  return '/dashboard';
}

// POST /auth/signup  { name, email, password, plan }
exports.signup = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const planId = planService.isValid(req.body.plan) ? String(req.body.plan).toLowerCase() : 'starter';

    if (!name) return res.status(400).json({ success: false, error: 'Name is required.' });
    if (!isEmail(email)) return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    if (password.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' });
    // Enterprise plan does not self-serve sign up
    if (planId === 'enterprise') {
      return res.status(400).json({ success: false, error: 'Enterprise accounts are provisioned by our sales team. Please use the Contact Sales form.' });
    }

    const existing = await db.User.findOne({ where: { email } });
    if (existing) return res.status(409).json({ success: false, error: 'An account with this email already exists. Please sign in.' });

    const passwordHash = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);

    // Replace any prior pending row for this email
    await db.PendingSignup.destroy({ where: { email } });
    // Stash plan inside the name field? No — extend pendingSignup if needed.
    // For now: store plan in token-suffix metadata via a sidecar: re-encode token
    // to carry plan, since adding a column would require another migration.
    // Format: <token>.<planId> (planId is whitelisted by isValid above).
    const compositeToken = token + '.' + planId;
    await db.PendingSignup.create({ name, email, passwordHash, token: compositeToken, expiresAt });

    const verifyUrl = siteOrigin(req) + '/auth/verify?token=' + compositeToken;
    const result = await emailService.sendVerificationEmail({ to: email, name, verifyUrl });

    return res.json({
      success: true,
      message: 'Verification email sent. Please check your inbox to activate your account.',
      plan: planId,
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
    const rawToken = String(req.query.token || '');
    if (!rawToken) return res.status(400).render('verify-email', { layout: false, ok: false, message: 'Missing verification token.' });

    // Composite tokens may carry plan: "<token>.<plan>"
    let planId = 'starter';
    let token = rawToken;
    const dot = rawToken.lastIndexOf('.');
    if (dot > 0) {
      const tail = rawToken.slice(dot + 1);
      if (planService.isValid(tail)) {
        planId = tail;
        token = rawToken; // PendingSignup stores the composite token verbatim
      }
    }

    const pending = await db.PendingSignup.findOne({ where: { token } });
    if (!pending) {
      return res.status(400).render('verify-email', { layout: false, ok: false, message: 'This verification link is invalid or has already been used.' });
    }
    if (pending.expiresAt && new Date(pending.expiresAt).getTime() < Date.now()) {
      await pending.destroy();
      return res.status(400).render('verify-email', { layout: false, ok: false, message: 'This verification link has expired. Please sign up again.' });
    }

    let user = await db.User.findOne({ where: { email: pending.email } });
    if (!user) {
      user = await db.User.create({
        name: pending.name,
        email: pending.email,
        passwordHash: pending.passwordHash,
        emailVerified: true,
        plan: planId,
        planTrialEndsAt: planService.trialEndDate(planId),
        authProvider: 'local',
        onboardingCompleted: false,
        role: 'admin',
      });
      // Auto-create workspace + 14-day trial (per requirements)
      await workspaceService.createForUser(user, { plan: planId });
    }
    await pending.destroy();

    setAuthCookie(res, user);
    return res.render('verify-email', {
      layout: false,
      ok: true,
      message: 'Your email is verified — your account is ready.',
      user: { name: user.name, email: user.email },
      // The verify-email view links to /onboarding when present
      redirectTo: postAuthRedirect(user),
    });
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
    if (!user.passwordHash) {
      const provider = user.authProvider && user.authProvider !== 'local' ? user.authProvider : 'an external provider';
      return res.status(403).json({ success: false, error: 'This account was created with ' + provider + '. Please use the matching social sign-in button.' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ success: false, error: 'Invalid email or password.' });

    user.lastLoginAt = new Date();
    await user.save();
    // Backfill workspace for legacy accounts that pre-date multi-tenancy
    if (!user.workspaceId) await workspaceService.createForUser(user, { plan: user.plan });
    setAuthCookie(res, user);
    return res.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, plan: user.plan },
      redirectTo: postAuthRedirect(user),
    });
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

// ─────────────────────────────────────────────────────────────────────
// OAuth — invoked by routes/web.js after passport resolves a profile.
// ─────────────────────────────────────────────────────────────────────

/**
 * Upsert a user from an OAuth profile, set auth cookies, and redirect.
 * Plan is taken from req.query.state (set by /auth/<provider>?plan=…).
 */
exports.oauthHandle = async (profile, req, res) => {
  try {
    if (!profile.email) {
      return res.redirect('/auth?error=' + encodeURIComponent('Your ' + profile.provider + ' account did not return an email. Please use email signup instead.'));
    }
    const email = String(profile.email).toLowerCase();
    const planRaw = (req.query && req.query.state) || (req.session && req.session.oauthPlan) || 'starter';
    const planId = planService.isValid(planRaw) && planRaw !== 'enterprise' ? String(planRaw).toLowerCase() : 'starter';

    let user = await db.User.findOne({ where: { email } });
    if (!user) {
      user = await db.User.create({
        name: profile.name || email.split('@')[0],
        email,
        passwordHash: null,
        emailVerified: true,
        plan: planId,
        planTrialEndsAt: planService.trialEndDate(planId),
        authProvider: profile.provider,
        providerUserId: profile.providerUserId || null,
        avatarUrl: profile.avatarUrl || null,
        onboardingCompleted: false,
        role: 'admin',
      });
      await workspaceService.createForUser(user, { plan: planId });
    } else {
      // Link provider on existing user, refresh avatar/lastLogin
      let dirty = false;
      if (!user.authProvider || user.authProvider === 'local') { user.authProvider = profile.provider; dirty = true; }
      if (!user.providerUserId && profile.providerUserId) { user.providerUserId = profile.providerUserId; dirty = true; }
      if (!user.avatarUrl && profile.avatarUrl) { user.avatarUrl = profile.avatarUrl; dirty = true; }
      user.lastLoginAt = new Date();
      await user.save();
      // Existing legacy users created before multi-tenancy may not have a workspace
      if (!user.workspaceId) await workspaceService.createForUser(user, { plan: user.plan });
    }
    setAuthCookie(res, user);
    return res.redirect(postAuthRedirect(user));
  } catch (err) {
    console.error('[auth.oauth]', err);
    return res.redirect('/auth?error=' + encodeURIComponent('Could not complete sign-in. Please try again.'));
  }
};

// ─────────────────────────────────────────────────────────────────────
// Enterprise contact form — POST /contact-sales
// ─────────────────────────────────────────────────────────────────────
exports.contactSales = async (req, res) => {
  try {
    const name     = String(req.body.name || '').trim();
    const email    = String(req.body.email || '').trim().toLowerCase();
    const company  = String(req.body.company || '').trim();
    const employees = String(req.body.employees || '').trim();
    const message  = String(req.body.message || '').trim();
    const source   = String(req.body.source || 'pricing-page').trim();

    if (!name || !email || !company || !message) {
      return res.status(400).json({ success: false, error: 'Name, work email, company, and message are required.' });
    }
    if (!isEmail(email)) return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });

    await emailService.sendSalesContact({ name, email, company, employees, message, source });
    return res.json({ success: true, message: 'Thanks — our team will reach out within 1 business day.' });
  } catch (err) {
    console.error('[auth.contactSales]', err);
    return res.status(500).json({ success: false, error: 'Could not send your enquiry. Please try again or email info@liknaya.com directly.' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// Onboarding state — used by /onboarding wizard
// ─────────────────────────────────────────────────────────────────────
exports.onboardingPage = async (req, res) => {
  try {
    const cookies = (req.headers.cookie || '').split(';').reduce((a, p) => {
      const i = p.indexOf('='); if (i < 0) return a;
      const k = p.slice(0, i).trim(); const v = decodeURIComponent(p.slice(i + 1).trim());
      a[k] = v; return a;
    }, {});
    let userInfo = null;
    try { userInfo = cookies.autodash_user ? JSON.parse(cookies.autodash_user) : null; } catch (_) {}

    let user = null;
    if (userInfo && userInfo.id) user = await db.User.findByPk(userInfo.id);
    if (!user) return res.redirect('/auth');

    const plan = planService.get(user.plan);
    return res.render('onboarding', {
      layout: false,
      title: 'Welcome to AutoDash AI — Let\'s build your first executive dashboard',
      user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl },
      plan,
      planTrialEndsAt: user.planTrialEndsAt,
    });
  } catch (err) {
    console.error('[auth.onboardingPage]', err);
    return res.redirect('/dashboard');
  }
};

exports.onboardingComplete = async (req, res) => {
  try {
    const cookies = (req.headers.cookie || '').split(';').reduce((a, p) => {
      const i = p.indexOf('='); if (i < 0) return a;
      const k = p.slice(0, i).trim(); const v = decodeURIComponent(p.slice(i + 1).trim());
      a[k] = v; return a;
    }, {});
    let userInfo = null;
    try { userInfo = cookies.autodash_user ? JSON.parse(cookies.autodash_user) : null; } catch (_) {}
    if (!userInfo || !userInfo.id) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const user = await db.User.findByPk(userInfo.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    user.onboardingCompleted = true;
    user.onboardingStep = 'done';
    await user.save();
    // Refresh user cookie so subsequent navigation skips onboarding
    setAuthCookie(res, user);
    return res.json({ success: true, redirectTo: '/ai-builder' });
  } catch (err) {
    console.error('[auth.onboardingComplete]', err);
    return res.status(500).json({ success: false, error: 'Could not save onboarding state.' });
  }
};
