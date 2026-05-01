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
const shareController = require('../controllers/shareController');
const wizardController = require('../controllers/wizardController');
const adminController = require('../controllers/adminController');
const adminSimple = require('../controllers/adminSimpleController');
const cmsService = require('../services/cmsService');

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

function requireAuth(req, res, next) {
  var cookies = parseCookies(req);
  if (cookies.autodash_auth) return next();
  // For HTML page requests → redirect; for AJAX/JSON → 401
  var accepts = req.headers.accept || '';
  if (req.xhr || accepts.indexOf('application/json') !== -1) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  var next_url = encodeURIComponent(req.originalUrl || '/');
  return res.redirect('/auth?next=' + next_url);
}

// ─── Auth routes ─────────────────────────────────────────────────────
router.get(['/auth', '/login', '/signup'], (req, res) => {
  res.render('auth', {
    title: 'Sign in to AutoDash AI – AI Dashboard Builder',
    layout: false,
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

// Admin: simple password-protected landing-page content editor
router.get('/admin',         adminSimple.show);
router.post('/admin/login',  adminSimple.login);
router.post('/admin/logout', adminSimple.logout);
router.post('/admin/save',   adminSimple.save);
router.post('/admin/reset',  adminSimple.reset);

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
router.post('/ai/test', aiController.testConnection);

module.exports = router;
