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

    // PayMongo payment integration
    paymongoCustomerId: { type: DataTypes.STRING(120), allowNull: true },
    paymongoSubscriptionId: { type: DataTypes.STRING(120), allowNull: true },
    paymentMethod: { type: DataTypes.STRING(50), allowNull: true, defaultValue: 'card' },
    planUpgradedAt: { type: DataTypes.DATE, allowNull: true },
    nextBillingDate: { type: DataTypes.DATE, allowNull: true },

    // Per-workspace Azure OpenAI configuration.
    //   'system' = use the global env credentials (default, shared)
    //   'custom' = use the workspace's own dedicated endpoint below
    aiProvider:   { type: DataTypes.STRING(16),  allowNull: false, defaultValue: 'system' },
    aiEndpoint:   { type: DataTypes.STRING(500), allowNull: true },
    aiApiKey:     { type: DataTypes.TEXT,        allowNull: true }, // encrypted ciphertext
    aiDeployment: { type: DataTypes.STRING(120), allowNull: true },
    aiApiVersion: { type: DataTypes.STRING(40),  allowNull: true },

    // Monthly AI prompt counter — used to enforce planService limits
    // (aiGenerationsPerMonth). Reset at aiPromptsResetAt rollover.
    aiPromptsUsedThisMonth: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    aiPromptsResetAt:       { type: DataTypes.DATE,    allowNull: true },
  }, {
    tableName: 'workspaces',
    indexes: [{ fields: ['ownerUserId'] }, { fields: ['plan'] }],
  });

  Workspace.associate = (models) => {
    Workspace.belongsTo(models.User, { foreignKey: 'ownerUserId', as: 'owner' });
  };

  return Workspace;
};
