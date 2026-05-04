const express = require('express');
const router = express.Router();
const upload = require('../config/multer');

const homeController = require('../controllers/homeController');
const sourceController = require('../controllers/sourceController');
const dashboardController = require('../controllers/dashboardController');
const builderController = require('../controllers/builderController');
const historyController = require('../controllers/historyController');
const templateController = require('../controllers/templateController');
const aiController = require('../controllers/aiController');
const conversationController = require('../controllers/conversationController');
const shareController = require('../controllers/shareController');
const wizardController = require('../controllers/wizardController');
const adminController = require('../controllers/adminController');
const authController = require('../controllers/authController');
const cmsService = require('../services/cmsService');
const planService = require('../services/planService');
const oauthService = require('../services/oauthService');
const workspaceService = require('../services/workspaceService');
const authToken = require('../utils/authToken');
const tenantCtx = require('../utils/tenantContext');
const db = require('../models');

// ─── Lightweight auth helpers (mock auth via cookie) ─────────────────
function parseCookies(req) {
  var raw = req.headers && req.headers.cookie;
  if (!raw) return {};
  return raw.split(';').reduce(function (acc, part) {
    var idx = part.indexOf('=');
    if (idx < 0) return acc;
    var k = part.slice(0, idx).trim();
    var v = part.slice(idx + 1).trim();
    try { acc[k] = decodeURIComponent(v); } catch (_) { acc[k] = v; }
    return acc;
  }, {});
}

/**
 * Load the current user + workspace from the signed `autodash_auth` cookie
 * and store them on `req`. Subsequent middleware (`requireAuth`,
 * `requireRole`, route handlers, views) can rely on req.user / req.workspace.
 *
 * Sets res.locals.currentUser / currentWorkspace / trialDaysLeft so views
 * can render the real user without controllers having to pass them.
 *
 * Wraps the rest of the request in a tenant ALS scope so Sequelize hooks
 * auto-filter every SELECT on tenant tables.
 */
async function loadAuth(req, res, next) {
  try {
    var cookies = parseCookies(req);
    var token = cookies.autodash_auth || '';
    var verified = authToken.verify(token);
    if (!verified) return next();
    var user = await db.User.findByPk(verified.uid);
    if (!user) return next();
    var workspace = null;
    if (user.workspaceId) {
      workspace = await db.Workspace.findByPk(user.workspaceId);
    }
    if (!workspace) {
      // Legacy: no workspace yet — create one on the fly.
      workspace = await workspaceService.createForUser(user, { plan: user.plan });
    }
    // Auto-downgrade expired trials before exposing the workspace
    workspace = await workspaceService.checkTrialExpiry(workspace);
    req.user = user;
    req.workspace = workspace;
    res.locals.currentUser = {
      id: user.id, name: user.name, email: user.email,
      role: user.role, plan: user.plan, avatarUrl: user.avatarUrl || null,
      onboardingCompleted: !!user.onboardingCompleted,
    };
    res.locals.currentWorkspace = {
      id: workspace.id, name: workspace.name, plan: workspace.plan,
      trialEndsAt: workspace.trialEndsAt, subscriptionStatus: workspace.subscriptionStatus,
    };
    res.locals.trialDaysLeft = workspaceService.trialDaysLeft(workspace);
    // Open tenant ALS context for the rest of the request
    tenantCtx.run({ user: user, workspace: workspace }, next);
  } catch (err) { next(err); }
}

function requireAuth(req, res, next) {
  console.log('[Auth] requireAuth check:', {
    path: req.path,
    hasUser: !!req.user,
    hasWorkspace: !!req.workspace,
    userId: req.user?.id,
    workspaceId: req.workspace?.id,
    accept: req.headers.accept,
    xhr: req.xhr,
  });
  if (req.user && req.workspace) return next();
  // For HTML page requests → redirect; for AJAX/JSON → 401
  var accepts = req.headers.accept || '';
  if (req.xhr || accepts.indexOf('application/json') !== -1) {
    console.log('[Auth] Returning 401 JSON (API request)');
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  console.log('[Auth] Redirecting to /auth (HTML request)');
  var next_url = encodeURIComponent(req.originalUrl || '/');
  return res.redirect('/auth?next=' + next_url);
}

/**
 * Block normal users from admin-only routes. Use after requireAuth.
 *   role: 'admin' | 'super_admin' | array of allowed roles
 */
function requireRole(roles) {
  var allowed = Array.isArray(roles) ? roles : [roles];
  return function (req, res, next) {
    if (!req.user) return res.redirect('/auth');
    if (allowed.indexOf(req.user.role) === -1) {
      var accepts = req.headers.accept || '';
      if (req.xhr || accepts.indexOf('application/json') !== -1) {
        return res.status(403).json({ success: false, error: 'You do not have permission to access this resource.' });
      }
      return res.redirect('/dashboard?error=' + encodeURIComponent('You do not have permission to access this page.'));
    }
    return next();
  };
}

// Apply loadAuth to every non-admin request so views always know who's
// logged in. Admin portal uses its own cookie (`autodash_admin`) and must
// query global tables unfiltered, so we skip the tenant context there.
router.use(function (req, res, next) {
  if (req.path.indexOf('/admin') === 0) return next();
  return loadAuth(req, res, next);
});

// ─── Auth routes ─────────────────────────────────────────────────────
router.get(['/auth', '/login', '/signup'], (req, res) => {
  const planId = planService.isValid(req.query.plan) ? String(req.query.plan).toLowerCase() : null;
  const selectedPlan = planId && planId !== 'enterprise' ? planService.get(planId) : null;
  res.render('auth', {
    title: 'Sign in to AutoDash AI – AI Dashboard Builder',
    layout: false,
    selectedPlan,
    initialTab: req.query.tab === 'signup' || planId ? 'signup' : 'signin',
    oauthEnabled: {
      google: oauthService.isEnabled('google'),
      microsoft: oauthService.isEnabled('microsoft'),
    },
    nextUrl: req.query.next || '',
    errorMessage: req.query.error || '',
  });
});

router.post('/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', [
    'autodash_auth=; Path=/; Max-Age=0; SameSite=Lax',
    'autodash_user=; Path=/; Max-Age=0; SameSite=Lax',
  ]);
  if ((req.headers.accept || '').indexOf('application/json') !== -1) {
    return res.json({ success: true });
  }
  res.redirect('/auth');
});

// Real auth — signup with email verification + password sign-in
router.post('/auth/signup',  authController.signup);
router.post('/auth/signin',  authController.signin);
router.post('/auth/resend',  authController.resend);
router.get('/auth/verify',   authController.verify);

// ─── OAuth (Google + Microsoft) ──────────────────────────────────────
// `state` carries the selected plan through the OAuth round-trip so we
// can apply the right plan when the user lands back at the callback.
router.get('/auth/google',
  (req, res, next) => {
    if (!oauthService.isEnabled('google')) return res.redirect('/auth?error=' + encodeURIComponent('Google sign-in is not configured.'));
    return oauthService.start('google', { state: String(req.query.plan || 'starter') })(req, res, next);
  });
router.get('/auth/google/callback',
  oauthService.callback('google', (profile, req, res) => authController.oauthHandle(profile, req, res)));

router.get('/auth/microsoft',
  (req, res, next) => {
    if (!oauthService.isEnabled('microsoft')) return res.redirect('/auth?error=' + encodeURIComponent('Microsoft sign-in is not configured.'));
    return oauthService.start('microsoft', { state: String(req.query.plan || 'starter') })(req, res, next);
  });
router.get('/auth/microsoft/callback',
  oauthService.callback('microsoft', (profile, req, res) => authController.oauthHandle(profile, req, res)));

// ─── Enterprise contact form ─────────────────────────────────────────
router.get('/contact-sales', (req, res) => {
  res.render('contact-sales', {
    layout: false,
    title: 'Talk to AutoDash AI Sales — Enterprise plans, white-glove onboarding',
    source: req.query.source || 'direct',
  });
});
router.post('/contact-sales', authController.contactSales);

// ─── Onboarding wizard ───────────────────────────────────────────────
router.get('/onboarding', requireAuth, authController.onboardingPage);
router.post('/onboarding/complete', requireAuth, authController.onboardingComplete);

// Public landing page (marketing homepage) — content from CMS
router.get('/', async (req, res, next) => {
  try {
    var cookies = parseCookies(req);
    var preview = req.query && (req.query.cms_preview === '1' || req.query.preview === '1');
    var cms = await cmsService.getAll({ draft: preview });
    res.render('landing', {
      layout: false,
      isAuthenticated: !!cookies.autodash_auth,
      cms: cms,
      preview: preview,
    });
  } catch (err) { next(err); }
});

// Authenticated dashboard home (was /)
router.get('/dashboard', requireAuth, homeController.index);
router.get('/ai-builder', requireAuth, homeController.aiBuilder);

// Public marketing / SEO pages (admin-managed via /admin/pages)
function renderMarketingPage(slug, fallbackView, fallbackLocals) {
  return async function (req, res, next) {
    try {
      const page = await adminController.getPage(slug);
      if (page && page.isPublished && page.bodyHtml && page.bodyHtml.trim()) {
        return res.render('public-page', {
          title: page.title || fallbackLocals.title,
          metaDescription: page.metaDescription || fallbackLocals.metaDescription,
          metaKeywords: page.metaKeywords || fallbackLocals.metaKeywords,
          canonicalPath: fallbackLocals.canonicalPath,
          hideSidebar: true,
          page,
        });
      }
      // Fallback to original static EJS
      return res.render(fallbackView, Object.assign({ hideSidebar: true }, fallbackLocals));
    } catch (err) { next(err); }
  };
}

router.get('/about', renderMarketingPage('about', 'about', {
  title: 'About AutoDash AI – AI Dashboard Builder Powered by Liknaya.com',
  metaDescription: 'Learn about AutoDash AI, an AI-powered dashboard builder and analytics platform that helps businesses generate KPI dashboards and executive reports automatically. Powered by Liknaya.com.',
  metaKeywords: 'AutoDash AI, about AutoDash AI, AI analytics platform, AI dashboard builder, business intelligence software, Liknaya, AI-powered reporting',
  canonicalPath: '/about',
}));
router.get('/features', renderMarketingPage('features', 'features', {
  title: 'Features – AI Dashboard Builder, KPI Recommendations, Smart Charts | AutoDash AI',
  metaDescription: 'Discover AutoDash AI features: AI dashboard generation, KPI recommendations, smart chart suggestions, multi-source data integration, interactive dashboards, and AI insights.',
  metaKeywords: 'AI dashboard builder features, KPI dashboard software, smart analytics platform, dashboard automation, interactive dashboards, AI-powered reporting',
  canonicalPath: '/features',
}));
router.get('/faq', renderMarketingPage('faq', 'faq', {
  title: 'FAQ – AutoDash AI Dashboard Builder & Analytics Platform',
  metaDescription: 'Answers to common questions about AutoDash AI, the AI dashboard builder and analytics platform: data sources, AI generation, sharing, and enterprise reporting.',
  metaKeywords: 'AutoDash AI FAQ, AI dashboard FAQ, AI analytics platform FAQ, dashboard automation, KPI dashboard software',
  canonicalPath: '/faq',
}));
router.get('/pricing', renderMarketingPage('pricing', 'pricing', {
  title: 'Pricing – AutoDash AI Dashboard Builder Plans & Pricing',
  metaDescription: 'Simple, transparent pricing for AutoDash AI. Start free with the Starter plan, scale with Business, or talk to sales about Enterprise. AI dashboard builder for every team.',
  metaKeywords: 'AutoDash AI pricing, AI dashboard pricing, BI software pricing, KPI dashboard plans, analytics platform pricing',
  canonicalPath: '/pricing',
}));
router.get('/contact', renderMarketingPage('contact', 'contact', {
  title: 'Contact – AutoDash AI Sales, Support & Partnerships',
  metaDescription: 'Contact the AutoDash AI team for product questions, sales, support, partnerships, or to request a demo of our AI dashboard builder. Powered by Liknaya.com.',
  metaKeywords: 'contact AutoDash AI, AutoDash AI sales, dashboard support, demo request, Liknaya contact',
  canonicalPath: '/contact',
}));

// Admin: unified password-protected admin panel
router.get('/admin/login',                       adminController.showLogin);
router.post('/admin/login',                      adminController.login);
router.post('/admin/logout',                     adminController.logout);

router.get('/admin',                             adminController.requireAdmin, adminController.dashboard);

router.get('/admin/landing',                     adminController.requireAdmin, adminController.landingShow);
router.post('/admin/landing',                    adminController.requireAdmin, adminController.landingSave);

router.get('/admin/features',                    adminController.requireAdmin, adminController.featuresShow);
router.post('/admin/features',                   adminController.requireAdmin, adminController.featuresSave);
router.post('/admin/features/:index/delete',     adminController.requireAdmin, adminController.featuresDelete);

router.get('/admin/faq',                         adminController.requireAdmin, adminController.faqShow);
router.post('/admin/faq',                        adminController.requireAdmin, adminController.faqSave);
router.post('/admin/faq/:index/delete',          adminController.requireAdmin, adminController.faqDelete);

router.get('/admin/pricing',                     adminController.requireAdmin, adminController.pricingShow);
router.post('/admin/pricing',                    adminController.requireAdmin, adminController.pricingSave);
router.post('/admin/pricing/:index/delete',      adminController.requireAdmin, adminController.pricingDelete);

router.get('/admin/about',                       adminController.requireAdmin, adminController.aboutShow);
router.post('/admin/about',                      adminController.requireAdmin, adminController.aboutSave);

router.get('/admin/contact',                     adminController.requireAdmin, adminController.contactShow);
router.post('/admin/contact',                    adminController.requireAdmin, adminController.contactSave);

router.get('/admin/blog',                        adminController.requireAdmin, adminController.blogShow);
router.post('/admin/blog',                       adminController.requireAdmin, adminController.blogSave);
router.post('/admin/blog/:index/delete',         adminController.requireAdmin, adminController.blogDelete);

router.get('/admin/testimonials',                adminController.requireAdmin, adminController.testimonialsShow);
router.post('/admin/testimonials',               adminController.requireAdmin, adminController.testimonialsSave);
router.post('/admin/testimonials/:index/delete', adminController.requireAdmin, adminController.testimonialsDelete);

router.get('/admin/portfolio',                   adminController.requireAdmin, adminController.portfolioShow);
router.post('/admin/portfolio',                  adminController.requireAdmin, adminController.portfolioSave);
router.post('/admin/portfolio/:index/delete',    adminController.requireAdmin, adminController.portfolioDelete);

router.get('/admin/templates',                   adminController.requireAdmin, adminController.templatesShow);
router.post('/admin/templates',                  adminController.requireAdmin, adminController.templatesSave);
router.post('/admin/templates/:id/delete',       adminController.requireAdmin, adminController.templatesDelete);

router.get('/admin/inquiries',                   adminController.requireAdmin, adminController.inquiriesShow);
router.post('/admin/inquiries/:id/status',       adminController.requireAdmin, adminController.inquiriesUpdateStatus);
router.post('/admin/inquiries/:id/delete',       adminController.requireAdmin, adminController.inquiriesDelete);

router.get('/admin/members',                     adminController.requireAdmin, adminController.membersShow);
router.post('/admin/members/:id/verify',         adminController.requireAdmin, adminController.membersResendVerification);
router.post('/admin/members/:id/delete',         adminController.requireAdmin, adminController.membersDelete);

router.get('/admin/workspaces',                  adminController.requireAdmin, adminController.workspacesShow);
router.post('/admin/workspaces/:id/update',      adminController.requireAdmin, adminController.workspacesUpdate);
router.post('/admin/workspaces/:id/delete',      adminController.requireAdmin, adminController.workspacesDelete);

router.get('/admin/subscriptions',               adminController.requireAdmin, adminController.subscriptionsShow);

router.get('/admin/settings',                    adminController.requireAdmin, adminController.settingsShow);
router.post('/admin/settings',                   adminController.requireAdmin, adminController.settingsSave);

// Legacy marketing-pages CRUD (keeps /admin/pages working under new layout)
router.get('/admin/pages',                       adminController.requireAdmin, adminController.list);
router.get('/admin/pages/:slug/edit',            adminController.requireAdmin, adminController.editForm);
router.post('/admin/pages/:slug',                adminController.requireAdmin, adminController.update);

// Public contact-form submission → stored as inquiry
router.post('/contact',                          adminController.contactSubmit);

// SEO: robots.txt
router.get('/robots.txt', (req, res) => {
  const host = (process.env.SITE_URL || ('https://' + req.get('host') || 'https://autodash.liknaya.com')).replace(/\/$/, '');
  res.type('text/plain').send(
    'User-agent: *\n' +
    'Allow: /\n' +
    'Disallow: /api/\n' +
    'Disallow: /ai/\n' +
    'Disallow: /dashboard/\n' +
    'Disallow: /sources/\n' +
    'Disallow: /templates/\n' +
    'Disallow: /wizard\n' +
    'Disallow: /wizard/\n' +
    'Disallow: /wizard-guided/\n' +
    'Disallow: /share/\n' +
    'Allow: /ai-builder\n' +
    'Allow: /about\n' +
    'Allow: /features\n' +
    'Allow: /faq\n' +
    'Allow: /pricing\n' +
    'Allow: /contact\n' +
    '\n' +
    'Sitemap: ' + host + '/sitemap.xml\n'
  );
});

// SEO: sitemap.xml
router.get('/sitemap.xml', (req, res) => {
  const host = (process.env.SITE_URL || ('https://' + req.get('host') || 'https://autodash.liknaya.com')).replace(/\/$/, '');
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: '/',          priority: '1.0', changefreq: 'weekly' },
    { loc: '/about',     priority: '0.8', changefreq: 'monthly' },
    { loc: '/features',  priority: '0.9', changefreq: 'monthly' },
    { loc: '/faq',       priority: '0.7', changefreq: 'monthly' },
    { loc: '/pricing',   priority: '0.8', changefreq: 'monthly' },
    { loc: '/contact',   priority: '0.6', changefreq: 'monthly' },
    { loc: '/ai-builder',priority: '0.9', changefreq: 'weekly' },
  ];
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u => (
      '  <url>\n' +
      '    <loc>' + host + u.loc + '</loc>\n' +
      '    <lastmod>' + today + '</lastmod>\n' +
      '    <changefreq>' + u.changefreq + '</changefreq>\n' +
      '    <priority>' + u.priority + '</priority>\n' +
      '  </url>\n'
    )).join('') +
    '</urlset>\n';
  res.type('application/xml').send(xml);
});

// Data Sources
router.get('/sources', requireAuth, sourceController.list);
router.get('/sources/new', requireAuth, sourceController.showForm);
router.post('/sources', requireAuth, upload.single('file'), sourceController.create);
router.get('/sources/:id', requireAuth, sourceController.detail);
router.post('/sources/:id/test', sourceController.test);
router.post('/sources/:id/analyze', sourceController.analyze);
router.post('/sources/:id/delete', sourceController.destroy);

// Semantic model — read/edit/rebuild
router.get ('/sources/:id/semantic-model',         requireAuth, sourceController.semanticModelGet);
router.put ('/sources/:id/semantic-model',         requireAuth, sourceController.semanticModelUpdate);
router.post('/sources/:id/semantic-model/rebuild', requireAuth, sourceController.semanticModelRebuild);

// Dashboard
router.post('/dashboard/generate-multi', dashboardController.generateMulti);
router.post('/dashboard/generate', dashboardController.generate);
router.post('/dashboard/save', dashboardController.save);
router.post('/dashboard/save-direct', dashboardController.saveDirect);  // AJAX save (preserves canvas state)
router.post('/dashboard/generate-panel', dashboardController.generatePanel);
router.post('/dashboard/recalculate-panel', dashboardController.recalculatePanel);
router.post('/dashboard/refresh-kpi', dashboardController.refreshKpi);
router.post('/dashboard/:id/layout', dashboardController.saveLayout);  // Save custom layout
router.get('/dashboard/schema', builderController.schema);          // Manual builder schema API
router.post('/dashboard/manual-panel', builderController.manualPanel); // Manual builder single panel
router.post('/dashboard/manual-multi', builderController.manualMulti);  // Manual builder render result
router.post('/dashboard/full', builderController.fullDashboard);         // Auto full corporate dashboard
router.post('/dashboard/:id/update', dashboardController.update);
router.post('/dashboard/:id/delete', dashboardController.destroy);
router.get('/dashboard/history', requireAuth, historyController.index);
router.get('/dashboard/:id/edit-canvas', requireAuth, dashboardController.editInCanvas);
router.get('/dashboard/:id', requireAuth, dashboardController.detail);

// Dashboard share links (interactive sharing)
router.post('/dashboard/:id/share', shareController.createShare);
router.get('/dashboard/:id/shares', shareController.listShares);
router.post('/dashboard/share/:shareId/revoke', shareController.revokeShare);
router.post('/dashboard/share/:shareId/regenerate', shareController.regenerateShare);

// Public shared dashboard view (no auth, token-based)
router.get('/share/dashboard/:token', shareController.viewShared);
router.post('/share/dashboard/:token', shareController.viewShared);

// Dashboard Wizard (6-step guided creation)
router.get('/wizard', requireAuth, wizardController.show);

// Wizard analyze with multer error handling
router.post('/wizard/analyze', (req, res, next) => {
  upload.single('dataFile')(req, res, (err) => {
    if (err) {
      console.error('[Wizard Route] Multer error:', err.message);
      return res.status(400).json({
        success: false,
        error: err.message,
      });
    }
    next();
  });
}, wizardController.analyzeDataSource);

router.post('/wizard/recommendations', wizardController.getRecommendations);
router.post('/wizard/analyze-sheet', wizardController.analyzeSheet);
router.post('/wizard/generate', wizardController.generateDashboard);
router.post('/wizard/save-progress', wizardController.saveWizardProgress);
router.get('/wizard/resume', wizardController.resumeWizard);
router.post('/wizard/save', wizardController.saveDashboard);
router.post('/wizard/test-connection', wizardController.testConnection);

// NEW: Guided Dashboard Creation Wizard Endpoints
router.get('/wizard-guided/templates', wizardController.getAvailableTemplates);
router.post('/wizard-guided/analyze-sources', wizardController.getSourcesAnalysis);
router.post('/wizard-guided/generate', wizardController.generateAutoDashboard);
router.post('/wizard-guided/generate-full', wizardController.generateFullDashboard);
router.post('/wizard-guided/generate-from-prompt', wizardController.createFromPrompt);
router.post('/wizard-guided/save', wizardController.saveGeneratedDashboard);

// Templates
router.get('/templates', requireAuth, templateController.list);
router.get('/templates/new', requireAuth, templateController.showForm);
router.post('/templates', templateController.create);
router.get('/templates/:id/edit', requireAuth, templateController.showForm);
router.post('/templates/:id', templateController.update);
router.post('/templates/:id/delete', templateController.destroy);

// API: Dashboard Templates
router.get('/api/dashboard-templates/:id', templateController.getLayoutTemplate);
router.get('/api/dashboard-templates', templateController.listLayoutTemplates);

// TEST: Simple health check API
router.get('/api/test', (req, res) => {
  res.json({ status: 'ok', message: 'API is working' });
});

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// AI
router.get('/ai/status', aiController.status);
router.post('/ai/suggestions', aiController.suggestions);
router.post('/ai/executive-summary', aiController.executiveSummary);
router.get('/ai/settings', requireAuth, aiController.settingsPage);
router.get('/ai-settings', requireAuth, aiController.settingsPage);
router.post('/ai-settings', requireAuth, aiController.saveSettings);
router.post('/ai/test', requireAuth, aiController.testConnection);

// ─── Ask AI conversational workspace (Phase 1) ───────────────────────
router.get('/ask-ai', requireAuth, conversationController.page);
router.get('/api/conversations',                requireAuth, conversationController.listThreads);
router.post('/api/conversations',               requireAuth, conversationController.createThread);
router.get('/api/conversations/:id',            requireAuth, conversationController.getThread);
router.patch('/api/conversations/:id',          requireAuth, conversationController.renameThread);
router.delete('/api/conversations/:id',         requireAuth, conversationController.deleteThread);
router.post('/api/conversations/:id/messages',  requireAuth, conversationController.sendMessage);

// ─── Billing (placeholder for Phase 3) ───────────────────────────────
router.get('/billing', requireAuth, function (req, res) {
  var ws = req.workspace;
  var planId = (ws && ws.plan) || 'starter';
  var limits = planService.getLimits(planId);
  var trialDaysLeft = workspaceService.trialDaysLeft(ws);
  res.render('billing', {
    title: 'Billing & Subscription',
    workspace: ws,
    plan: planService.get(planId) || { id: planId, name: planId },
    limits: limits,
    trialDaysLeft: trialDaysLeft,
  });
});

// ─── Payment & Subscription (PayMongo Integration) ─────────────────────
const paymentController = require('../controllers/paymentController');

router.get('/api/payment/plans',                                  paymentController.getPlans);
router.get('/api/payment/limits',                 requireAuth,    paymentController.getLimits);
router.post('/api/payment/checkout',              requireAuth,    paymentController.createCheckout);
router.get('/api/payment/checkout/:checkoutId',   requireAuth,    paymentController.getCheckoutStatus);
router.post('/api/payment/upgrade',               requireAuth,    paymentController.upgradePlan);
router.post('/api/payment/webhook',                               paymentController.handleWebhook);

// ─── Team / workspace members ────────────────────────────────────────
// Lists users in the current workspace and lets the owner change roles
// or remove members. Visible to admin / super_admin only.
router.get('/settings/team', requireAuth, requireRole(['admin', 'super_admin']), async function (req, res, next) {
  try {
    var ws = req.workspace;
    if (!ws) return res.redirect('/dashboard');
    var members = await db.User.findAll({
      where: { workspaceId: ws.id },
      order: [['createdAt', 'ASC']],
      attributes: ['id', 'name', 'email', 'role', 'plan', 'lastLoginAt', 'createdAt', 'authProvider'],
    });
    var limits = planService.getLimits(ws.plan || 'starter');
    res.render('team', {
      title: 'Team & Members',
      workspace: ws,
      members: members,
      memberLimit: limits && limits.teamMembers != null ? limits.teamMembers : null,
      isOwner: ws.ownerUserId === req.user.id,
      query: req.query || {},
    });
  } catch (err) {
    next(err);
  }
});

router.post('/settings/team/:id/role', requireAuth, requireRole(['admin', 'super_admin']), async function (req, res, next) {
  try {
    var ws = req.workspace;
    var targetId = parseInt(req.params.id, 10);
    var newRole = String(req.body.role || '').trim();
    var allowedRoles = ['admin', 'member', 'viewer'];
    if (!allowedRoles.includes(newRole)) {
      return res.redirect('/settings/team?error=' + encodeURIComponent('Invalid role.'));
    }
    var target = await db.User.findOne({ where: { id: targetId, workspaceId: ws.id } });
    if (!target) return res.redirect('/settings/team?error=' + encodeURIComponent('Member not found.'));
    if (target.id === ws.ownerUserId) {
      return res.redirect('/settings/team?error=' + encodeURIComponent('Cannot change the workspace owner role.'));
    }
    target.role = newRole;
    await target.save();
    return res.redirect('/settings/team?updated=1');
  } catch (err) {
    next(err);
  }
});

router.post('/settings/team/:id/remove', requireAuth, requireRole(['admin', 'super_admin']), async function (req, res, next) {
  try {
    var ws = req.workspace;
    var targetId = parseInt(req.params.id, 10);
    var target = await db.User.findOne({ where: { id: targetId, workspaceId: ws.id } });
    if (!target) return res.redirect('/settings/team?error=' + encodeURIComponent('Member not found.'));
    if (target.id === ws.ownerUserId) {
      return res.redirect('/settings/team?error=' + encodeURIComponent('Cannot remove the workspace owner.'));
    }
    if (target.id === req.user.id) {
      return res.redirect('/settings/team?error=' + encodeURIComponent('You cannot remove yourself.'));
    }
    // Detach from workspace rather than hard-delete so historical data
    // (dashboards, prompts) keeps a referential trail.
    target.workspaceId = null;
    await target.save();
    return res.redirect('/settings/team?removed=1');
  } catch (err) {
    next(err);
  }
});

// ─── Global PlanLimitError handler ───────────────────────────────────
// When any route handler throws a PlanLimitError (e.g. via
// `workspaceService.enforceLimit`) we surface it as 402 JSON for AJAX
// callers (frontend modal handles it) and as a redirect to /billing for
// HTML form posts. Status 402 = "Payment Required" (RFC 7231 reserved).
router.use(function (err, req, res, next) {
  if (err && err.name === 'PlanLimitError') {
    var info = err.info || {};
    var accepts = req.headers.accept || '';
    if (req.xhr || accepts.indexOf('application/json') !== -1) {
      return res.status(402).json(Object.assign({ success: false, error: 'plan_limit', message: err.message }, info));
    }
    var qs = 'limit_hit=' + encodeURIComponent(info.key || '') + '&plan=' + encodeURIComponent(info.plan || '');
    return res.redirect('/billing?' + qs);
  }
  return next(err);
});

module.exports = router;
