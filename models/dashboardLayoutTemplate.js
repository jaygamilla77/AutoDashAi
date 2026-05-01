'use strict';

module.exports = (sequelize, DataTypes) => {
  const DashboardLayoutTemplate = sequelize.define('DashboardLayoutTemplate', {
    id: {
      type: DataTypes.STRING(50),
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'Business',
    },
    icon: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'bi-bar-chart-fill',
    },
    // JSON array of KPI names
    kpis: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '[]',
    },
    // JSON array of recommended chart types
    chartTypes: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '[]',
    },
    // JSON array of section names
    sections: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '[]',
    },
    // Default title when user creates with this template
    defaultTitle: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    // AI prompt starter to help guide dashboard generation
    promptStarter: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // Suggested dashboard role
    dashboardRole: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    // Whether this is a built-in template
    isBuiltIn: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    // Sort order
    sortOrder: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  }, {
    tableName: 'dashboard_layout_templates',
    timestamps: true,
  });

  return DashboardLayoutTemplate;
};
