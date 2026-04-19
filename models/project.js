'use strict';

module.exports = (sequelize, DataTypes) => {
  const Project = sequelize.define('Project', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    code: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    departmentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(30),
      defaultValue: 'active',
    },
    budget: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
  }, {
    tableName: 'projects',
  });

  Project.associate = (models) => {
    Project.belongsTo(models.Department, { foreignKey: 'departmentId' });
    Project.hasMany(models.ProductivityRecord, { foreignKey: 'projectId' });
    Project.hasMany(models.Ticket, { foreignKey: 'projectId' });
  };

  return Project;
};
