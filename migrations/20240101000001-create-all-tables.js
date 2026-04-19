'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('departments', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      code: { type: Sequelize.STRING(20), allowNull: false, unique: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('employees', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      employeeId: { type: Sequelize.STRING(20), allowNull: false, unique: true },
      fullName: { type: Sequelize.STRING(150), allowNull: false },
      email: { type: Sequelize.STRING(150), allowNull: false },
      departmentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'departments', key: 'id' },
      },
      isActive: { type: Sequelize.BOOLEAN, defaultValue: true },
      hiredDate: { type: Sequelize.DATEONLY, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('projects', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      code: { type: Sequelize.STRING(20), allowNull: false, unique: true },
      name: { type: Sequelize.STRING(150), allowNull: false },
      departmentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'departments', key: 'id' },
      },
      startDate: { type: Sequelize.DATEONLY, allowNull: true },
      endDate: { type: Sequelize.DATEONLY, allowNull: true },
      status: { type: Sequelize.STRING(30), defaultValue: 'active' },
      budget: { type: Sequelize.FLOAT, defaultValue: 0 },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('productivity_records', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      employeeId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
      },
      projectId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'projects', key: 'id' },
      },
      workDate: { type: Sequelize.DATEONLY, allowNull: false },
      tasksCompleted: { type: Sequelize.INTEGER, defaultValue: 0 },
      hoursLogged: { type: Sequelize.FLOAT, defaultValue: 0 },
      productivityScore: { type: Sequelize.FLOAT, defaultValue: 0 },
      remarks: { type: Sequelize.STRING(500), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('tickets', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      ticketNo: { type: Sequelize.STRING(20), allowNull: false, unique: true },
      title: { type: Sequelize.STRING(250), allowNull: false },
      category: { type: Sequelize.STRING(50), allowNull: true },
      priority: { type: Sequelize.STRING(20), defaultValue: 'medium' },
      status: { type: Sequelize.STRING(20), defaultValue: 'open' },
      employeeId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'employees', key: 'id' },
      },
      departmentId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'departments', key: 'id' },
      },
      projectId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'projects', key: 'id' },
      },
      resolvedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('data_sources', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(150), allowNull: false },
      sourceType: { type: Sequelize.STRING(30), allowNull: false },
      status: { type: Sequelize.STRING(20), defaultValue: 'active' },
      configJson: { type: Sequelize.TEXT, allowNull: true },
      filePath: { type: Sequelize.STRING(500), allowNull: true },
      originalFileName: { type: Sequelize.STRING(250), allowNull: true },
      mimeType: { type: Sequelize.STRING(100), allowNull: true },
      lastSyncedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('data_source_schemas', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      dataSourceId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'data_sources', key: 'id' },
      },
      datasetName: { type: Sequelize.STRING(150), allowNull: true },
      schemaJson: { type: Sequelize.TEXT, allowNull: true },
      profileJson: { type: Sequelize.TEXT, allowNull: true },
      previewJson: { type: Sequelize.TEXT, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('prompt_history', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      promptText: { type: Sequelize.TEXT, allowNull: false },
      selectedChartType: { type: Sequelize.STRING(30), allowNull: true },
      interpretedIntent: { type: Sequelize.STRING(250), allowNull: true },
      generatedTitle: { type: Sequelize.STRING(250), allowNull: true },
      structuredRequestJson: { type: Sequelize.TEXT, allowNull: true },
      dataSourceId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'data_sources', key: 'id' },
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('saved_dashboards', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      title: { type: Sequelize.STRING(250), allowNull: false },
      promptText: { type: Sequelize.TEXT, allowNull: true },
      dashboardConfigJson: { type: Sequelize.TEXT, allowNull: true },
      dataSourceId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'data_sources', key: 'id' },
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('data_source_schemas');
    await queryInterface.dropTable('saved_dashboards');
    await queryInterface.dropTable('prompt_history');
    await queryInterface.dropTable('data_sources');
    await queryInterface.dropTable('tickets');
    await queryInterface.dropTable('productivity_records');
    await queryInterface.dropTable('projects');
    await queryInterface.dropTable('employees');
    await queryInterface.dropTable('departments');
  },
};
