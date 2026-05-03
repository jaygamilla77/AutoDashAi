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

module.exports = {
  PLANS,
  get,
  isValid,
  trialEndDate,
  list: () => Object.values(PLANS),
};
