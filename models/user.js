'use strict';

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    email: { type: DataTypes.STRING(180), allowNull: false, unique: true, validate: { isEmail: true } },
    // Nullable so OAuth users without a local password can be stored.
    passwordHash: { type: DataTypes.STRING(255), allowNull: true },
    emailVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true },

    // Subscription plan / trial
    plan: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'starter' }, // starter | business | enterprise
    planTrialEndsAt: { type: DataTypes.DATE, allowNull: true },

    // OAuth provider identity
    authProvider: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'local' }, // local | google | microsoft
    providerUserId: { type: DataTypes.STRING(180), allowNull: true },
    avatarUrl: { type: DataTypes.STRING(500), allowNull: true },

    // Onboarding state
    onboardingCompleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    onboardingStep: { type: DataTypes.STRING(32), allowNull: true },

    // Multi-tenant SaaS — each user belongs to exactly one workspace
    workspaceId: { type: DataTypes.INTEGER, allowNull: true },
    role: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'admin' }, // super_admin | admin | member | viewer
  }, {
    tableName: 'users',
    timestamps: true,
  });
  User.associate = (models) => {
    User.belongsTo(models.Workspace, { foreignKey: 'workspaceId', as: 'workspace' });
  };
  return User;
};
