'use strict';

module.exports = (sequelize, DataTypes) => {
  const PromptHistory = sequelize.define('PromptHistory', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    promptText: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    selectedChartType: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    interpretedIntent: {
      type: DataTypes.STRING(250),
      allowNull: true,
    },
    generatedTitle: {
      type: DataTypes.STRING(250),
      allowNull: true,
    },
    structuredRequestJson: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    dataSourceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    // Multi-tenant
    workspaceId: { type: DataTypes.INTEGER, allowNull: true },
    ownerUserId: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    tableName: 'prompt_history',
    indexes: [{ fields: ['workspaceId'] }],
  });

  PromptHistory.associate = (models) => {
    PromptHistory.belongsTo(models.DataSource, { foreignKey: 'dataSourceId' });
  };

  return PromptHistory;
};
