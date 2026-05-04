'use strict';
// Manually apply the Phase 1 "Ask AI" tables + workspace AI-quota columns.
// Use this when sequelize-cli migration history is out of sync.
//
// Usage:
//   node scripts/apply-ask-ai-tables.js                     → dev
//   NODE_ENV=production node scripts/apply-ask-ai-tables.js → prod

const db = require('../models');
const migration = require('../migrations/20260505000001-create-ask-ai-conversations');

(async () => {
  const qi = db.sequelize.getQueryInterface();
  const { Sequelize } = db;

  console.log('Applying Ask AI Phase 1 schema (idempotent)...');
  await migration.up(qi, Sequelize);

  // Mark as applied so sequelize-cli doesn't try to re-run it.
  await db.sequelize.query(
    "INSERT IGNORE INTO SequelizeMeta (name) VALUES ('20260505000001-create-ask-ai-conversations.js')"
  );

  await db.sequelize.close();
  console.log('Done.');
})().catch((e) => { console.error(e); process.exit(1); });
