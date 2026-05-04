'use strict';

const db = require('../models');

/**
 * Pricing Management Service
 * Handles admin pricing configuration and discount application
 */

/**
 * Get current pricing for a plan (with discount applied)
 */
async function getPricing(planId) {
  try {
    const config = await db.PricingConfig.findOne({
      where: { planId: planId, isActive: true },
    });

    if (!config) {
      // Fallback defaults
      const defaults = {
        starter: { basePriceUSD: 0, finalPriceUSD: 0, discountType: 'none' },
        professional: { basePriceUSD: 99, finalPriceUSD: 99, discountType: 'none' },
        enterprise: { basePriceUSD: 199, finalPriceUSD: 199, discountType: 'none' },
      };
      return defaults[planId] || defaults.starter;
    }

    return {
      planId: config.planId,
      basePriceUSD: parseFloat(config.basePriceUSD),
      finalPriceUSD: parseFloat(config.finalPriceUSD),
      discountType: config.discountType,
      discountValue: parseFloat(config.discountValue),
      discountApplied: config.discountType !== 'none',
    };
  } catch (err) {
    console.error('[PricingService] Get pricing error:', err.message);
    return null;
  }
}

/**
 * Get all active pricing configs (for admin dashboard)
 */
async function getAllPricing() {
  try {
    const configs = await db.PricingConfig.findAll({
      where: { isActive: true },
      order: [['planId', 'ASC']],
    });

    return configs.map((c) => ({
      planId: c.planId,
      basePriceUSD: parseFloat(c.basePriceUSD),
      finalPriceUSD: parseFloat(c.finalPriceUSD),
      discountType: c.discountType,
      discountValue: parseFloat(c.discountValue),
      description: c.description,
      validFrom: c.validFrom,
      validUntil: c.validUntil,
      updatedAt: c.updatedAt,
    }));
  } catch (err) {
    console.error('[PricingService] Get all pricing error:', err.message);
    return [];
  }
}

/**
 * Update pricing for a plan (admin only)
 */
async function updatePricing(planId, opts = {}) {
  try {
    const { basePriceUSD, discountType, discountValue, description, validFrom, validUntil, updatedBy } = opts;

    let config = await db.PricingConfig.findOne({
      where: { planId },
    });

    if (!config) {
      config = await db.PricingConfig.create({
        planId,
        basePriceUSD: basePriceUSD || 0,
        discountType: discountType || 'none',
        discountValue: discountValue || 0,
        isActive: true,
        description,
        validFrom,
        validUntil,
        createdBy: updatedBy,
        updatedBy,
      });
    } else {
      config.basePriceUSD = basePriceUSD !== undefined ? basePriceUSD : config.basePriceUSD;
      config.discountType = discountType || config.discountType;
      config.discountValue = discountValue !== undefined ? discountValue : config.discountValue;
      config.description = description !== undefined ? description : config.description;
      config.validFrom = validFrom || config.validFrom;
      config.validUntil = validUntil || config.validUntil;
      config.updatedBy = updatedBy;
      config.calculateFinalPrice();
      await config.save();
    }

    console.log('[PricingService] Updated pricing for plan:', planId, {
      base: config.basePriceUSD,
      final: config.finalPriceUSD,
      discount: config.discountType,
    });

    return {
      planId: config.planId,
      basePriceUSD: parseFloat(config.basePriceUSD),
      finalPriceUSD: parseFloat(config.finalPriceUSD),
      discountType: config.discountType,
      discountValue: parseFloat(config.discountValue),
    };
  } catch (err) {
    console.error('[PricingService] Update pricing error:', err.message);
    return null;
  }
}

/**
 * Apply discount to amount (useful for checkout)
 */
function applyDiscount(baseAmount, discountType, discountValue) {
  if (discountType === 'none') return baseAmount;
  if (discountType === 'percentage') {
    const discount = (baseAmount * discountValue) / 100;
    return Math.max(0, baseAmount - discount);
  }
  if (discountType === 'fixed') {
    return Math.max(0, baseAmount - discountValue);
  }
  return baseAmount;
}

/**
 * Get summary of current discounts (for display)
 */
async function getDiscountSummary() {
  try {
    const configs = await db.PricingConfig.findAll({
      where: { 
        isActive: true,
        discountType: { [db.Sequelize.Op.ne]: 'none' },
      },
    });

    return configs.map((c) => ({
      planId: c.planId,
      discount: `${c.discountType === 'percentage' ? c.discountValue + '%' : '$' + c.discountValue}`,
      savings: parseFloat(c.basePriceUSD) - parseFloat(c.finalPriceUSD),
    }));
  } catch (err) {
    console.error('[PricingService] Get discount summary error:', err.message);
    return [];
  }
}

module.exports = {
  getPricing,
  getAllPricing,
  updatePricing,
  applyDiscount,
  getDiscountSummary,
};
