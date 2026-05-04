'use strict';

module.exports = (sequelize, DataTypes) => {
  const Workspace = sequelize.define('Workspace', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(180), allowNull: false },
    slug: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    ownerUserId: { type: DataTypes.INTEGER, allowNull: false },
    plan: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'starter' },
    trialEndsAt: { type: DataTypes.DATE, allowNull: true },
    subscriptionStatus: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'active' },
    paymentProvider: { type: DataTypes.STRING(32), allowNull: true },
    settings: { type: DataTypes.TEXT, allowNull: true },
  }, {
    tableName: 'workspaces',
    indexes: [{ fields: ['ownerUserId'] }, { fields: ['plan'] }],
  });

  Workspace.associate = (models) => {
    Workspace.belongsTo(models.User, { foreignKey: 'ownerUserId', as: 'owner' });
  };

  return Workspace;
};
