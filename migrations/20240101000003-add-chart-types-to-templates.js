'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if column already exists to avoid duplicate column error
    const tableDescription = await queryInterface.describeTable('dashboard_templates');
    if (!tableDescription.preferredChartTypes) {
      await queryInterface.addColumn('dashboard_templates', 'preferredChartTypes', {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: null,
        comment: 'JSON array of preferred chart types, e.g. ["bar","line"]',
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('dashboard_templates', 'preferredChartTypes');
  },
};
