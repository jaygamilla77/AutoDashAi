'use strict';

/**
 * PayMongo Payment Service
 * Handles all payment operations: creating checkouts, webhooks, invoices
 * Supports USD base pricing with multi-currency conversion
 */

const axios = require('axios');
const currencyService = require('./currencyService');
const pricingConfigService = require('./pricingConfigService');

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const PAYMONGO_PUBLIC_KEY = process.env.PAYMONGO_PUBLIC_KEY;
const PAYMONGO_API_BASE = 'https://api.paymongo.com/v1';

// Base64 encode credentials for API calls
const authHeader = {
  Authorization: 'Basic ' + Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64'),
};

/**
 * Create a checkout session for plan upgrade
 * Converts USD pricing to target currency
 * Returns payment link that user can visit
 */
async function createCheckout(opts = {}) {
  try {
    const { workspaceId, planId, amount, currency = 'USD', description, successUrl, cancelUrl } = opts;

    if (!workspaceId || !planId || !amount) {
      throw new Error('Missing required fields: workspaceId, planId, amount');
    }

    // PayMongo only supports PHP — always charge in PHP regardless of display currency
    const amountInPHP = currencyService.convertUSDTo(amount, 'PHP');
    const amountInCents = currencyService.getPaymongoAmount(amount, 'PHP');

    console.log('[PayMongo] Creating checkout:', { 
      workspaceId, 
      planId, 
      amountUSD: amount,
      amountInPHP,
      displayCurrency: currency,
      amountInCents
    });

    const payload = {
      data: {
        attributes: {
          billing: {
            address: {
              country: 'PH',
            },
            email: opts.email || 'workspace@example.com',
            name: opts.workspaceName || `Workspace ${workspaceId}`,
          },
          line_items: [
            {
              amount: amountInCents, // in PHP centavos
              currency: 'PHP',
              description: description || `Upgrade to ${planId} plan`,
              name: `${planId.toUpperCase()} Plan (${currencyService.formatPrice(amount, currency)})`,
              quantity: 1,
            },
          ],
          payment_method_types: ['card', 'paymaya', 'gcash', 'grab_pay'],
          success_url: successUrl || `${process.env.SITE_URL}/billing?upgraded=true&plan=${planId}`,
          cancel_url: cancelUrl || `${process.env.SITE_URL}/billing?cancelled=true`,
          reference_number: `${workspaceId}-${planId}-${Date.now()}`,
          description: `Subscription upgrade: ${planId} (${amountInPHP.toFixed(2)} PHP)`,
        },
      },
    };

    const response = await axios.post(`${PAYMONGO_API_BASE}/checkout_sessions`, payload, { headers: authHeader });

    console.log('[PayMongo] Checkout created:', response.data.data.id);

    return {
      success: true,
      checkoutId: response.data.data.id,
      paymentLink: response.data.data.attributes.checkout_url,
      reference: payload.data.attributes.reference_number,
    };
  } catch (err) {
    console.error('[PayMongo] Checkout creation error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.errors?.[0]?.detail || err.message,
    };
  }
}

/**
 * Create a Payment Intent for direct charge
 * Useful for auto-renewal or direct card charging
 */
async function createPaymentIntent(opts = {}) {
  try {
    const { workspaceId, amount, currency = 'PHP', description, email } = opts;

    if (!workspaceId || !amount) {
      throw new Error('Missing required fields: workspaceId, amount');
    }

    console.log('[PayMongo] Creating payment intent:', { workspaceId, amount, currency });

    const payload = {
      data: {
        attributes: {
          amount: Math.round(amount * 100), // Convert to cents
          currency: currency,
          description: description || 'AutoDash AI Subscription',
          statement_descriptor: 'AUTODASH AI',
          metadata: {
            workspaceId: String(workspaceId),
            createdAt: new Date().toISOString(),
          },
        },
      },
    };

    const response = await axios.post(`${PAYMONGO_API_BASE}/payment_intents`, payload, { headers: authHeader });

    console.log('[PayMongo] Payment intent created:', response.data.data.id);

    return {
      success: true,
      paymentIntentId: response.data.data.id,
      clientKey: response.data.data.attributes.client_key,
      status: response.data.data.attributes.status,
    };
  } catch (err) {
    console.error('[PayMongo] Payment intent error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.errors?.[0]?.detail || err.message,
    };
  }
}

/**
 * Retrieve a payment intent to check status
 */
async function getPaymentIntent(paymentIntentId) {
  try {
    const response = await axios.get(`${PAYMONGO_API_BASE}/payment_intents/${paymentIntentId}`, {
      headers: authHeader,
    });

    return {
      success: true,
      id: response.data.data.id,
      status: response.data.data.attributes.status,
      amount: response.data.data.attributes.amount / 100, // Convert back to normal
      currency: response.data.data.attributes.currency,
      payment: response.data.data.attributes.payments[0] || null,
    };
  } catch (err) {
    console.error('[PayMongo] Get payment intent error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.errors?.[0]?.detail || err.message,
    };
  }
}

/**
 * Get checkout session details
 */
async function getCheckout(checkoutId) {
  try {
    const response = await axios.get(`${PAYMONGO_API_BASE}/checkout_sessions/${checkoutId}`, {
      headers: authHeader,
    });

    return {
      success: true,
      id: response.data.data.id,
      status: response.data.data.attributes.status,
      paymentStatus: response.data.data.attributes.payment_status,
      checkoutUrl: response.data.data.attributes.checkout_url,
      totalAmount: response.data.data.attributes.total_amount / 100,
      currency: response.data.data.attributes.currency,
    };
  } catch (err) {
    console.error('[PayMongo] Get checkout error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.errors?.[0]?.detail || err.message,
    };
  }
}

/**
 * Verify webhook signature
 * All webhooks from PayMongo include a X-Paymongo-Signature header
 */
function verifyWebhookSignature(payload, signature) {
  try {
    const crypto = require('crypto');
    const secret = process.env.PAYMONGO_WEBHOOK_SECRET || 'whsec_test_secret';

    // PayMongo uses HMAC-SHA256
    const computed = crypto.createHmac('sha256', secret).update(payload).digest('base64');

    // Compare signatures in constant time
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch (err) {
    console.error('[PayMongo] Webhook verification error:', err.message);
    return false;
  }
}

/**
 * Handle webhook event (payment success, failed, etc.)
 */
async function handleWebhookEvent(eventData) {
  try {
    const eventType = eventData.data.type;
    const eventAttributes = eventData.data.attributes;

    console.log('[PayMongo] Webhook event received:', eventType);

    switch (eventType) {
      case 'payment_intent.payment_received':
        return await handlePaymentSuccess(eventData);

      case 'payment_intent.payment_failed':
        return await handlePaymentFailed(eventData);

      case 'payment_intent.payment_expired':
        return await handlePaymentExpired(eventData);

      case 'charge.paid':
        return await handleChargePaid(eventData);

      default:
        console.log('[PayMongo] Unhandled webhook type:', eventType);
        return { success: true, handled: false };
    }
  } catch (err) {
    console.error('[PayMongo] Webhook handling error:', err.message);
    return { success: false, error: err.message };
  }
}

async function handlePaymentSuccess(eventData) {
  // Extract workspace ID from metadata or reference
  const metadata = eventData.data.attributes.metadata || {};
  const workspaceId = metadata.workspaceId;

  if (!workspaceId) {
    console.error('[PayMongo] Payment success but no workspaceId in metadata');
    return { success: false, error: 'Missing workspaceId' };
  }

  console.log('[PayMongo] Payment success for workspace:', workspaceId);

  // TODO: Update workspace plan in database
  // TODO: Send confirmation email
  // TODO: Create invoice record

  return { success: true, workspaceId, action: 'upgrade_plan' };
}

async function handlePaymentFailed(eventData) {
  const metadata = eventData.data.attributes.metadata || {};
  const workspaceId = metadata.workspaceId;

  console.log('[PayMongo] Payment failed for workspace:', workspaceId);

  // TODO: Send failure notification email
  // TODO: Log failed payment attempt

  return { success: true, workspaceId, action: 'payment_failed' };
}

async function handlePaymentExpired(eventData) {
  const metadata = eventData.data.attributes.metadata || {};
  const workspaceId = metadata.workspaceId;

  console.log('[PayMongo] Payment expired for workspace:', workspaceId);

  return { success: true, workspaceId, action: 'payment_expired' };
}

async function handleChargePaid(eventData) {
  const metadata = eventData.data.attributes.metadata || {};
  const workspaceId = metadata.workspaceId;

  console.log('[PayMongo] Charge paid for workspace:', workspaceId);

  return { success: true, workspaceId, action: 'charge_paid' };
}

/**
 * Get pricing plans for billing page (with admin-configured prices)
 */
async function getPricingPlans(userCurrency = 'USD') {
  try {
    // Fetch USD prices from database
    const starterPrice = await pricingConfigService.getPricing('starter');
    const professionalPrice = await pricingConfigService.getPricing('professional');
    const enterprisePrice = await pricingConfigService.getPricing('enterprise');

    // Format prices in user's currency
    const starterFinalUSD = starterPrice?.finalPriceUSD || 0;
    const professionalFinalUSD = professionalPrice?.finalPriceUSD || 99;
    const enterpriseFinalUSD = enterprisePrice?.finalPriceUSD || 199;

    return [
      {
        id: 'starter',
        name: 'Starter',
        price: currencyService.convertUSDTo(starterFinalUSD, userCurrency),
        priceUSD: starterFinalUSD,
        currency: userCurrency,
        billing_cycle: 'monthly',
        description: 'Perfect to get started',
        features: [
          '3 Dashboards',
          '1 Data Source',
          '50 AI Generations/month',
          'Basic Support',
        ],
        limits: {
          dashboards: 3,
          dataSources: 1,
          aiGenerations: 50,
        },
        badge: 'Free',
        discount: starterPrice?.discountApplied ? `${starterPrice.discountType === 'percentage' ? starterPrice.discountValue + '%' : '$' + starterPrice.discountValue.toFixed(2)}` : null,
      },
      {
        id: 'professional',
        name: 'Professional',
        price: currencyService.convertUSDTo(professionalFinalUSD, userCurrency),
        priceUSD: professionalFinalUSD,
        basePrice: currencyService.convertUSDTo(professionalPrice?.basePriceUSD || 99, userCurrency),
        basePriceUSD: professionalPrice?.basePriceUSD || 99,
        currency: userCurrency,
        billing_cycle: 'monthly',
        description: 'For growing teams',
        features: [
          '∞ Dashboards',
          '10 Data Sources',
          '1,000 AI Generations/month',
          'Priority Email Support',
          'Advanced Analytics',
          'Custom Branding',
        ],
        limits: {
          dashboards: 999,
          dataSources: 10,
          aiGenerations: 1000,
        },
        badge: 'Popular',
        recommended: true,
        discount: professionalPrice?.discountApplied ? `${professionalPrice.discountType === 'percentage' ? professionalPrice.discountValue + '%' : '$' + professionalPrice.discountValue.toFixed(2)}` : null,
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: currencyService.convertUSDTo(enterpriseFinalUSD, userCurrency),
        priceUSD: enterpriseFinalUSD,
        basePrice: currencyService.convertUSDTo(enterprisePrice?.basePriceUSD || 199, userCurrency),
        basePriceUSD: enterprisePrice?.basePriceUSD || 199,
        currency: userCurrency,
        billing_cycle: 'monthly',
        description: 'For large organizations',
        features: [
          '∞ Dashboards',
          '∞ Data Sources',
          '∞ AI Generations',
          '24/7 Priority Support',
          'Dedicated Account Manager',
          'Custom Integrations',
          'SLA Guarantee',
        ],
        limits: {
          dashboards: 999999,
          dataSources: 999999,
          aiGenerations: 999999,
        },
        badge: 'Best Value',
        contactSales: true,
        discount: enterprisePrice?.discountApplied ? `${enterprisePrice.discountType === 'percentage' ? enterprisePrice.discountValue + '%' : '₱' + enterprisePrice.discountValue.toFixed(2)}` : null,
      },
    ];
  } catch (err) {
    console.error('[PayMongo] Get pricing plans error:', err.message);
    // Return hardcoded defaults if database lookup fails
    return [
      {
        id: 'starter',
        name: 'Starter',
        price: 0,
        currency: 'PHP',
        billing_cycle: 'monthly',
        description: 'Perfect to get started',
        features: ['3 Dashboards', '1 Data Source', '50 AI Generations/month', 'Basic Support'],
        limits: { dashboards: 3, dataSources: 1, aiGenerations: 50 },
        badge: 'Free',
      },
      {
        id: 'professional',
        name: 'Professional',
        price: 3990,
        currency: 'PHP',
        billing_cycle: 'monthly',
        description: 'For growing teams',
        features: ['∞ Dashboards', '10 Data Sources', '1,000 AI Generations/month', 'Priority Support'],
        limits: { dashboards: 999, dataSources: 10, aiGenerations: 1000 },
        badge: 'Popular',
        recommended: true,
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: 9990,
        currency: 'PHP',
        billing_cycle: 'monthly',
        description: 'For large organizations',
        features: ['∞ Dashboards', '∞ Data Sources', '∞ AI Generations', '24/7 Support'],
        limits: { dashboards: 999999, dataSources: 999999, aiGenerations: 999999 },
        badge: 'Best Value',
        contactSales: true,
      },
    ];
  }
}

module.exports = {
  createCheckout,
  createPaymentIntent,
  getPaymentIntent,
  getCheckout,
  verifyWebhookSignature,
  handleWebhookEvent,
  getPricingPlans,
  PAYMONGO_PUBLIC_KEY,
};
