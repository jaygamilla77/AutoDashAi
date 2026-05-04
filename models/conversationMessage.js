'use strict';

module.exports = (sequelize, DataTypes) => {
  const ConversationMessage = sequelize.define('ConversationMessage', {
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    threadId:    { type: DataTypes.INTEGER, allowNull: false },
    workspaceId: { type: DataTypes.INTEGER, allowNull: false },
    role:        { type: DataTypes.STRING(20),  allowNull: false },
    content:     { type: DataTypes.TEXT('long'), allowNull: true },
    actionJson:  { type: DataTypes.TEXT('long'), allowNull: true },
    intent:      { type: DataTypes.STRING(40), allowNull: true },
    tokensIn:    { type: DataTypes.INTEGER, allowNull: true },
    tokensOut:   { type: DataTypes.INTEGER, allowNull: true },
    latencyMs:   { type: DataTypes.INTEGER, allowNull: true },
    errorText:   { type: DataTypes.STRING(500), allowNull: true },
  }, {
    tableName: 'conversation_messages',
    timestamps: true,
    indexes: [
      { fields: ['threadId'] },
      { fields: ['workspaceId'] },
      { fields: ['createdAt'] },
    ],
  });

  ConversationMessage.associate = (models) => {
    ConversationMessage.belongsTo(models.ConversationThread, { foreignKey: 'threadId', as: 'thread', onDelete: 'CASCADE' });
  };

  return ConversationMessage;
};
