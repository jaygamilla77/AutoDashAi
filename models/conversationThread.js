'use strict';

module.exports = (sequelize, DataTypes) => {
  const ConversationThread = sequelize.define('ConversationThread', {
    id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    workspaceId:   { type: DataTypes.INTEGER, allowNull: false },
    ownerUserId:   { type: DataTypes.INTEGER, allowNull: false },
    dataSourceId:  { type: DataTypes.INTEGER, allowNull: true },
    title:         { type: DataTypes.STRING(200), allowNull: false, defaultValue: 'New conversation' },
    status:        { type: DataTypes.STRING(24),  allowNull: false, defaultValue: 'active' },
    contextJson:   { type: DataTypes.TEXT('long'), allowNull: true },
    lastMessageAt: { type: DataTypes.DATE, allowNull: true },
    messageCount:  { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  }, {
    tableName: 'conversation_threads',
    timestamps: true,
    indexes: [
      { fields: ['workspaceId'] },
      { fields: ['ownerUserId'] },
      { fields: ['lastMessageAt'] },
    ],
  });

  ConversationThread.associate = (models) => {
    ConversationThread.hasMany(models.ConversationMessage, { foreignKey: 'threadId', as: 'messages', onDelete: 'CASCADE' });
    if (models.DataSource) ConversationThread.belongsTo(models.DataSource, { foreignKey: 'dataSourceId', as: 'dataSource' });
    if (models.User) ConversationThread.belongsTo(models.User, { foreignKey: 'ownerUserId', as: 'owner' });
  };

  return ConversationThread;
};
