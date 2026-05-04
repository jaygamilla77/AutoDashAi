'use strict';

/**
 * Workspace lifecycle helpers.
 *
 * - `createForUser(user, opts)` — creates a Workspace and links the User.
 *   Used by signup/verify/oauthHandle so every new account gets its own
 *   isolated workspace + 14-day Business trial (unless a different plan is
 *   selected).
 * - `enforceLimit(req, key, currentCount)` — throws a tagged error when the
 *   workspace is over its plan limit. Controllers catch it and return a
 *   structured upgrade response.
 */

const db = require('../models');
const planService = require('./planService');

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || ('ws-' + Date.now().toString(36));
}

async function uniqueSlug(base) {
  let slug = slugify(base);
  let i = 1;
  // Try base, base-2, base-3 …
  // Guarded loop in case of unique race
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await db.Workspace.findOne({ where: { slug } });
    if (!exists) return slug;
    slug = slugify(base) + '-' + (++i);
    if (i > 1000) return slug + '-' + Date.now().toString(36);
  }
}

/**
 * Create a new workspace for a freshly created User and link them.
 * Returns the Workspace instance.
 */
async function createForUser(user, opts = {}) {
  const planId = planService.isValid(opts.plan) ? String(opts.plan).toLowerCase() : (user.plan || 'starter');
  const baseName = opts.name
    || (user.name ? user.name + "'s Workspace" : (user.email || '').split('@')[0] + "'s Workspace");
  const slug = await uniqueSlug(opts.name || (user.email || '').split('@')[0]);
  const trialEndsAt = planService.trialEndDate(planId);

  const ws = await db.Workspace.create({
    name: baseName,
    slug,
    ownerUserId: user.id,
    plan: planId,
    trialEndsAt,
    subscriptionStatus: planId === 'starter' ? 'active' : 'trialing',
  });

  // Link user → workspace, ensure role + plan are aligned.
  user.workspaceId = ws.id;
  if (!user.role) user.role = 'admin';
  user.plan = planId;
  if (trialEndsAt && !user.planTrialEndsAt) user.planTrialEndsAt = trialEndsAt;
  await user.save();

  return ws;
}

/**
 * Throws a PlanLimitError when the workspace is at/over its limit.
 * Controllers can catch and return JSON suitable for the upgrade modal.
 */
class PlanLimitError extends Error {
  constructor(info) {
    super('Plan limit reached');
    this.name = 'PlanLimitError';
    this.info = info;
  }
}

async function enforceLimit(workspace, key, currentCount) {
  if (!workspace) return;
  const overage = planService.checkLimit(workspace.plan || 'starter', key, currentCount);
  if (overage) throw new PlanLimitError(overage);
}

function trialDaysLeft(workspace) {
  if (!workspace || !workspace.trialEndsAt) return null;
  const ms = new Date(workspace.trialEndsAt).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

module.exports = {
  createForUser,
  enforceLimit,
  trialDaysLeft,
  PlanLimitError,
};
