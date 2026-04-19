'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('dashboard_templates', 'preferredChartTypes', {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
      comment: 'JSON array of preferred chart types, e.g. ["bar","line"]',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('dashboard_templates', 'preferredChartTypes');
  },
};
