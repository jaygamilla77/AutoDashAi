'use strict';

/**
 * cmsService — Single source of truth for landing page CMS content.
 *
 * Sections are stored as JSON blobs in the `site_content` table (one row per
 * section). `getAll()` returns a merged object with defaults so the landing
 * page can always render something even on a fresh install.
 *
 * Public API:
 *   getDefaults()       → full default content tree
 *   ensureSeed()        → insert default rows for every section (idempotent)
 *   getAll(opts)        → { hero, nav, features, faq, pricing, footer, ... }
 *                         opts.draft=true returns drafts where present
 *   getSection(name)    → published data for one section (with defaults merged)
 *   updateSection(...)  → save a section (publish or draft)
 *   publishAll()        → promote all drafts to published
 *   revertAll()         → drop all drafts
 */

const { SiteContent } = require('../models');

// ───────────────────────── DEFAULTS ─────────────────────────
const DEFAULTS = {
  branding: {
    name: 'AutoDash',
    nameAccent: 'AI',
    tagline: 'by Liknaya',
    iconClass: 'bi-bar-chart-line-fill',
    primaryColor: '#2563EB',
  },

  seo: {
    pages: {
      home: {
        title: 'AutoDash AI by Liknaya — Turn Your Data Into Powerful Insights with AI',
        description: 'AutoDash AI by Liknaya helps you create intelligent dashboards, uncover trends, and make data-driven decisions in minutes. Connect any data source. Powered by Liknaya.com.',
        keywords: 'AI dashboard builder, AI analytics platform, KPI dashboard, business intelligence software, automated dashboard creator, dashboard automation, AI-powered reporting, smart analytics platform',
        canonical: 'https://autodash.liknaya.com/',
        ogImage: 'https://autodash.liknaya.com/og-cover.png',
        robots: 'index, follow, max-image-preview:large, max-snippet:-1',
      },
    },
    sitemap: {
      enabled: true,
      changefreq: 'weekly',
    },
  },

  nav: {
    showSignIn: true,
    showGetStarted: true,
    signInLabel: 'Sign In',
    getStartedLabel: 'Get Started Free',
    items: [
      { label: 'Features', href: '/features' },
      { label: 'About',    href: '/about' },
      { label: 'FAQ',      href: '/faq' },
      { label: 'Pricing',  href: '/pricing' },
      { label: 'Contact',  href: '/contact' },
    ],
  },

  hero: {
    eyebrowIcon: 'bi-stars',
    eyebrowText: 'AI-Powered Dashboard Platform',
    titleStart: 'Turn Your Data Into Powerful Insights with',
    titleAccent: 'AI',
    titleEnd: '',
    subtitle: 'AutoDash AI by Liknaya helps you create intelligent dashboards, uncover trends, and make data-driven decisions in minutes.',
    primaryCta:   { label: 'Get Started Free', href: '/auth?tab=signup', icon: 'bi-rocket-takeoff' },
    secondaryCta: { label: 'Watch Demo',       href: '#demo',            icon: 'bi-play-circle'   },
    trust: [
      { icon: 'bi-check-circle-fill', text: 'No credit card required' },
      { icon: 'bi-check-circle-fill', text: 'Setup in 60 seconds' },
      { icon: 'bi-check-circle-fill', text: 'Cancel anytime' },
    ],
    previewTitle:    'Create Dashboard via Wizard',
    previewSubtitle: 'Answer a few questions and let AI build the perfect dashboard for your data.',
  },

  features: {
    items: [
      { icon: 'bi-stars',     title: 'AI-Powered',          description: 'Smart insights and automated analytics' },
      { icon: 'bi-bar-chart', title: 'Easy to Use',         description: 'No coding required, just your data' },
      { icon: 'bi-database',  title: 'Any Data Source',     description: 'Connect databases, Excel, CSV, APIs and more' },
      { icon: 'bi-people',    title: 'Share & Collaborate', description: 'Share dashboards and work with your team' },
    ],
  },

  stats: {
    items: [
      { icon: 'bi-people-fill',     value: '10K+',  label: 'Happy Users' },
      { icon: 'bi-bar-chart-fill',  value: '50K+',  label: 'Dashboards Created' },
      { icon: 'bi-database-fill',   value: '120+',  label: 'Data Sources Supported' },
      { icon: 'bi-shield-check',    value: '99.9%', label: 'Uptime & Reliability' },
    ],
  },

  faq: {
    title: 'Frequently Asked Questions',
    subtitle: 'Everything you need to know about AutoDash AI.',
    items: [
      { question: 'What is AutoDash AI?',                         answer: 'AutoDash AI is an AI-powered dashboard builder that automatically generates KPI dashboards and executive reports from any data source.' },
      { question: 'Do I need a credit card to get started?',      answer: 'No. The Starter plan is free forever and does not require a credit card.' },
      { question: 'Which data sources are supported?',            answer: 'CSV, Excel, SQL databases, REST APIs, and more — including direct uploads and live connections.' },
      { question: 'Can I share my dashboards with my team?',      answer: 'Yes. You can share dashboards via secure links or invite teammates with role-based access.' },
      { question: 'Is my data secure?',                           answer: 'All data is encrypted in transit and at rest. We never use your data to train external models.' },
    ],
  },

  pricing: {
    title: 'Simple, transparent pricing',
    subtitle: 'Start free. Scale when you’re ready. No hidden fees.',
    plans: [
      {
        name: 'Starter', price: '$0', period: '/forever', recommended: false,
        description: 'For individuals exploring AI-powered dashboards.',
        cta: { label: 'Get Started Free', href: '/auth?tab=signup' },
        features: ['1 user', '3 dashboards', 'CSV & Excel uploads', 'AI dashboard generation', 'Community support'],
      },
      {
        name: 'Business', price: '$29', period: '/user / month', recommended: true,
        description: 'For growing teams that need power and collaboration.',
        cta: { label: 'Start Free Trial', href: '/auth?tab=signup' },
        features: ['Unlimited dashboards', 'All data sources', 'Team collaboration', 'AI insights & narratives', 'Priority support'],
      },
      {
        name: 'Enterprise', price: 'Custom', period: '', recommended: false,
        description: 'For organizations with advanced security and scale.',
        cta: { label: 'Contact Sales', href: '/contact' },
        features: ['SSO & SCIM', 'Audit logs', 'Custom data residency', 'Dedicated CSM', 'SLA & 24/7 support'],
      },
    ],
  },

  footer: {
    tagline: 'The intelligent AI dashboard platform for modern businesses. Create, customize, and share dashboards in minutes.',
    socials: [
      { icon: 'bi-linkedin',  href: 'https://liknaya.com', label: 'LinkedIn' },
      { icon: 'bi-twitter-x', href: '#',                   label: 'Twitter'  },
      { icon: 'bi-youtube',   href: '#',                   label: 'YouTube'  },
      { icon: 'bi-github',    href: '#',                   label: 'GitHub'   },
    ],
    columns: [
      { title: 'Product', links: [
        { label: 'Features',      href: '/features' },
        { label: 'AI Builder',    href: '/auth?tab=signup' },
        { label: 'Data Sources',  href: '/features#data-sources' },
        { label: 'Integrations',  href: '/features#integrations' },
      ]},
      { title: 'Company', links: [
        { label: 'About Us', href: '/about' },
        { label: 'Careers',  href: '/about#careers' },
        { label: 'Blog',     href: '#' },
        { label: 'Pricing',  href: '/pricing' },
        { label: 'Contact',  href: '/contact' },
      ]},
      { title: 'Resources', links: [
        { label: 'FAQ',           href: '/faq' },
        { label: 'Documentation', href: '#' },
        { label: 'Help Center',   href: '/contact' },
        { label: 'API Reference', href: '#' },
        { label: 'Status',        href: '#' },
      ]},
      { title: 'Legal', links: [
        { label: 'Privacy Policy',   href: '#' },
        { label: 'Terms of Service', href: '#' },
        { label: 'Security',         href: '#' },
        { label: 'Cookie Policy',    href: '#' },
      ]},
    ],
    copyright:    '© 2026 AutoDash AI by Liknaya. All rights reserved.',
    poweredBy:    'Powered by',
    poweredByUrl: 'https://liknaya.com',
    poweredByLabel: 'Liknaya.com',
  },

  about: {
    title: 'About AutoDash AI',
    mission: 'Empower every team to make data-driven decisions in minutes, not months.',
    description: 'AutoDash AI by Liknaya is an AI-powered dashboard platform that turns raw data into clear, actionable insights — automatically.',
    poweredBy: 'Powered by Liknaya.com',
  },

  contact: {
    title: 'Get in touch',
    subtitle: 'Talk to our team about AutoDash AI.',
    supportEmail: 'support@liknaya.com',
    businessEmail: 'hello@liknaya.com',
    phone: '',
    address: '',
    formEnabled: true,
    formSuccessMessage: 'Thanks! We received your message and will reply within 1 business day.',
  },

  blog: {
    items: [],
  },

  testimonials: {
    items: [],
  },

  portfolio: {
    items: [],
  },

  settings: {
    logoText: 'AutoDash AI',
    brandName: 'AutoDash AI by Liknaya',
    footerText: '© 2026 AutoDash AI by Liknaya. All rights reserved.',
    seoTitle: 'AutoDash AI – Intelligent AI Dashboard Builder',
    seoDescription: 'AutoDash AI is an AI dashboard builder and analytics platform that automatically generates KPI dashboards from any data source.',
    social: [
      { label: 'LinkedIn', icon: 'bi-linkedin',  href: 'https://liknaya.com' },
      { label: 'Twitter',  icon: 'bi-twitter-x', href: '#' },
      { label: 'YouTube',  icon: 'bi-youtube',   href: '#' },
      { label: 'GitHub',   icon: 'bi-github',    href: '#' },
    ],
  },
};

// ───────────────────────── SECTIONS METADATA ─────────────────────────
const SECTION_META = [
  { key: 'branding', label: 'Branding',     icon: 'bi-palette2',          group: 'Site' },
  { key: 'seo',      label: 'SEO Settings', icon: 'bi-search',            group: 'Site' },
  { key: 'nav',      label: 'Navigation',   icon: 'bi-menu-button-wide',  group: 'Landing Page' },
  { key: 'hero',     label: 'Hero',         icon: 'bi-window-stack',      group: 'Landing Page' },
  { key: 'features', label: 'Features',     icon: 'bi-grid-3x3-gap',      group: 'Landing Page' },
  { key: 'stats',    label: 'Stats',        icon: 'bi-graph-up-arrow',    group: 'Landing Page' },
  { key: 'faq',      label: 'FAQ',          icon: 'bi-patch-question',    group: 'Landing Page' },
  { key: 'pricing',  label: 'Pricing',      icon: 'bi-tag',               group: 'Landing Page' },
  { key: 'footer',   label: 'Footer',       icon: 'bi-layout-text-window-reverse', group: 'Landing Page' },
];

// ───────────────────────── HELPERS ─────────────────────────
function deepClone(v) { return JSON.parse(JSON.stringify(v)); }

function getDefaults() { return deepClone(DEFAULTS); }
function getSectionDefault(name) { return deepClone(DEFAULTS[name] || {}); }

async function ensureSeed() {
  const rows = await SiteContent.findAll();
  const have = new Set(rows.map(r => r.section));
  const toCreate = Object.keys(DEFAULTS)
    .filter(k => !have.has(k))
    .map(k => ({ section: k, data: deepClone(DEFAULTS[k]), draft: null }));
  if (toCreate.length) {
    await SiteContent.bulkCreate(toCreate);
  }
}

async function getAll(opts) {
  opts = opts || {};
  await ensureSeed();
  const rows = await SiteContent.findAll();
  const out = getDefaults();
  rows.forEach(r => {
    const value = opts.draft && r.draft ? r.draft : r.data;
    if (value && typeof value === 'object') {
      out[r.section] = value;
    }
  });
  return out;
}

async function getSection(name, opts) {
  opts = opts || {};
  await ensureSeed();
  const row = await SiteContent.findByPk(name);
  if (!row) return getSectionDefault(name);
  if (opts.draft && row.draft) return row.draft;
  return row.data || getSectionDefault(name);
}

async function updateSection(name, payload, opts) {
  opts = opts || {};
  await ensureSeed();
  if (!Object.prototype.hasOwnProperty.call(DEFAULTS, name)) {
    throw new Error('Unknown section: ' + name);
  }
  const [row] = await SiteContent.findOrCreate({
    where: { section: name },
    defaults: { section: name, data: getSectionDefault(name) },
  });
  if (opts.draft) {
    row.draft = payload;
  } else {
    row.data = payload;
    row.draft = null; // publishing clears draft
  }
  await row.save();
  return row;
}

async function publishAll() {
  const rows = await SiteContent.findAll({ where: {} });
  const promises = rows
    .filter(r => r.draft)
    .map(r => { r.data = r.draft; r.draft = null; return r.save(); });
  await Promise.all(promises);
  return promises.length;
}

async function revertAll() {
  const rows = await SiteContent.findAll();
  const promises = rows
    .filter(r => r.draft)
    .map(r => { r.draft = null; return r.save(); });
  await Promise.all(promises);
  return promises.length;
}

async function resetSection(name) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULTS, name)) {
    throw new Error('Unknown section: ' + name);
  }
  const [row] = await SiteContent.findOrCreate({
    where: { section: name },
    defaults: { section: name, data: getSectionDefault(name) },
  });
  row.data = getSectionDefault(name);
  row.draft = null;
  await row.save();
  return row;
}

module.exports = {
  DEFAULTS,
  SECTION_META,
  getDefaults,
  getSectionDefault,
  ensureSeed,
  getAll,
  getSection,
  updateSection,
  publishAll,
  revertAll,
  resetSection,
};
