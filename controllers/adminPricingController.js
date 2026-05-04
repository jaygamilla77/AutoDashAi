'use strict';

const pricingConfigService = require('../services/pricingConfigService');

/**
 * GET /admin/pricing
 * Display admin pricing configuration page
 */
exports.getPricingPage = async (req, res) => {
  try {
    const configs = await pricingConfigService.getAllPricing();
    const discounts = await pricingConfigService.getDiscountSummary();

    res.render('admin/pricing', {
      title: 'Pricing Configuration',
      currentUser: req.user,
      currentWorkspace: req.workspace,
      configs,
      discounts,
    });
  } catch (err) {
    console.error('[Admin] Get pricing page error:', err.message);
    res.json({ success: false, error: err.message });
  }
};

/**
 * GET /api/admin/pricing
 * Get all pricing configurations (JSON)
 */
exports.getPricingJson = async (req, res) => {
  try {
    const configs = await pricingConfigService.getAllPricing();
    res.json({ success: true, configs });
  } catch (err) {
    console.error('[Admin] Get pricing JSON error:', err.message);
    res.json({ success: false, error: err.message });
  }
};

/**
 * POST /api/admin/pricing/update
 * Update pricing for a plan
 */
exports.updatePricing = async (req, res) => {
  try {
    const { planId, basePricePHP, discountType, discountValue, description } = req.body;

    if (!planId || basePricePHP === undefined) {
      return res.json({ success: false, error: 'Missing planId or basePricePHP' });
    }

    const result = await pricingConfigService.updatePricing(planId, {
      basePricePHP,
      discountType,
      discountValue,
      description,
      updatedBy: req.user?.id,
    });

    console.log('[Admin] Updated pricing:', result);

    res.json({
      success: true,
      message: `Updated pricing for ${planId}`,
      pricing: result,
    });
  } catch (err) {
    console.error('[Admin] Update pricing error:', err.message);
    res.json({ success: false, error: err.message });
  }
};

/**
 * POST /api/admin/pricing/bulk-update
 * Update multiple plans at once
 */
exports.bulkUpdatePricing = async (req, res) => {
  try {
    const { updates } = req.body;

    if (!Array.isArray(updates)) {
      return res.json({ success: false, error: 'updates must be an array' });
    }

    const results = [];
    for (const update of updates) {
      const result = await pricingConfigService.updatePricing(update.planId, {
        basePricePHP: update.basePricePHP,
        discountType: update.discountType,
        discountValue: update.discountValue,
        description: update.description,
        updatedBy: req.user?.id,
      });
      results.push(result);
    }

    console.log('[Admin] Bulk updated pricing:', results);

    res.json({
      success: true,
      message: `Updated ${results.length} pricing configs`,
      results,
    });
  } catch (err) {
    console.error('[Admin] Bulk update pricing error:', err.message);
    res.json({ success: false, error: err.message });
  }
};

/**
 * GET /api/admin/pricing/discounts
 * Get discount summary
 */
exports.getDiscounts = async (req, res) => {
  try {
    const discounts = await pricingConfigService.getDiscountSummary();
    res.json({ success: true, discounts });
  } catch (err) {
    console.error('[Admin] Get discounts error:', err.message);
    res.json({ success: false, error: err.message });
  }
};
