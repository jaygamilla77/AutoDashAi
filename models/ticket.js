'use strict';

module.exports = (sequelize, DataTypes) => {
  const Ticket = sequelize.define('Ticket', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    ticketNo: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
    },
    title: {
      type: DataTypes.STRING(250),
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    priority: {
      type: DataTypes.STRING(20),
      defaultValue: 'medium',
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'open',
    },
    employeeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    departmentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    projectId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'tickets',
  });

  Ticket.associate = (models) => {
    Ticket.belongsTo(models.Employee, { foreignKey: 'employeeId' });
    Ticket.belongsTo(models.Department, { foreignKey: 'departmentId' });
    Ticket.belongsTo(models.Project, { foreignKey: 'projectId' });
  };

  return Ticket;
};
