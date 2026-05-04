'use strict';
// Manually apply the workspace AI-config columns. Use this when the
// sequelize-cli migration history is out of sync (alter:true history etc).
//
// Usage:
//   node scripts/apply-ai-workspace-columns.js                  → dev
//   NODE_ENV=production node scripts/apply-ai-workspace-columns.js → prod

const db = require('../models');

(async () => {
  const qi = db.sequelize.getQueryInterface();
  const { Sequelize } = db;
  const desc = await qi.describeTable('workspaces');

  const cols = [
    ['aiProvider',   { type: Sequelize.STRING(16),  allowNull: false, defaultValue: 'system' }],
    ['aiEndpoint',   { type: Sequelize.STRING(500), allowNull: true }],
    ['aiApiKey',     { type: Sequelize.TEXT,        allowNull: true }],
    ['aiDeployment', { type: Sequelize.STRING(120), allowNull: true }],
    ['aiApiVersion', { type: Sequelize.STRING(40),  allowNull: true }],
  ];

  for (const [name, def] of cols) {
    if (!desc[name]) {
      console.log('Adding column:', name);
      await qi.addColumn('workspaces', name, def);
    } else {
      console.log('Already present:', name);
    }
  }

  // Mark the migration as applied so sequelize-cli doesn't try to re-run it.
  await db.sequelize.query(
    "INSERT IGNORE INTO SequelizeMeta (name) VALUES ('20260504000001-add-ai-config-to-workspaces.js')"
  );

  await db.sequelize.close();
  console.log('Done.');
})().catch((e) => { console.error(e); process.exit(1); });
