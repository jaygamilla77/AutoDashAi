'use strict';

module.exports = (sequelize, DataTypes) => {
  const Employee = sequelize.define('Employee', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    employeeId: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
    },
    fullName: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    departmentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    hiredDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
  }, {
    tableName: 'employees',
  });

  Employee.associate = (models) => {
    Employee.belongsTo(models.Department, { foreignKey: 'departmentId' });
    Employee.hasMany(models.ProductivityRecord, { foreignKey: 'employeeId' });
    Employee.hasMany(models.Ticket, { foreignKey: 'employeeId' });
  };

  return Employee;
};
