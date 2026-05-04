'use strict';

/**
 * Payment Controller
 * Handles PayMongo payment operations, webhooks, and subscription management
 */

const db = require('../models');
const paymongoService = require('../services/paymongoService');
const planService = require('../services/planService');

/**
 * GET /api/payment/checkout
 * Create a checkout session for plan upgrade
 */
exports.createCheckout = async (req, res) => {
  try {
    const { planId } = req.body;
    const workspace = req.workspace;

    console.log('[Payment] createCheckout called:', {
      planId,
      hasWorkspace: !!workspace,
      workspaceId: workspace?.id,
      hasUser: !!req.user,
      userId: req.user?.id,
    });

    if (!planId || !workspace) {
      console.error('[Payment] Missing planId or workspace');
      return res.json({ success: false, error: 'Missing planId or workspace' });
    }

    // Get plan pricing
    const plans = await paymongoService.getPricingPlans();
    const selectedPlan = plans.find(p => p.id === planId);

    if (!selectedPlan) {
      return res.json({ success: false, error: 'Invalid plan' });
    }

    if (selectedPlan.price === 0) {
      // Starter plan is free, just update workspace
      return res.json({
        success: true,
        message: 'Starter plan is free',
        action: 'downgrade',
      });
    }

    // Create checkout session via PayMongo
    const result = await paymongoService.createCheckout({
      workspaceId: workspace.id,
      planId: planId,
      amount: selectedPlan.price / 100, // Convert from cents to PHP
      currency: 'PHP',
      description: `Upgrade to ${selectedPlan.name} plan`,
      email: workspace.email || 'workspace@example.com',
      workspaceName: workspace.name,
      successUrl: `${process.env.SITE_URL}/billing?upgraded=true&plan=${planId}`,
      cancelUrl: `${process.env.SITE_URL}/billing?cancelled=true`,
    });

    if (!result.success) {
      return res.json({ success: false, error: result.error });
    }

    console.log('[Payment] Checkout created:', {
      workspaceId: workspace.id,
      planId: planId,
      checkoutId: result.checkoutId,
    });

    return res.json({
      success: true,
      checkoutId: result.checkoutId,
      paymentLink: result.paymentLink,
      plan: selectedPlan,
    });
  } catch (err) {
    console.error('[Payment] Create checkout error:', err.message);
    return res.json({ success: false, error: err.message });
  }
};

/**
 * GET /api/payment/checkout/:checkoutId
 * Check checkout status
 */
exports.getCheckoutStatus = async (req, res) => {
  try {
    const { checkoutId } = req.params;

    const result = await paymongoService.getCheckout(checkoutId);

    if (!result.success) {
      return res.json({ success: false, error: result.error });
    }

    return res.json({
      success: true,
      checkout: result,
    });
  } catch (err) {
    console.error('[Payment] Get checkout error:', err.message);
    return res.json({ success: false, error: err.message });
  }
};

/**
 * POST /api/payment/webhook
 * Handle PayMongo webhook events
 * Must verify X-Paymongo-Signature header
 */
exports.handleWebhook = async (req, res) => {
  try {
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const signature = req.headers['x-paymongo-signature'];

    // Verify webhook signature
    if (!paymongoService.verifyWebhookSignature(rawBody, signature)) {
      console.error('[Payment] Webhook signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    console.log('[Payment] Webhook verified, processing event');

    const eventData = req.body;
    const result = await paymongoService.handleWebhookEvent(eventData);

    if (!result.success) {
      console.error('[Payment] Webhook handling failed:', result.error);
      return res.status(400).json({ error: result.error });
    }

    // Acknowledge webhook receipt
    return res.json({ success: true, webhookId: eventData.data.id });
  } catch (err) {
    console.error('[Payment] Webhook error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/payment/plans
 * Get all available pricing plans
 */
exports.getPlans = async (req, res) => {
  try {
    const plans = await paymongoService.getPricingPlans();
    return res.json({
      success: true,
      plans,
    });
  } catch (err) {
    console.error('[Payment] Get plans error:', err.message);
    return res.json({ success: false, error: err.message });
  }
};

/**
 * POST /api/payment/upgrade
 * Upgrade workspace to a specific plan (direct action, bypasses checkout if applicable)
 */
exports.upgradePlan = async (req, res) => {
  try {
    const { planId } = req.body;
    const workspace = req.workspace;

    if (!planId || !workspace) {
      return res.json({ success: false, error: 'Missing planId or workspace' });
    }

    const plans = await paymongoService.getPricingPlans();
    const selectedPlan = plans.find(p => p.id === planId);

    if (!selectedPlan) {
      return res.json({ success: false, error: 'Invalid plan' });
    }

    // Update workspace plan
    await workspace.update({
      plan: planId,
      // PayMongo fields will be added after migration runs:
      // paymentMethod: 'card',
      // planUpgradedAt: new Date(),
    });

    console.log('[Payment] Plan upgraded:', {
      workspaceId: workspace.id,
      newPlan: planId,
    });

    // Create usage record (optional - for tracking)
    // await db.UsageLog.create({
    //   workspaceId: workspace.id,
    //   action: 'plan_upgraded',
    //   details: JSON.stringify({ from: workspace.plan, to: planId }),
    // });

    return res.json({
      success: true,
      message: `Upgraded to ${selectedPlan.name} plan`,
      workspace: {
        id: workspace.id,
        plan: workspace.plan,
        limits: planService.getLimits(planId),
      },
    });
  } catch (err) {
    console.error('[Payment] Upgrade plan error:', err.message);
    return res.json({ success: false, error: err.message });
  }
};

/**
 * GET /api/payment/limits
 * Get current workspace plan limits
 */
exports.getLimits = async (req, res) => {
  try {
    const workspace = req.workspace;

    if (!workspace) {
      return res.json({ success: false, error: 'No workspace' });
    }

    const limits = planService.getLimits(workspace.plan);

    return res.json({
      success: true,
      plan: workspace.plan,
      limits,
    });
  } catch (err) {
    console.error('[Payment] Get limits error:', err.message);
    return res.json({ success: false, error: err.message });
  }
};
