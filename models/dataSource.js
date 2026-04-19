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
  }, {
    tableName: 'data_sources',
  });

  DataSource.associate = (models) => {
    DataSource.hasMany(models.DataSourceSchema, { foreignKey: 'dataSourceId' });
    DataSource.hasMany(models.PromptHistory, { foreignKey: 'dataSourceId' });
    DataSource.hasMany(models.SavedDashboard, { foreignKey: 'dataSourceId' });
  };

  return DataSource;
};
