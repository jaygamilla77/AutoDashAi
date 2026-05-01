'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('dashboard_layout_templates', {
      id: {
        type: Sequelize.STRING(50),
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      category: {
        type: Sequelize.STRING(50),
        allowNull: true,
        defaultValue: 'Business',
      },
      icon: {
        type: Sequelize.STRING(50),
        allowNull: true,
        defaultValue: 'bi-bar-chart-fill',
      },
      kpis: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: '[]',
      },
      chartTypes: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: '[]',
      },
      sections: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: '[]',
      },
      defaultTitle: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      promptStarter: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      dashboardRole: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      isBuiltIn: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      sortOrder: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('dashboard_layout_templates');
  },
};
