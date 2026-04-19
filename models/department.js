'use strict';

module.exports = (sequelize, DataTypes) => {
  const Department = sequelize.define('Department', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
    },
  }, {
    tableName: 'departments',
  });

  Department.associate = (models) => {
    Department.hasMany(models.Employee, { foreignKey: 'departmentId' });
    Department.hasMany(models.Project, { foreignKey: 'departmentId' });
    Department.hasMany(models.Ticket, { foreignKey: 'departmentId' });
  };

  return Department;
};
