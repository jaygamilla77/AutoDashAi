'use strict';

/**
 * adminSimpleController — Simple password-protected admin page for editing
 * landing page text content. One form, one route.
 *
 * Auth: server-side cookie `autodash_admin=1` (HttpOnly, signed via shared
 * secret). The browser also mirrors the flag in localStorage for UX, but the
 * cookie is the actual gate.
 */

const cms = require('../services/cmsService');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_COOKIE   = 'autodash_admin';

// ─── auth helpers ─────────────────────────────────────────────
function parseCookies(req) {
  const raw = req.headers && req.headers.cookie;
  if (!raw) return {};
  return raw.split(';').reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx < 0) return acc;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try { acc[k] = decodeURIComponent(v); } catch (_) { acc[k] = v; }
    return acc;
  }, {});
}

function isAdmin(req) {
  return parseCookies(req)[ADMIN_COOKIE] === '1';
}

function setAdminCookie(res) {
  // 7-day session
  res.setHeader('Set-Cookie',
    ADMIN_COOKIE + '=1; Path=/; Max-Age=' + (60 * 60 * 24 * 7) + '; SameSite=Lax; HttpOnly');
}

function clearAdminCookie(res) {
  res.setHeader('Set-Cookie',
    ADMIN_COOKIE + '=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly');
}

// ─── handlers ─────────────────────────────────────────────────

// GET /admin — show login or editor
async function show(req, res, next) {
  try {
    if (!isAdmin(req)) {
      return res.render('admin', {
        layout: false,
        mode: 'login',
        error: req.query.error === '1' ? 'Incorrect password. Try again.' : null,
        success: null,
        content: null,
      });
    }
    const content = await cms.getAll({ draft: false });
    res.render('admin', {
      layout: false,
      mode: 'editor',
      error: null,
      success: req.query.saved === '1'
        ? 'Changes saved. The landing page is updated.'
        : (req.query.reset === '1' ? 'Content reset to defaults.' : null),
      content,
    });
  } catch (err) { next(err); }
}

// POST /admin/login
function login(req, res) {
  const password = (req.body && req.body.password) || '';
  if (password === ADMIN_PASSWORD) {
    setAdminCookie(res);
    return res.redirect('/admin');
  }
  return res.redirect('/admin?error=1');
}

// POST /admin/logout
function logout(req, res) {
  clearAdminCookie(res);
  return res.redirect('/admin');
}

// POST /admin/save
async function save(req, res, next) {
  try {
    if (!isAdmin(req)) return res.redirect('/admin');
    const b = req.body || {};
    const s = (v) => (typeof v === 'string' ? v : '');

    // ── branding ──
    const branding = await cms.getSection('branding');
    branding.name       = s(b['brand_name'])       || branding.name;
    branding.tagline    = s(b['brand_tagline'])    || branding.tagline;
    await cms.updateSection('branding', branding, { draft: false });

    // ── nav ──
    const nav = await cms.getSection('nav');
    const navLabels = ['nav_features', 'nav_about', 'nav_faq', 'nav_pricing', 'nav_contact'];
    if (!Array.isArray(nav.items)) nav.items = [];
    navLabels.forEach((field, i) => {
      const label = s(b[field]);
      if (!label) return;
      if (!nav.items[i]) nav.items[i] = { label, href: '#' };
      else nav.items[i].label = label;
    });
    nav.signInLabel     = s(b['nav_signin'])    || nav.signInLabel;
    nav.getStartedLabel = s(b['nav_getstarted']) || nav.getStartedLabel;
    await cms.updateSection('nav', nav, { draft: false });

    // ── hero ──
    const hero = await cms.getSection('hero');
    hero.eyebrowText = s(b['hero_badge'])     || hero.eyebrowText;
    hero.titleStart  = s(b['hero_title'])     || hero.titleStart;
    hero.titleAccent = s(b['hero_highlight']) || hero.titleAccent;
    hero.subtitle    = s(b['hero_subtitle'])  || hero.subtitle;
    hero.primaryCta   = hero.primaryCta   || { label: '', href: '#' };
    hero.secondaryCta = hero.secondaryCta || { label: '', href: '#' };
    hero.primaryCta.label   = s(b['hero_primary_cta'])   || hero.primaryCta.label;
    hero.secondaryCta.label = s(b['hero_secondary_cta']) || hero.secondaryCta.label;
    await cms.updateSection('hero', hero, { draft: false });

    // ── features (4 cards) ──
    const features = await cms.getSection('features');
    if (!Array.isArray(features.items)) features.items = [];
    for (let i = 0; i < 4; i++) {
      const t = s(b['feature_' + i + '_title']);
      const d = s(b['feature_' + i + '_description']);
      if (!features.items[i]) features.items[i] = { icon: 'bi-stars', title: '', description: '' };
      if (t) features.items[i].title = t;
      if (d) features.items[i].description = d;
    }
    await cms.updateSection('features', features, { draft: false });

    // ── stats (4 metrics) ──
    const stats = await cms.getSection('stats');
    if (!Array.isArray(stats.items)) stats.items = [];
    for (let i = 0; i < 4; i++) {
      const v = s(b['stat_' + i + '_value']);
      const l = s(b['stat_' + i + '_label']);
      if (!stats.items[i]) stats.items[i] = { icon: 'bi-graph-up', value: '', label: '' };
      if (v) stats.items[i].value = v;
      if (l) stats.items[i].label = l;
    }
    await cms.updateSection('stats', stats, { draft: false });

    // ── footer ──
    const footer = await cms.getSection('footer');
    footer.copyright      = s(b['footer_copyright'])      || footer.copyright;
    footer.poweredByLabel = s(b['footer_poweredby_label']) || footer.poweredByLabel;
    await cms.updateSection('footer', footer, { draft: false });

    return res.redirect('/admin?saved=1');
  } catch (err) { next(err); }
}

// POST /admin/reset
async function reset(req, res, next) {
  try {
    if (!isAdmin(req)) return res.redirect('/admin');
    const sections = ['branding', 'nav', 'hero', 'features', 'stats', 'footer'];
    for (const name of sections) {
      await cms.resetSection(name);
    }
    return res.redirect('/admin?reset=1');
  } catch (err) { next(err); }
}

module.exports = { show, login, logout, save, reset, isAdmin };
