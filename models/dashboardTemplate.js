'use strict';

module.exports = (sequelize, DataTypes) => {
  const DashboardTemplate = sequelize.define('DashboardTemplate', {
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    fontFamily: {
      type: DataTypes.STRING(100),
      defaultValue: 'Inter',
    },
    // JSON array of 8 hex color strings
    colorPalette: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    // UI accent / primary color (used for headings, KPI values, etc.)
    accentColor: {
      type: DataTypes.STRING(20),
      defaultValue: '#111827',
    },
    isBuiltIn: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    // JSON array of preferred chart types, e.g. ["bar","line","pie"]
    preferredChartTypes: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    category: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },
    // JSON array of recommended KPIs, e.g. ["Revenue","Conversion Rate"]
    recommendedKpis: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  }, {
    tableName: 'dashboard_templates',
  });

  return DashboardTemplate;
};
