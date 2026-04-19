'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('data_sources', 'analysisJson', {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('data_sources', 'analysisJson');
  },
};
