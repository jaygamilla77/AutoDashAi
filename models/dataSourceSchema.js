'use strict';

module.exports = (sequelize, DataTypes) => {
  const DataSourceSchema = sequelize.define('DataSourceSchema', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    dataSourceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    datasetName: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    schemaJson: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    profileJson: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    previewJson: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    tableName: 'data_source_schemas',
  });

  DataSourceSchema.associate = (models) => {
    DataSourceSchema.belongsTo(models.DataSource, { foreignKey: 'dataSourceId' });
  };

  return DataSourceSchema;
};
