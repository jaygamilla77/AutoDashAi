'use strict';

module.exports = (sequelize, DataTypes) => {
  const ProductivityRecord = sequelize.define('ProductivityRecord', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    employeeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    projectId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    workDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    tasksCompleted: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    hoursLogged: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    productivityScore: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    remarks: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
  }, {
    tableName: 'productivity_records',
  });

  ProductivityRecord.associate = (models) => {
    ProductivityRecord.belongsTo(models.Employee, { foreignKey: 'employeeId' });
    ProductivityRecord.belongsTo(models.Project, { foreignKey: 'projectId' });
  };

  return ProductivityRecord;
};
