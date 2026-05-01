'use strict';

const { MarketingPage } = require('../models');

const PAGE_DEFS = [
  {
    slug: 'features',
    label: 'Features',
    defaults: {
      title: 'Features – AI Dashboard Builder, KPI Recommendations, Smart Charts | AutoDash AI',
      metaDescription: 'Discover AutoDash AI features: AI dashboard generation, KPI recommendations, smart chart suggestions, multi-source data integration, interactive dashboards, and AI insights.',
      metaKeywords: 'AI dashboard builder features, KPI dashboard software, smart analytics platform, dashboard automation, interactive dashboards, AI-powered reporting',
      heroEyebrow: 'Platform Features',
      heroTitle: 'Everything you need to build better dashboards',
      heroSubtitle: 'AI-powered features that make analytics effortless for every team.',
    },
  },
  {
    slug: 'about',
    label: 'About',
    defaults: {
      title: 'About AutoDash AI – AI Dashboard Builder Powered by Liknaya.com',
      metaDescription: 'Learn about AutoDash AI, an AI-powered dashboard builder and analytics platform that helps businesses generate KPI dashboards and executive reports automatically.',
      metaKeywords: 'AutoDash AI, about AutoDash AI, AI analytics platform, AI dashboard builder, business intelligence software, Liknaya, AI-powered reporting',
      heroEyebrow: 'About Us',
      heroTitle: 'About AutoDash AI',
      heroSubtitle: 'AutoDash AI by Liknaya helps modern teams turn data into decisions — faster.',
    },
  },
  {
    slug: 'faq',
    label: 'FAQ',
    defaults: {
      title: 'FAQ – AutoDash AI Dashboard Builder & Analytics Platform',
      metaDescription: 'Answers to common questions about AutoDash AI, the AI dashboard builder and analytics platform: data sources, AI generation, sharing, and enterprise reporting.',
      metaKeywords: 'AutoDash AI FAQ, AI dashboard FAQ, AI analytics platform FAQ, dashboard automation, KPI dashboard software',
      heroEyebrow: 'Help Center',
      heroTitle: 'Frequently Asked Questions',
      heroSubtitle: 'Everything you need to know about AutoDash AI.',
    },
  },
  {
    slug: 'pricing',
    label: 'Pricing',
    defaults: {
      title: 'Pricing – AutoDash AI Dashboard Builder Plans & Pricing',
      metaDescription: 'Simple, transparent pricing for AutoDash AI. Start free with the Starter plan, scale with Business, or talk to sales about Enterprise.',
      metaKeywords: 'AutoDash AI pricing, AI dashboard pricing, BI software pricing, KPI dashboard plans, analytics platform pricing',
      heroEyebrow: 'Pricing',
      heroTitle: 'Simple, transparent pricing',
      heroSubtitle: 'Start free. Scale when you’re ready. No surprises.',
    },
  },
  {
    slug: 'contact',
    label: 'Contact',
    defaults: {
      title: 'Contact – AutoDash AI Sales, Support & Partnerships',
      metaDescription: 'Contact the AutoDash AI team for product questions, sales, support, partnerships, or to request a demo of our AI dashboard builder.',
      metaKeywords: 'contact AutoDash AI, AutoDash AI sales, dashboard support, demo request, Liknaya contact',
      heroEyebrow: 'Contact',
      heroTitle: 'Get in touch',
      heroSubtitle: 'Talk to our team about AutoDash AI.',
    },
  },
];

const PAGE_MAP = PAGE_DEFS.reduce((acc, p) => { acc[p.slug] = p; return acc; }, {});

async function ensureSeed() {
  for (const def of PAGE_DEFS) {
    const [row, created] = await MarketingPage.findOrCreate({
      where: { slug: def.slug },
      defaults: {
        slug: def.slug,
        label: def.label,
        title: def.defaults.title,
        metaDescription: def.defaults.metaDescription,
        metaKeywords: def.defaults.metaKeywords,
        heroEyebrow: def.defaults.heroEyebrow,
        heroTitle: def.defaults.heroTitle,
        heroSubtitle: def.defaults.heroSubtitle,
        bodyHtml: '',
        isPublished: true,
      },
    });
    if (!created && row.label !== def.label) {
      row.label = def.label;
      await row.save();
    }
  }
}

async function getPage(slug) {
  return await MarketingPage.findByPk(slug);
}

module.exports = {
  PAGE_DEFS,
  PAGE_MAP,
  ensureSeed,
  getPage,

  // ─── Admin: list ────────────────────────────────────────────────
  async list(req, res, next) {
    try {
      await ensureSeed();
      const pages = await MarketingPage.findAll({ order: [['label', 'ASC']] });
      res.render('admin/pages', {
        title: 'Manage Pages – AutoDash AI Admin',
        pages,
      });
    } catch (err) { next(err); }
  },

  // ─── Admin: edit form ───────────────────────────────────────────
  async editForm(req, res, next) {
    try {
      await ensureSeed();
      const page = await MarketingPage.findByPk(req.params.slug);
      if (!page) {
        req.flash('error', 'Page not found');
        return res.redirect('/admin/pages');
      }
      res.render('admin/page-form', {
        title: `Edit ${page.label} – AutoDash AI Admin`,
        page,
      });
    } catch (err) { next(err); }
  },

  // ─── Admin: save ────────────────────────────────────────────────
  async update(req, res, next) {
    try {
      const page = await MarketingPage.findByPk(req.params.slug);
      if (!page) {
        req.flash('error', 'Page not found');
        return res.redirect('/admin/pages');
      }
      const fields = ['title', 'metaDescription', 'metaKeywords', 'heroEyebrow', 'heroTitle', 'heroSubtitle', 'bodyHtml'];
      fields.forEach((f) => {
        if (typeof req.body[f] === 'string') page[f] = req.body[f];
      });
      page.isPublished = req.body.isPublished === 'on' || req.body.isPublished === 'true' || req.body.isPublished === true;
      await page.save();
      req.flash('success', `${page.label} page updated`);
      res.redirect('/admin/pages/' + page.slug + '/edit');
    } catch (err) { next(err); }
  },
};
