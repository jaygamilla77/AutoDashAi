'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Check if columns already exist
      const table = await queryInterface.describeTable('workspaces');
      
      // Add PayMongo customer ID if not exists
      if (!table.paymongoCustomerId) {
        await queryInterface.addColumn('workspaces', 'paymongoCustomerId', {
          type: Sequelize.STRING(120),
          allowNull: true,
        });
        console.log('✓ Added paymongoCustomerId column');
      }

      // Add PayMongo subscription ID if not exists
      if (!table.paymongoSubscriptionId) {
        await queryInterface.addColumn('workspaces', 'paymongoSubscriptionId', {
          type: Sequelize.STRING(120),
          allowNull: true,
        });
        console.log('✓ Added paymongoSubscriptionId column');
      }

      // Add plan upgrade timestamp if not exists
      if (!table.planUpgradedAt) {
        await queryInterface.addColumn('workspaces', 'planUpgradedAt', {
          type: Sequelize.DATE,
          allowNull: true,
        });
        console.log('✓ Added planUpgradedAt column');
      }

      // Add payment method info if not exists
      if (!table.paymentMethod) {
        await queryInterface.addColumn('workspaces', 'paymentMethod', {
          type: Sequelize.STRING(50),
          allowNull: true,
          defaultValue: 'card',
        });
        console.log('✓ Added paymentMethod column');
      }

      // Add next billing date if not exists
      if (!table.nextBillingDate) {
        await queryInterface.addColumn('workspaces', 'nextBillingDate', {
          type: Sequelize.DATE,
          allowNull: true,
        });
        console.log('✓ Added nextBillingDate column');
      }
    } catch (err) {
      console.error('[Migration] Error adding PayMongo columns:', err.message);
      // Don't throw - columns might already exist in production DB
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      const table = await queryInterface.describeTable('workspaces');
      
      if (table.paymongoCustomerId) {
        await queryInterface.removeColumn('workspaces', 'paymongoCustomerId');
      }
      if (table.paymongoSubscriptionId) {
        await queryInterface.removeColumn('workspaces', 'paymongoSubscriptionId');
      }
      if (table.planUpgradedAt) {
        await queryInterface.removeColumn('workspaces', 'planUpgradedAt');
      }
      if (table.paymentMethod) {
        await queryInterface.removeColumn('workspaces', 'paymentMethod');
      }
      if (table.nextBillingDate) {
        await queryInterface.removeColumn('workspaces', 'nextBillingDate');
      }
    } catch (err) {
      console.error('[Migration] Error removing PayMongo columns:', err.message);
    }
  }
};
