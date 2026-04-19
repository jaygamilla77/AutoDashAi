'use strict';

module.exports = (sequelize, DataTypes) => {
  const SavedDashboard = sequelize.define('SavedDashboard', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    title: {
      type: DataTypes.STRING(250),
      allowNull: false,
    },
    promptText: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    dashboardConfigJson: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    dataSourceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  }, {
    tableName: 'saved_dashboards',
  });

  SavedDashboard.associate = (models) => {
    SavedDashboard.belongsTo(models.DataSource, { foreignKey: 'dataSourceId' });
  };

  return SavedDashboard;
};
