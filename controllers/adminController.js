'use strict';

/**
 * adminController — Unified password-protected admin panel.
 *
 * Auth: HttpOnly cookie `autodash_admin=1` (also mirrored in localStorage by
 * the client for UI state). Default password `admin123` (override via
 * ADMIN_PASSWORD env var).
 *
 * All content is persisted in the `site_content` table via cmsService, except:
 *   - Templates  → `dashboard_templates` table
 *   - Inquiries  → `inquiries` table
 *   - Marketing pages (legacy) → `marketing_pages` table (kept for /admin/pages)
 */

const cms = require('../services/cmsService');
const { MarketingPage, DashboardTemplate, Inquiry, User, PendingSignup, DataSource, SavedDashboard, PromptHistory, DashboardShare, Workspace, sequelize } = require('../models');
const planService = require('../services/planService');
const tenantCtx = require('../utils/tenantContext');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_COOKIE   = 'autodash_admin';

// ───────────────────────── auth ─────────────────────────
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

function isAdmin(req) { return parseCookies(req)[ADMIN_COOKIE] === '1'; }

function setAdminCookie(res) {
  res.setHeader('Set-Cookie',
    ADMIN_COOKIE + '=1; Path=/; Max-Age=' + (60 * 60 * 24 * 7) + '; SameSite=Lax; HttpOnly');
}

function clearAdminCookie(res) {
  res.setHeader('Set-Cookie',
    ADMIN_COOKIE + '=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly');
}

function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  return res.redirect('/admin/login');
}

// ───────────────────────── render helpers ─────────────────────────
function adminRender(res, view, locals) {
  res.render('admin/' + view, Object.assign({
    layout: 'admin/layout',
    activeNav: '',
    pageTitle: 'Admin',
    flash: null,
  }, locals || {}));
}

function flashFromQuery(req) {
  if (!req.query) return null;
  if (req.query.saved === '1')   return { type: 'success', text: 'Changes saved.' };
  if (req.query.created === '1') return { type: 'success', text: 'Item created.' };
  if (req.query.updated === '1') return { type: 'success', text: 'Item updated.' };
  if (req.query.deleted === '1') return { type: 'success', text: 'Item deleted.' };
  if (req.query.error === '1')   return { type: 'danger', text: 'Something went wrong.' };
  return null;
}

function intOr(v, def) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : def; }
function splitLines(s) {
  if (!s) return [];
  return String(s).split('\n').map(x => x.trim()).filter(Boolean);
}
function parseJsonArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (_) { return []; }
}
function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

// ───────────────────────── auth handlers ─────────────────────────
function showLogin(req, res) {
  if (isAdmin(req)) return res.redirect('/admin');
  res.render('admin/login', {
    layout: false,
    error: req.query.error === '1' ? 'Incorrect password. Try again.' : null,
  });
}

function login(req, res) {
  const username = ((req.body && req.body.username) || '').trim();
  const password = (req.body && req.body.password) || '';
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    setAdminCookie(res);
    return res.redirect('/admin');
  }
  return res.redirect('/admin/login?error=1');
}

function logout(req, res) {
  clearAdminCookie(res);
  return res.redirect('/admin/login');
}

// ───────────────────────── dashboard ─────────────────────────
async function dashboard(req, res, next) {
  try {
    const [features, faq, blog, testimonials, portfolio, inqCount, recentInquiries, tplCount, pageCount] = await Promise.all([
      cms.getSection('features'),
      cms.getSection('faq'),
      cms.getSection('blog'),
      cms.getSection('testimonials'),
      cms.getSection('portfolio'),
      Inquiry.count(),
      Inquiry.findAll({ order: [['createdAt', 'DESC']], limit: 5 }),
      DashboardTemplate.count(),
      MarketingPage.count(),
    ]);
    const stats = {
      pages: pageCount,
      faqs: (faq.items || []).length,
      features: (features.items || []).length,
      inquiries: inqCount,
      blogPosts: (blog.items || []).length,
      testimonials: (testimonials.items || []).length,
      portfolio: (portfolio.items || []).length,
      templates: tplCount,
    };
    adminRender(res, 'dashboard', {
      activeNav: 'dashboard',
      pageTitle: 'Dashboard',
      stats,
      recentInquiries,
      flash: flashFromQuery(req),
    });
  } catch (err) { next(err); }
}

// ───────────────────────── Landing Page (hero) ─────────────────────────
async function landingShow(req, res, next) {
  try {
    const hero = await cms.getSection('hero');
    adminRender(res, 'landing', {
      activeNav: 'landing', pageTitle: 'Landing Page',
      hero, flash: flashFromQuery(req),
    });
  } catch (err) { next(err); }
}

async function landingSave(req, res, next) {
  try {
    const b = req.body || {};
    const hero = await cms.getSection('hero');
    hero.eyebrowText  = (b.badge || '').trim() || hero.eyebrowText;
    hero.titleStart   = (b.titleStart || '').trim() || hero.titleStart;
    hero.titleAccent  = (b.titleAccent || '').trim();
    hero.titleEnd     = (b.titleEnd || '').trim();
    hero.subtitle     = (b.subtitle || '').trim() || hero.subtitle;
    hero.previewTitle    = (b.previewTitle || '').trim() || hero.previewTitle;
    hero.previewSubtitle = (b.previewSubtitle || '').trim() || hero.previewSubtitle;
    hero.primaryCta = Object.assign({}, hero.primaryCta || {}, {
      label: (b.primaryCtaLabel || '').trim() || (hero.primaryCta && hero.primaryCta.label) || 'Get Started',
      href:  (b.primaryCtaHref || '').trim() || (hero.primaryCta && hero.primaryCta.href) || '#',
    });
    hero.secondaryCta = Object.assign({}, hero.secondaryCta || {}, {
      label: (b.secondaryCtaLabel || '').trim() || (hero.secondaryCta && hero.secondaryCta.label) || 'Learn More',
      href:  (b.secondaryCtaHref || '').trim() || (hero.secondaryCta && hero.secondaryCta.href) || '#',
    });
    await cms.updateSection('hero', hero, { draft: false });
    res.redirect('/admin/landing?saved=1');
  } catch (err) { next(err); }
}

// ───────────────────────── Features ─────────────────────────
async function featuresShow(req, res, next) {
  try {
    const features = await cms.getSection('features');
    adminRender(res, 'features', {
      activeNav: 'features', pageTitle: 'Features',
      items: features.items || [], flash: flashFromQuery(req),
    });
  } catch (err) { next(err); }
}

async function featuresSave(req, res, next) {
  try {
    const b = req.body || {};
    const features = await cms.getSection('features');
    if (!Array.isArray(features.items)) features.items = [];
    const idx = b.index === '' ? null : intOr(b.index, null);
    const item = {
      icon: (b.icon || 'bi-stars').trim(),
      title: (b.title || '').trim(),
      description: (b.description || '').trim(),
      order: intOr(b.order, 0),
    };
    if (!item.title) return res.redirect('/admin/features?error=1');
    if (idx === null) features.items.push(item);
    else if (features.items[idx]) features.items[idx] = item;
    features.items.sort((a, b) => (a.order || 0) - (b.order || 0));
    await cms.updateSection('features', features, { draft: false });
    res.redirect('/admin/features?' + (idx === null ? 'created=1' : 'updated=1'));
  } catch (err) { next(err); }
}

async function featuresDelete(req, res, next) {
  try {
    const idx = intOr(req.params.index, -1);
    const features = await cms.getSection('features');
    if (Array.isArray(features.items) && features.items[idx]) {
      features.items.splice(idx, 1);
      await cms.updateSection('features', features, { draft: false });
    }
    res.redirect('/admin/features?deleted=1');
  } catch (err) { next(err); }
}

// ───────────────────────── FAQ ─────────────────────────
async function faqShow(req, res, next) {
  try {
    const faq = await cms.getSection('faq');
    adminRender(res, 'faq', {
      activeNav: 'faq', pageTitle: 'FAQ',
      faq, items: faq.items || [], flash: flashFromQuery(req),
    });
  } catch (err) { next(err); }
}

async function faqSave(req, res, next) {
  try {
    const b = req.body || {};
    const faq = await cms.getSection('faq');
    if (!Array.isArray(faq.items)) faq.items = [];
    const idx = b.index === '' ? null : intOr(b.index, null);
    const item = {
      question: (b.question || '').trim(),
      answer:   (b.answer   || '').trim(),
      order:    intOr(b.order, 0),
      active:   b.active === 'on' || b.active === 'true',
    };
    if (!item.question) return res.redirect('/admin/faq?error=1');
    if (idx === null) faq.items.push(item);
    else if (faq.items[idx]) faq.items[idx] = item;
    faq.items.sort((a, b) => (a.order || 0) - (b.order || 0));
    await cms.updateSection('faq', faq, { draft: false });
    res.redirect('/admin/faq?' + (idx === null ? 'created=1' : 'updated=1'));
  } catch (err) { next(err); }
}

async function faqDelete(req, res, next) {
  try {
    const idx = intOr(req.params.index, -1);
    const faq = await cms.getSection('faq');
    if (Array.isArray(faq.items) && faq.items[idx]) {
      faq.items.splice(idx, 1);
      await cms.updateSection('faq', faq, { draft: false });
    }
    res.redirect('/admin/faq?deleted=1');
  } catch (err) { next(err); }
}

// ───────────────────────── Pricing ─────────────────────────
async function pricingShow(req, res, next) {
  try {
    // Redirect to new PayMongo pricing settings page
    return res.redirect('/admin/pricing-settings');
  } catch (err) { next(err); }
}

async function pricingSave(req, res, next) {
  try {
    const b = req.body || {};
    const pricing = await cms.getSection('pricing');
    if (!Array.isArray(pricing.plans)) pricing.plans = [];
    const idx = b.index === '' ? null : intOr(b.index, null);
    const plan = {
      name: (b.name || '').trim(),
      price: (b.price || '').trim(),
      period: (b.period || '').trim(),
      description: (b.description || '').trim(),
      recommended: b.recommended === 'on' || b.recommended === 'true',
      features: splitLines(b.features),
      cta: {
        label: (b.ctaLabel || 'Get Started').trim(),
        href:  (b.ctaHref  || '#').trim(),
      },
    };
    if (!plan.name) return res.redirect('/admin/pricing?error=1');
    if (idx === null) pricing.plans.push(plan);
    else if (pricing.plans[idx]) pricing.plans[idx] = plan;
    await cms.updateSection('pricing', pricing, { draft: false });
    res.redirect('/admin/pricing?' + (idx === null ? 'created=1' : 'updated=1'));
  } catch (err) { next(err); }
}

async function pricingDelete(req, res, next) {
  try {
    const idx = intOr(req.params.index, -1);
    const pricing = await cms.getSection('pricing');
    if (Array.isArray(pricing.plans) && pricing.plans[idx]) {
      pricing.plans.splice(idx, 1);
      await cms.updateSection('pricing', pricing, { draft: false });
    }
    res.redirect('/admin/pricing?deleted=1');
  } catch (err) { next(err); }
}

// ───────────────────────── About ─────────────────────────
async function aboutShow(req, res, next) {
  try {
    const about = await cms.getSection('about');
    adminRender(res, 'about', {
      activeNav: 'about', pageTitle: 'About',
      about, flash: flashFromQuery(req),
    });
  } catch (err) { next(err); }
}

async function aboutSave(req, res, next) {
  try {
    const b = req.body || {};
    const about = await cms.getSection('about');
    about.title = (b.title || '').trim() || about.title;
    about.mission = (b.mission || '').trim();
    about.description = (b.description || '').trim();
    about.poweredBy = (b.poweredBy || '').trim();
    await cms.updateSection('about', about, { draft: false });
    res.redirect('/admin/about?saved=1');
  } catch (err) { next(err); }
}

// ───────────────────────── Contact ─────────────────────────
async function contactShow(req, res, next) {
  try {
    const contact = await cms.getSection('contact');
    adminRender(res, 'contact', {
      activeNav: 'contact', pageTitle: 'Contact',
      contact, flash: flashFromQuery(req),
    });
  } catch (err) { next(err); }
}

async function contactSave(req, res, next) {
  try {
    const b = req.body || {};
    const contact = await cms.getSection('contact');
    contact.title = (b.title || '').trim() || contact.title;
    contact.subtitle = (b.subtitle || '').trim();
    contact.supportEmail = (b.supportEmail || '').trim();
    contact.businessEmail = (b.businessEmail || '').trim();
    contact.phone = (b.phone || '').trim();
    contact.address = (b.address || '').trim();
    contact.formEnabled = b.formEnabled === 'on' || b.formEnabled === 'true';
    contact.formSuccessMessage = (b.formSuccessMessage || '').trim() || contact.formSuccessMessage;
    await cms.updateSection('contact', contact, { draft: false });
    res.redirect('/admin/contact?saved=1');
  } catch (err) { next(err); }
}

// Public POST /contact form handler — saves to inquiries table
async function contactSubmit(req, res, next) {
  try {
    const b = req.body || {};
    const name = (b.name || '').trim();
    const email = (b.email || '').trim();
    const message = (b.message || '').trim();
    if (!name || !email || !message) {
      const accept = req.headers.accept || '';
      if (req.xhr || accept.indexOf('application/json') !== -1) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
      }
      return res.redirect('/contact?error=1');
    }
    await Inquiry.create({
      name, email,
      subject: (b.subject || '').trim() || null,
      message,
      status: 'new',
    });
    const accept = req.headers.accept || '';
    if (req.xhr || accept.indexOf('application/json') !== -1) {
      return res.json({ success: true });
    }
    res.redirect('/contact?sent=1');
  } catch (err) { next(err); }
}

// ───────────────────────── Blog ─────────────────────────
async function blogShow(req, res, next) {
  try {
    const blog = await cms.getSection('blog');
    adminRender(res, 'blog', {
      activeNav: 'blog', pageTitle: 'Blog',
      items: blog.items || [], flash: flashFromQuery(req),
    });
  } catch (err) { next(err); }
}

async function blogSave(req, res, next) {
  try {
    const b = req.body || {};
    const blog = await cms.getSection('blog');
    if (!Array.isArray(blog.items)) blog.items = [];
    const idx = b.index === '' ? null : intOr(b.index, null);
    const post = {
      title: (b.title || '').trim(),
      slug:  (b.slug  || '').trim() || slugify(b.title),
      excerpt: (b.excerpt || '').trim(),
      content: (b.content || '').trim(),
      status: (b.status === 'published' ? 'published' : 'draft'),
      updatedAt: new Date().toISOString(),
    };
    if (!post.title) return res.redirect('/admin/blog?error=1');
    if (idx === null) {
      post.createdAt = new Date().toISOString();
      blog.items.unshift(post);
    } else if (blog.items[idx]) {
      post.createdAt = blog.items[idx].createdAt || post.updatedAt;
      blog.items[idx] = post;
    }
    await cms.updateSection('blog', blog, { draft: false });
    res.redirect('/admin/blog?' + (idx === null ? 'created=1' : 'updated=1'));
  } catch (err) { next(err); }
}

async function blogDelete(req, res, next) {
  try {
    const idx = intOr(req.params.index, -1);
    const blog = await cms.getSection('blog');
    if (Array.isArray(blog.items) && blog.items[idx]) {
      blog.items.splice(idx, 1);
      await cms.updateSection('blog', blog, { draft: false });
    }
    res.redirect('/admin/blog?deleted=1');
  } catch (err) { next(err); }
}

// ───────────────────────── Testimonials ─────────────────────────
async function testimonialsShow(req, res, next) {
  try {
    const t = await cms.getSection('testimonials');
    adminRender(res, 'testimonials', {
      activeNav: 'testimonials', pageTitle: 'Testimonials',
      items: t.items || [], flash: flashFromQuery(req),
    });
  } catch (err) { next(err); }
}

async function testimonialsSave(req, res, next) {
  try {
    const b = req.body || {};
    const t = await cms.getSection('testimonials');
    if (!Array.isArray(t.items)) t.items = [];
    const idx = b.index === '' ? null : intOr(b.index, null);
    const item = {
      name: (b.name || '').trim(),
      role: (b.role || '').trim(),
      quote: (b.quote || '').trim(),
      rating: Math.max(1, Math.min(5, intOr(b.rating, 5))),
    };
    if (!item.name || !item.quote) return res.redirect('/admin/testimonials?error=1');
    if (idx === null) t.items.push(item);
    else if (t.items[idx]) t.items[idx] = item;
    await cms.updateSection('testimonials', t, { draft: false });
    res.redirect('/admin/testimonials?' + (idx === null ? 'created=1' : 'updated=1'));
  } catch (err) { next(err); }
}

async function testimonialsDelete(req, res, next) {
  try {
    const idx = intOr(req.params.index, -1);
    const t = await cms.getSection('testimonials');
    if (Array.isArray(t.items) && t.items[idx]) {
      t.items.splice(idx, 1);
      await cms.updateSection('testimonials', t, { draft: false });
    }
    res.redirect('/admin/testimonials?deleted=1');
  } catch (err) { next(err); }
}

// ───────────────────────── Portfolio ─────────────────────────
async function portfolioShow(req, res, next) {
  try {
    const p = await cms.getSection('portfolio');
    adminRender(res, 'portfolio', {
      activeNav: 'portfolio', pageTitle: 'Portfolio',
      items: p.items || [], flash: flashFromQuery(req),
    });
  } catch (err) { next(err); }
}

async function portfolioSave(req, res, next) {
  try {
    const b = req.body || {};
    const p = await cms.getSection('portfolio');
    if (!Array.isArray(p.items)) p.items = [];
    const idx = b.index === '' ? null : intOr(b.index, null);
    const item = {
      title: (b.title || '').trim(),
      description: (b.description || '').trim(),
      image: (b.image || '').trim(),
      link:  (b.link  || '').trim(),
    };
    if (!item.title) return res.redirect('/admin/portfolio?error=1');
    if (idx === null) p.items.push(item);
    else if (p.items[idx]) p.items[idx] = item;
    await cms.updateSection('portfolio', p, { draft: false });
    res.redirect('/admin/portfolio?' + (idx === null ? 'created=1' : 'updated=1'));
  } catch (err) { next(err); }
}

async function portfolioDelete(req, res, next) {
  try {
    const idx = intOr(req.params.index, -1);
    const p = await cms.getSection('portfolio');
    if (Array.isArray(p.items) && p.items[idx]) {
      p.items.splice(idx, 1);
      await cms.updateSection('portfolio', p, { draft: false });
    }
    res.redirect('/admin/portfolio?deleted=1');
  } catch (err) { next(err); }
}

// ───────────────────────── Templates ─────────────────────────
async function templatesShow(req, res, next) {
  try {
    const rows = await DashboardTemplate.findAll({ order: [['name', 'ASC']] });
    const items = rows.map(r => ({
      id: r.id,
      name: r.name,
      category: r.category || '',
      description: r.description || '',
      recommendedKpis: parseJsonArray(r.recommendedKpis),
      isActive: r.isActive !== false,
      isBuiltIn: !!r.isBuiltIn,
    }));
    adminRender(res, 'templates', {
      activeNav: 'templates', pageTitle: 'Templates',
      items, flash: flashFromQuery(req),
    });
  } catch (err) { next(err); }
}

async function templatesSave(req, res, next) {
  try {
    const b = req.body || {};
    const id = b.id ? intOr(b.id, null) : null;
    const fields = {
      name: (b.name || '').trim(),
      category: (b.category || '').trim() || null,
      description: (b.description || '').trim() || null,
      recommendedKpis: JSON.stringify(splitLines(b.recommendedKpis)),
      isActive: b.isActive === 'on' || b.isActive === 'true',
    };
    if (!fields.name) return res.redirect('/admin/templates?error=1');
    if (id) {
      const row = await DashboardTemplate.findByPk(id);
      if (row) { Object.assign(row, fields); await row.save(); }
      return res.redirect('/admin/templates?updated=1');
    }
    await DashboardTemplate.create(Object.assign({
      colorPalette: JSON.stringify(['#2563EB','#7C3AED','#DB2777','#F59E0B','#10B981','#0EA5E9','#EF4444','#6366F1']),
      isBuiltIn: false,
    }, fields));
    res.redirect('/admin/templates?created=1');
  } catch (err) { next(err); }
}

async function templatesDelete(req, res, next) {
  try {
    const id = intOr(req.params.id, -1);
    const row = await DashboardTemplate.findByPk(id);
    if (row && !row.isBuiltIn) await row.destroy();
    res.redirect('/admin/templates?deleted=1');
  } catch (err) { next(err); }
}

// ───────────────────────── Inquiries ─────────────────────────
async function inquiriesShow(req, res, next) {
  try {
    const items = await Inquiry.findAll({ order: [['createdAt', 'DESC']] });
    adminRender(res, 'inquiries', {
      activeNav: 'inquiries', pageTitle: 'Inquiries',
      items, flash: flashFromQuery(req),
    });
  } catch (err) { next(err); }
}

async function inquiriesUpdateStatus(req, res, next) {
  try {
    const id = intOr(req.params.id, -1);
    const status = (req.body && req.body.status) || 'read';
    const row = await Inquiry.findByPk(id);
    if (row) { row.status = status; await row.save(); }
    res.redirect('/admin/inquiries?updated=1');
  } catch (err) { next(err); }
}

async function inquiriesDelete(req, res, next) {
  try {
    const id = intOr(req.params.id, -1);
    const row = await Inquiry.findByPk(id);
    if (row) await row.destroy();
    res.redirect('/admin/inquiries?deleted=1');
  } catch (err) { next(err); }
}

// ───────────────────────── Site Settings ─────────────────────────
async function settingsShow(req, res, next) {
  try {
    const settings = await cms.getSection('settings');
    adminRender(res, 'settings', {
      activeNav: 'settings', pageTitle: 'Site Settings',
      settings, flash: flashFromQuery(req),
    });
  } catch (err) { next(err); }
}

async function settingsSave(req, res, next) {
  try {
    const b = req.body || {};
    const settings = await cms.getSection('settings');
    settings.logoText = (b.logoText || '').trim() || settings.logoText;
    settings.brandName = (b.brandName || '').trim() || settings.brandName;
    settings.footerText = (b.footerText || '').trim() || settings.footerText;
    settings.seoTitle = (b.seoTitle || '').trim() || settings.seoTitle;
    settings.seoDescription = (b.seoDescription || '').trim() || settings.seoDescription;
    const labels = Array.isArray(b.socialLabel) ? b.socialLabel : [b.socialLabel].filter(Boolean);
    const icons  = Array.isArray(b.socialIcon)  ? b.socialIcon  : [b.socialIcon].filter(Boolean);
    const hrefs  = Array.isArray(b.socialHref)  ? b.socialHref  : [b.socialHref].filter(Boolean);
    const out = [];
    for (let i = 0; i < Math.max(labels.length, icons.length, hrefs.length); i++) {
      const label = (labels[i] || '').trim();
      const icon  = (icons[i]  || '').trim();
      const href  = (hrefs[i]  || '').trim();
      if (label || href) out.push({ label, icon, href });
    }
    settings.social = out;
    await cms.updateSection('settings', settings, { draft: false });

    // Mirror brandName/footer/socials into legacy sections so landing page reflects changes
    const branding = await cms.getSection('branding');
    branding.name = settings.brandName.split(' ')[0] || branding.name;
    await cms.updateSection('branding', branding, { draft: false });

    const footer = await cms.getSection('footer');
    footer.copyright = settings.footerText;
    if (Array.isArray(settings.social) && settings.social.length) {
      footer.socials = settings.social.map(s => ({ icon: s.icon || 'bi-link', href: s.href || '#', label: s.label || '' }));
    }
    await cms.updateSection('footer', footer, { draft: false });

    res.redirect('/admin/settings?saved=1');
  } catch (err) { next(err); }
}

// ───────────────────────── Marketing pages (legacy /admin/pages) ─────────
const PAGE_DEFS = [
  { slug: 'features', label: 'Features', defaults: { title: 'Features – AutoDash AI', metaDescription: '', metaKeywords: '', heroEyebrow: 'Platform Features', heroTitle: 'Everything you need to build better dashboards', heroSubtitle: '' } },
  { slug: 'about',    label: 'About',    defaults: { title: 'About AutoDash AI', metaDescription: '', metaKeywords: '', heroEyebrow: 'About Us', heroTitle: 'About AutoDash AI', heroSubtitle: '' } },
  { slug: 'faq',      label: 'FAQ',      defaults: { title: 'FAQ – AutoDash AI', metaDescription: '', metaKeywords: '', heroEyebrow: 'Help Center', heroTitle: 'Frequently Asked Questions', heroSubtitle: '' } },
  { slug: 'pricing',  label: 'Pricing',  defaults: { title: 'Pricing – AutoDash AI', metaDescription: '', metaKeywords: '', heroEyebrow: 'Pricing', heroTitle: 'Simple, transparent pricing', heroSubtitle: '' } },
  { slug: 'contact',  label: 'Contact',  defaults: { title: 'Contact – AutoDash AI', metaDescription: '', metaKeywords: '', heroEyebrow: 'Contact', heroTitle: 'Get in touch', heroSubtitle: '' } },
];
const PAGE_MAP = PAGE_DEFS.reduce((acc, p) => { acc[p.slug] = p; return acc; }, {});

async function ensureMarketingSeed() {
  for (const def of PAGE_DEFS) {
    const [row, created] = await MarketingPage.findOrCreate({
      where: { slug: def.slug },
      defaults: Object.assign({ slug: def.slug, label: def.label, bodyHtml: '', isPublished: true }, def.defaults),
    });
    if (!created && row.label !== def.label) { row.label = def.label; await row.save(); }
  }
}

async function getPage(slug) { return await MarketingPage.findByPk(slug); }

// ───────────────────────── Members (signed-up users) ─────────────────────────
async function membersShow(req, res, next) {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    const planFilter = (req.query.plan || '').trim();
    const verifiedFilter = req.query.verified || ''; // '1' | '0' | ''

    const where = {};
    if (planFilter) where.plan = planFilter;
    if (verifiedFilter === '1') where.emailVerified = true;
    else if (verifiedFilter === '0') where.emailVerified = false;

    const [users, pendingSignups, totals] = await Promise.all([
      User.findAll({ where, order: [['createdAt', 'DESC']], limit: 500 }),
      PendingSignup.findAll({ order: [['createdAt', 'DESC']], limit: 100 }),
      Promise.all([
        DataSource.count(),
        SavedDashboard.count(),
        PromptHistory.count(),
        DashboardShare ? DashboardShare.count() : Promise.resolve(0),
      ]).then(([sources, dashboards, prompts, shares]) => ({ sources, dashboards, prompts, shares })),
    ]);

    const filtered = q
      ? users.filter(u =>
          (u.email || '').toLowerCase().includes(q) ||
          (u.name || '').toLowerCase().includes(q))
      : users;

    // Aggregate stats
    const memberStats = {
      total: users.length,
      verified: users.filter(u => u.emailVerified).length,
      unverified: users.filter(u => !u.emailVerified).length,
      starter: users.filter(u => u.plan === 'starter').length,
      business: users.filter(u => u.plan === 'business').length,
      enterprise: users.filter(u => u.plan === 'enterprise').length,
      oauth: users.filter(u => u.authProvider && u.authProvider !== 'local').length,
      onboarded: users.filter(u => u.onboardingCompleted).length,
      pendingCount: pendingSignups.length,
    };

    adminRender(res, 'members', {
      activeNav: 'members',
      pageTitle: 'Members',
      members: filtered,
      pendingSignups,
      totals,
      memberStats,
      filters: { q, plan: planFilter, verified: verifiedFilter },
      flash: flashFromQuery(req),
    });
  } catch (err) { next(err); }
}

async function membersResendVerification(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.redirect('/admin/members?error=1');
    const user = await User.findByPk(id);
    if (!user) return res.redirect('/admin/members?error=1');
    user.emailVerified = true;
    await user.save();
    return res.redirect('/admin/members?updated=1');
  } catch (err) { next(err); }
}

async function membersDelete(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.redirect('/admin/members?error=1');
    await User.destroy({ where: { id } });
    return res.redirect('/admin/members?deleted=1');
  } catch (err) { next(err); }
}

// ───────────────────────── Workspaces (tenants) ─────────────────────────
async function workspacesShow(req, res, next) {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    const planFilter = (req.query.plan || '').trim();
    const statusFilter = (req.query.status || '').trim();

    const where = {};
    if (planFilter) where.plan = planFilter;
    if (statusFilter) where.subscriptionStatus = statusFilter;

    const workspaces = await Workspace.findAll({ where, order: [['createdAt', 'DESC']], limit: 500 });
    const ownerIds = [...new Set(workspaces.map(w => w.ownerUserId).filter(Boolean))];
    const owners = ownerIds.length ? await User.findAll({ where: { id: ownerIds } }) : [];
    const ownerMap = {}; owners.forEach(o => { ownerMap[o.id] = o; });

    // Per-workspace usage counts (one query per table grouped)
    async function countByWorkspace(model) {
      const rows = await model.findAll({
        attributes: ['workspaceId', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['workspaceId'],
        raw: true,
      });
      const map = {};
      rows.forEach(r => { map[r.workspaceId || 0] = parseInt(r.count, 10) || 0; });
      return map;
    }
    const [dsCounts, dashCounts, promptCounts, shareCounts] = await Promise.all([
      countByWorkspace(DataSource),
      countByWorkspace(SavedDashboard),
      countByWorkspace(PromptHistory),
      countByWorkspace(DashboardShare),
    ]);

    const decorated = workspaces.map(w => {
      const owner = ownerMap[w.ownerUserId];
      return {
        id: w.id, name: w.name, slug: w.slug, plan: w.plan,
        trialEndsAt: w.trialEndsAt, subscriptionStatus: w.subscriptionStatus,
        paymentProvider: w.paymentProvider,
        createdAt: w.createdAt,
        owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null,
        usage: {
          dataSources: dsCounts[w.id] || 0,
          dashboards:  dashCounts[w.id] || 0,
          prompts:     promptCounts[w.id] || 0,
          shares:      shareCounts[w.id] || 0,
        },
      };
    });

    const filtered = q
      ? decorated.filter(w =>
          (w.name || '').toLowerCase().includes(q) ||
          (w.slug || '').toLowerCase().includes(q) ||
          (w.owner && (w.owner.email || '').toLowerCase().includes(q)))
      : decorated;

    const stats = {
      total: workspaces.length,
      trialing:  workspaces.filter(w => w.subscriptionStatus === 'trialing').length,
      active:    workspaces.filter(w => w.subscriptionStatus === 'active').length,
      expired:   workspaces.filter(w => w.subscriptionStatus === 'expired').length,
      cancelled: workspaces.filter(w => w.subscriptionStatus === 'cancelled').length,
      starter:    workspaces.filter(w => w.plan === 'starter').length,
      business:   workspaces.filter(w => w.plan === 'business').length,
      enterprise: workspaces.filter(w => w.plan === 'enterprise').length,
    };

    adminRender(res, 'workspaces', {
      activeNav: 'workspaces',
      pageTitle: 'Workspaces',
      workspaces: filtered,
      stats,
      filters: { q, plan: planFilter, status: statusFilter },
      flash: flashFromQuery(req),
    });
  } catch (err) { next(err); }
}

async function workspacesUpdate(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const ws = await Workspace.findByPk(id);
    if (!ws) return res.redirect('/admin/workspaces?error=1');

    const newPlan   = (req.body.plan || ws.plan).toLowerCase();
    const newStatus = (req.body.subscriptionStatus || ws.subscriptionStatus).toLowerCase();
    if (planService.isValid(newPlan)) ws.plan = newPlan;
    ws.subscriptionStatus = newStatus;
    if (req.body.extendTrialDays) {
      const days = parseInt(req.body.extendTrialDays, 10);
      if (Number.isFinite(days) && days > 0) {
        const base = ws.trialEndsAt && new Date(ws.trialEndsAt) > new Date() ? new Date(ws.trialEndsAt) : new Date();
        base.setDate(base.getDate() + days);
        ws.trialEndsAt = base;
        if (ws.subscriptionStatus !== 'active') ws.subscriptionStatus = 'trialing';
      }
    }
    await ws.save();

    // Also bump the owner user's plan to keep UI in sync.
    if (ws.ownerUserId) {
      await User.update({ plan: ws.plan }, { where: { id: ws.ownerUserId } });
    }
    return res.redirect('/admin/workspaces?updated=1');
  } catch (err) { next(err); }
}

async function workspacesDelete(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.redirect('/admin/workspaces?error=1');
    // Cascade: zero out tenant rows (we keep them for audit) and unlink users.
    await Promise.all([
      DataSource.update({ workspaceId: null }, { where: { workspaceId: id } }),
      SavedDashboard.update({ workspaceId: null }, { where: { workspaceId: id } }),
      PromptHistory.update({ workspaceId: null }, { where: { workspaceId: id } }),
      DashboardShare.update({ workspaceId: null }, { where: { workspaceId: id } }),
      User.update({ workspaceId: null }, { where: { workspaceId: id } }),
    ]);
    await Workspace.destroy({ where: { id } });
    return res.redirect('/admin/workspaces?deleted=1');
  } catch (err) { next(err); }
}

// ───────────────────────── Subscriptions overview ─────────────────────────
async function subscriptionsShow(req, res, next) {
  try {
    const workspaces = await Workspace.findAll({ order: [['trialEndsAt', 'ASC']] });
    const ownerIds = [...new Set(workspaces.map(w => w.ownerUserId).filter(Boolean))];
    const owners = ownerIds.length ? await User.findAll({ where: { id: ownerIds } }) : [];
    const ownerMap = {}; owners.forEach(o => { ownerMap[o.id] = o; });

    const now = new Date();
    function daysLeft(d) {
      if (!d) return null;
      const ms = new Date(d).getTime() - now.getTime();
      return Math.ceil(ms / (24 * 60 * 60 * 1000));
    }
    const trialing = [];
    const expiringSoon = [];   // <=3 days
    const active = [];
    const expired = [];

    for (const w of workspaces) {
      const owner = ownerMap[w.ownerUserId] || null;
      const dl = daysLeft(w.trialEndsAt);
      const item = {
        id: w.id, name: w.name, plan: w.plan,
        subscriptionStatus: w.subscriptionStatus,
        trialEndsAt: w.trialEndsAt, daysLeft: dl,
        owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null,
      };
      if (w.subscriptionStatus === 'trialing') {
        if (dl !== null && dl <= 3) expiringSoon.push(item);
        else trialing.push(item);
      } else if (w.subscriptionStatus === 'active') {
        active.push(item);
      } else if (w.subscriptionStatus === 'expired' || w.subscriptionStatus === 'cancelled') {
        expired.push(item);
      }
    }

    const stats = {
      total:     workspaces.length,
      trialing:  trialing.length + expiringSoon.length,
      expiring:  expiringSoon.length,
      active:    active.length,
      expired:   expired.length,
      // Monthly recurring revenue estimate (placeholder — real billing in Phase 3)
      mrrEstimate: workspaces.reduce((sum, w) => {
        if (w.subscriptionStatus !== 'active') return sum;
        if (w.plan === 'business') return sum + 49;
        if (w.plan === 'enterprise') return sum + 199;
        return sum;
      }, 0),
    };

    adminRender(res, 'subscriptions', {
      activeNav: 'subscriptions',
      pageTitle: 'Subscriptions',
      stats,
      trialing, expiringSoon, active, expired,
      flash: flashFromQuery(req),
    });
  } catch (err) { next(err); }
}

module.exports = {
  isAdmin, requireAdmin, showLogin, login, logout,
  dashboard,
  landingShow, landingSave,
  featuresShow, featuresSave, featuresDelete,
  faqShow, faqSave, faqDelete,
  pricingShow, pricingSave, pricingDelete,
  aboutShow, aboutSave,
  contactShow, contactSave, contactSubmit,
  blogShow, blogSave, blogDelete,
  testimonialsShow, testimonialsSave, testimonialsDelete,
  portfolioShow, portfolioSave, portfolioDelete,
  templatesShow, templatesSave, templatesDelete,
  inquiriesShow, inquiriesUpdateStatus, inquiriesDelete,
  settingsShow, settingsSave,
  membersShow, membersResendVerification, membersDelete,
  workspacesShow, workspacesUpdate, workspacesDelete,
  subscriptionsShow,

  // legacy marketing pages
  PAGE_DEFS, PAGE_MAP, ensureSeed: ensureMarketingSeed, getPage,

  async list(req, res, next) {
    try {
      await ensureMarketingSeed();
      const pages = await MarketingPage.findAll({ order: [['label', 'ASC']] });
      adminRender(res, 'pages', { activeNav: 'pages', pageTitle: 'Marketing Pages', pages, flash: flashFromQuery(req) });
    } catch (err) { next(err); }
  },

  async editForm(req, res, next) {
    try {
      await ensureMarketingSeed();
      const page = await MarketingPage.findByPk(req.params.slug);
      if (!page) return res.redirect('/admin/pages');
      adminRender(res, 'page-form', { activeNav: 'pages', pageTitle: 'Edit Page – ' + page.label, page, flash: flashFromQuery(req) });
    } catch (err) { next(err); }
  },

  async update(req, res, next) {
    try {
      const page = await MarketingPage.findByPk(req.params.slug);
      if (!page) return res.redirect('/admin/pages');
      const fields = ['title', 'metaDescription', 'metaKeywords', 'heroEyebrow', 'heroTitle', 'heroSubtitle', 'bodyHtml'];
      fields.forEach((f) => { if (typeof req.body[f] === 'string') page[f] = req.body[f]; });
      page.isPublished = req.body.isPublished === 'on' || req.body.isPublished === 'true';
      await page.save();
      res.redirect('/admin/pages/' + page.slug + '/edit?saved=1');
    } catch (err) { next(err); }
  },
};
