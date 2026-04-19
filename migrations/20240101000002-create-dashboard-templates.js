'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('dashboard_templates', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      description: { type: Sequelize.STRING(255), allowNull: true },
      fontFamily: { type: Sequelize.STRING(100), defaultValue: 'Inter' },
      colorPalette: { type: Sequelize.TEXT, allowNull: false },
      accentColor: { type: Sequelize.STRING(20), defaultValue: '#111827' },
      isBuiltIn: { type: Sequelize.BOOLEAN, defaultValue: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('dashboard_templates');
  },
};
