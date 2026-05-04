'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if table already exists
    const tableExists = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'pricing_configs'`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    ).catch(() => null);

    if (tableExists && tableExists.length > 0) {
      console.log('[Migration] pricing_configs table already exists');
      return;
    }

    await queryInterface.createTable('pricing_configs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      planId: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      basePriceUSD: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      discountType: {
        type: Sequelize.ENUM('none', 'percentage', 'fixed'),
        allowNull: false,
        defaultValue: 'none',
      },
      discountValue: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      finalPriceUSD: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      description: {
        type: Sequelize.TEXT,
      },
      validFrom: {
        type: Sequelize.DATE,
      },
      validUntil: {
        type: Sequelize.DATE,
      },
      createdBy: {
        type: Sequelize.INTEGER,
      },
      updatedBy: {
        type: Sequelize.INTEGER,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Create indexes
    await queryInterface.addIndex('pricing_configs', ['planId']);
    await queryInterface.addIndex('pricing_configs', ['isActive']);

    // Seed default pricing if table is new
    await queryInterface.bulkInsert('pricing_configs', [
      {
        planId: 'starter',
        basePriceUSD: 0,
        discountType: 'none',
        discountValue: 0,
        finalPriceUSD: 0,
        isActive: true,
        description: 'Free starter plan',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        planId: 'professional',
        basePriceUSD: 99,
        discountType: 'none',
        discountValue: 0,
        finalPriceUSD: 99,
        isActive: true,
        description: 'Professional plan - $99/month USD',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        planId: 'enterprise',
        basePriceUSD: 199,
        discountType: 'none',
        discountValue: 0,
        finalPriceUSD: 199,
        isActive: true,
        description: 'Enterprise plan - $199/month USD',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    console.log('[Migration] Created pricing_configs table with default pricing');
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('pricing_configs');
    console.log('[Migration] Dropped pricing_configs table');
  },
};
