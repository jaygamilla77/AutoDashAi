'use strict';

/**
 * Single source of truth for plan metadata used across:
 *   - pricing.ejs (CTAs)
 *   - auth.ejs    (selected-plan card)
 *   - authController (signup → user.plan, trial)
 *   - onboarding (gates, badges)
 */
const PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    price: '$0',
    priceCadence: '/month',
    tagline: 'Perfect for individuals exploring AI dashboards.',
    badge: null,
    cta: 'Get Started Free',
    trialDays: 0,
    features: [
      'Up to 3 dashboards',
      'Excel, CSV & JSON sources',
      'AI dashboard generation',
      'Community support',
    ],
  },
  business: {
    id: 'business',
    name: 'Business',
    price: '$29',
    priceCadence: '/user / month',
    tagline: 'For teams that need real-time analytics and collaboration.',
    badge: 'Most Popular',
    cta: 'Start 14-Day Trial',
    trialDays: 14,
    features: [
      'Unlimited dashboards',
      'AI executive summaries',
      'Advanced AI insights',
      'SQL databases & REST APIs',
      'Secure sharing & collaboration',
      'Priority support',
    ],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    priceCadence: '',
    tagline: 'For organizations with advanced security and scale needs.',
    badge: 'White-Glove Onboarding',
    cta: 'Contact Sales',
    trialDays: 0,
    features: [
      'SSO & role-based access',
      'Dedicated AI capacity',
      'Custom integrations',
      'Premium SLA & onboarding',
      'Compliance reviews',
    ],
  },
};

function get(planId) {
  if (!planId) return PLANS.starter;
  const id = String(planId).toLowerCase();
  return PLANS[id] || PLANS.starter;
}

function isValid(planId) {
  return !!PLANS[String(planId || '').toLowerCase()];
}

function trialEndDate(planId) {
  const p = get(planId);
  if (!p.trialDays) return null;
  return new Date(Date.now() + p.trialDays * 24 * 60 * 60 * 1000);
}

// ── Plan limits (enforced via enforceLimit at create endpoints) ──
// `null` / `Infinity` = unlimited. Add new keys here as needed.
const LIMITS = {
  starter:    { dashboards: 3,        dataSources: 1,        aiGenerationsPerMonth: 50  },
  business:   { dashboards: Infinity, dataSources: Infinity, aiGenerationsPerMonth: Infinity },
  enterprise: { dashboards: Infinity, dataSources: Infinity, aiGenerationsPerMonth: Infinity },
};

function getLimits(planId) {
  return LIMITS[String(planId || 'starter').toLowerCase()] || LIMITS.starter;
}

/**
 * Returns null if within limit, or an object describing the overage if not.
 *   { limit, current, plan, suggestUpgradeTo }
 */
function checkLimit(planId, key, currentCount) {
  const limits = getLimits(planId);
  const limit = limits[key];
  if (limit === Infinity || limit == null) return null;
  if (currentCount < limit) return null;
  const next = planId === 'starter' ? 'business' : 'enterprise';
  return { limit, current: currentCount, plan: planId, suggestUpgradeTo: next, key };
}

module.exports = {
  PLANS,
  LIMITS,
  get,
  isValid,
  trialEndDate,
  getLimits,
  checkLimit,
  list: () => Object.values(PLANS),
};
