'use strict';

/**
 * PendingSignup — holds an unverified signup until the user clicks the
 * email-verification link. Once verified, a row is moved into `users`
 * and this row is deleted.
 */
module.exports = (sequelize, DataTypes) => {
  const PendingSignup = sequelize.define('PendingSignup', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    email: { type: DataTypes.STRING(180), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false },
    token: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
  }, {
    tableName: 'pending_signups',
    timestamps: true,
  });
  return PendingSignup;
};
