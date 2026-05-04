'use strict';

/**
 * Pricing Configuration Model
 * Allows admin to set custom prices and discounts per plan
 */
module.exports = (sequelize, DataTypes) => {
  const PricingConfig = sequelize.define(
    'PricingConfig',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      planId: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true, // One config per plan
        comment: 'Plan ID: starter, professional, enterprise',
      },
      basePricePHP: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Base price in PHP (0 for free)',
      },
      discountType: {
        type: DataTypes.ENUM('none', 'percentage', 'fixed'),
        allowNull: false,
        defaultValue: 'none',
        comment: 'Type of discount: none, percentage (0-100), or fixed amount',
      },
      discountValue: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Discount value (% or PHP amount depending on discountType)',
      },
      finalPricePHP: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Calculated final price after discount',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: 'Whether this pricing config is active',
      },
      description: {
        type: DataTypes.TEXT,
        comment: 'Internal description (e.g., "Q2 Promotion", "Partner Special Pricing")',
      },
      validFrom: {
        type: DataTypes.DATE,
        comment: 'When this pricing becomes active',
      },
      validUntil: {
        type: DataTypes.DATE,
        comment: 'When this pricing expires (null = no expiry)',
      },
      createdBy: {
        type: DataTypes.INTEGER,
        comment: 'Admin user ID who created this config',
      },
      updatedBy: {
        type: DataTypes.INTEGER,
        comment: 'Admin user ID who last updated this config',
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      tableName: 'pricing_configs',
      timestamps: true,
      indexes: [{ fields: ['planId'] }, { fields: ['isActive'] }],
    }
  );

  PricingConfig.prototype.calculateFinalPrice = function() {
    if (this.discountType === 'none') {
      this.finalPricePHP = this.basePricePHP;
    } else if (this.discountType === 'percentage') {
      const discount = (this.basePricePHP * this.discountValue) / 100;
      this.finalPricePHP = Math.max(0, this.basePricePHP - discount);
    } else if (this.discountType === 'fixed') {
      this.finalPricePHP = Math.max(0, this.basePricePHP - this.discountValue);
    }
  };

  PricingConfig.beforeSave((instance) => {
    instance.calculateFinalPrice();
  });

  return PricingConfig;
};
