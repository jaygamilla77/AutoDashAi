'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if column already exists to avoid duplicate column error
    const tableDescription = await queryInterface.describeTable('data_sources');
    if (!tableDescription.analysisJson) {
      await queryInterface.addColumn('data_sources', 'analysisJson', {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('data_sources', 'analysisJson');
  },
};
