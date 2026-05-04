'use strict';

/**
 * Add per-workspace Azure OpenAI configuration.
 *
 *   aiProvider     'system' (default — uses global env credentials)
 *                  'custom' (workspace's own dedicated endpoint)
 *   aiEndpoint     https://<resource>.openai.azure.com/
 *   aiApiKey       AES-256-GCM ciphertext (base64) of the API key
 *   aiDeployment   deployment / model name
 *   aiApiVersion   e.g. 2024-02-15-preview
 *
 * Backwards-compatible: all new columns are nullable. Existing workspaces
 * default to provider='system' which keeps current behaviour.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = 'workspaces';
    const desc = await queryInterface.describeTable(table);

    const cols = [
      ['aiProvider',   { type: Sequelize.STRING(16),  allowNull: false, defaultValue: 'system' }],
      ['aiEndpoint',   { type: Sequelize.STRING(500), allowNull: true }],
      ['aiApiKey',     { type: Sequelize.TEXT,        allowNull: true }],
      ['aiDeployment', { type: Sequelize.STRING(120), allowNull: true }],
      ['aiApiVersion', { type: Sequelize.STRING(40),  allowNull: true }],
    ];

    for (const [name, def] of cols) {
      if (!desc[name]) {
        await queryInterface.addColumn(table, name, def);
      }
    }
  },

  down: async (queryInterface) => {
    const table = 'workspaces';
    const desc = await queryInterface.describeTable(table);
    for (const name of ['aiProvider', 'aiEndpoint', 'aiApiKey', 'aiDeployment', 'aiApiVersion']) {
      if (desc[name]) await queryInterface.removeColumn(table, name);
    }
  },
};
