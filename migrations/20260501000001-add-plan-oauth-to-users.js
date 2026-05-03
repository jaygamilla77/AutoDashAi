'use strict';

/**
 * Add plan, OAuth provider, onboarding columns to users.
 *
 * Backwards-compatible: all new columns are nullable / defaulted.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = 'users';
    const desc = await queryInterface.describeTable(table);

    if (!desc.plan) {
      await queryInterface.addColumn(table, 'plan', {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'starter',
      });
    }
    if (!desc.planTrialEndsAt) {
      await queryInterface.addColumn(table, 'planTrialEndsAt', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
    if (!desc.authProvider) {
      await queryInterface.addColumn(table, 'authProvider', {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'local',
      });
    }
    if (!desc.providerUserId) {
      await queryInterface.addColumn(table, 'providerUserId', {
        type: Sequelize.STRING(180),
        allowNull: true,
      });
    }
    if (!desc.avatarUrl) {
      await queryInterface.addColumn(table, 'avatarUrl', {
        type: Sequelize.STRING(500),
        allowNull: true,
      });
    }
    if (!desc.onboardingCompleted) {
      await queryInterface.addColumn(table, 'onboardingCompleted', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
    if (!desc.onboardingStep) {
      await queryInterface.addColumn(table, 'onboardingStep', {
        type: Sequelize.STRING(32),
        allowNull: true,
      });
    }

    // Make passwordHash nullable so OAuth users without a local password can be stored.
    try {
      await queryInterface.changeColumn(table, 'passwordHash', {
        type: Sequelize.STRING(255),
        allowNull: true,
      });
    } catch (e) {
      // Some MariaDB versions throw if already nullable; swallow.
    }
  },

  down: async (queryInterface) => {
    const table = 'users';
    const cols = ['plan', 'planTrialEndsAt', 'authProvider', 'providerUserId', 'avatarUrl', 'onboardingCompleted', 'onboardingStep'];
    for (const c of cols) {
      try { await queryInterface.removeColumn(table, c); } catch (_) {}
    }
  },
};
