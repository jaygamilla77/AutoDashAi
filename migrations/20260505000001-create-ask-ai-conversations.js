'use strict';

/**
 * Phase 1 of the conversational "Ask AI" workspace:
 *
 *  - conversation_threads: a multi-turn chat session, scoped to a workspace
 *    and (optionally) a data source.
 *  - conversation_messages: ordered messages (system / user / assistant /
 *    tool) belonging to a thread. May carry a structured action payload
 *    (e.g. a generated chart spec) alongside the visible markdown text.
 *  - workspaces.aiPromptsUsedThisMonth + aiPromptsResetAt: monthly AI
 *    prompt counter so plan limits (aiGenerationsPerMonth) can be enforced.
 *
 * Backwards-compatible: all new tables are additive, all new columns are
 * nullable / defaulted.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // ── conversation_threads ────────────────────────────────────────
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map((t) => (typeof t === 'string' ? t : t.tableName)));

    if (!tableSet.has('conversation_threads')) {
      await queryInterface.createTable('conversation_threads', {
        id:            { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        workspaceId:   { type: Sequelize.INTEGER, allowNull: false },
        ownerUserId:   { type: Sequelize.INTEGER, allowNull: false },
        dataSourceId:  { type: Sequelize.INTEGER, allowNull: true },
        title:         { type: Sequelize.STRING(200), allowNull: false, defaultValue: 'New conversation' },
        status:        { type: Sequelize.STRING(24),  allowNull: false, defaultValue: 'active' },
        contextJson:   { type: Sequelize.TEXT('long'), allowNull: true },
        lastMessageAt: { type: Sequelize.DATE, allowNull: true },
        messageCount:  { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt:     { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt:     { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
      await queryInterface.addIndex('conversation_threads', ['workspaceId']);
      await queryInterface.addIndex('conversation_threads', ['ownerUserId']);
      await queryInterface.addIndex('conversation_threads', ['lastMessageAt']);
    }

    if (!tableSet.has('conversation_messages')) {
      await queryInterface.createTable('conversation_messages', {
        id:            { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        threadId:      { type: Sequelize.INTEGER, allowNull: false },
        workspaceId:   { type: Sequelize.INTEGER, allowNull: false },
        role:          { type: Sequelize.STRING(20),  allowNull: false }, // user | assistant | system | tool
        content:       { type: Sequelize.TEXT('long'), allowNull: true },
        actionJson:    { type: Sequelize.TEXT('long'), allowNull: true }, // structured payload (chart spec / suggestions / etc.)
        intent:        { type: Sequelize.STRING(40),  allowNull: true },
        tokensIn:      { type: Sequelize.INTEGER, allowNull: true },
        tokensOut:     { type: Sequelize.INTEGER, allowNull: true },
        latencyMs:     { type: Sequelize.INTEGER, allowNull: true },
        errorText:     { type: Sequelize.STRING(500), allowNull: true },
        createdAt:     { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt:     { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
      await queryInterface.addIndex('conversation_messages', ['threadId']);
      await queryInterface.addIndex('conversation_messages', ['workspaceId']);
      await queryInterface.addIndex('conversation_messages', ['createdAt']);
    }

    // ── workspaces: AI quota counters ──────────────────────────────
    const wsDesc = await queryInterface.describeTable('workspaces');
    if (!wsDesc.aiPromptsUsedThisMonth) {
      await queryInterface.addColumn('workspaces', 'aiPromptsUsedThisMonth', {
        type: Sequelize.INTEGER, allowNull: false, defaultValue: 0,
      });
    }
    if (!wsDesc.aiPromptsResetAt) {
      await queryInterface.addColumn('workspaces', 'aiPromptsResetAt', {
        type: Sequelize.DATE, allowNull: true,
      });
    }
  },

  down: async (queryInterface) => {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map((t) => (typeof t === 'string' ? t : t.tableName)));
    if (tableSet.has('conversation_messages')) await queryInterface.dropTable('conversation_messages');
    if (tableSet.has('conversation_threads')) await queryInterface.dropTable('conversation_threads');
    const wsDesc = await queryInterface.describeTable('workspaces');
    if (wsDesc.aiPromptsUsedThisMonth) await queryInterface.removeColumn('workspaces', 'aiPromptsUsedThisMonth');
    if (wsDesc.aiPromptsResetAt) await queryInterface.removeColumn('workspaces', 'aiPromptsResetAt');
  },
};
