'use strict';

module.exports = (sequelize, DataTypes) => {
  const DataSource = sequelize.define('DataSource', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    sourceType: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'active',
    },
    configJson: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    filePath: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    originalFileName: {
      type: DataTypes.STRING(250),
      allowNull: true,
    },
    mimeType: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    lastSyncedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // JSON blob: { unified, relationships, suggestedPrompts } — set after Excel multi-sheet ingest
    analysisJson: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // Semantic model: business-friendly metadata used by the LLM prompt parser
    // and surfaced in source-detail. See migrations/20260101000001-* for shape.
    semanticModelJson: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
    // Multi-tenant
    workspaceId: { type: DataTypes.INTEGER, allowNull: true },
    ownerUserId: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    tableName: 'data_sources',
    indexes: [{ fields: ['workspaceId'] }],
  });

  DataSource.associate = (models) => {
    DataSource.hasMany(models.DataSourceSchema, { foreignKey: 'dataSourceId' });
    DataSource.hasMany(models.PromptHistory, { foreignKey: 'dataSourceId' });
    DataSource.hasMany(models.SavedDashboard, { foreignKey: 'dataSourceId' });
  };

  return DataSource;
};
