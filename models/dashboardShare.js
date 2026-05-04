'use strict';

module.exports = (sequelize, DataTypes) => {
  const DashboardShare = sequelize.define('DashboardShare', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    dashboardId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    shareToken: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    // 'view' = read-only, 'interactive' = hover/tooltips/drilldown, 'filters' = filters allowed
    permissionType: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'interactive',
    },
    allowFilters: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    allowExport: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    viewCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    lastViewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Multi-tenant
    workspaceId: { type: DataTypes.INTEGER, allowNull: true },
    ownerUserId: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    tableName: 'dashboard_shares',
    indexes: [
      { unique: true, fields: ['shareToken'] },
      { fields: ['dashboardId'] },
      // workspaceId index intentionally omitted: dashboard_shares table has
      // already hit the MySQL 64-keys-per-table limit on production.
    ],
  });

  DashboardShare.associate = (models) => {
    DashboardShare.belongsTo(models.SavedDashboard, { foreignKey: 'dashboardId', as: 'dashboard' });
  };

  return DashboardShare;
};
