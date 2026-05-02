'use strict';

module.exports = (sequelize, DataTypes) => {
  const Inquiry = sequelize.define('Inquiry', {
    name:    { type: DataTypes.STRING(120), allowNull: false },
    email:   { type: DataTypes.STRING(180), allowNull: false },
    subject: { type: DataTypes.STRING(200), allowNull: true },
    message: { type: DataTypes.TEXT,        allowNull: false },
    status:  { type: DataTypes.STRING(20),  allowNull: false, defaultValue: 'new' }, // new | read | replied | archived
  }, {
    tableName: 'inquiries',
    timestamps: true,
  });

  return Inquiry;
};
