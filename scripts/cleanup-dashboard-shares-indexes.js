'use strict';

/**
 * Drop duplicate indexes on `dashboard_shares` left over from many
 * sequelize `alter:true` syncs. Keeps PRIMARY + the first shareToken
 * unique index + the dashboardId index, drops the rest.
 *
 * Run with PROD_DB_* env vars (or DB_* vars from .env) like the other
 * scripts. Idempotent — safe to re-run.
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const cfg = {
    host:     process.env.PROD_DB_HOST     || process.env.DB_HOST,
    port:     Number(process.env.PROD_DB_PORT || process.env.DB_PORT || 3306),
    user:     process.env.PROD_DB_USER     || process.env.DB_USER,
    password: process.env.PROD_DB_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.PROD_DB_NAME     || process.env.DB_NAME,
  };
  console.log('Connecting to', cfg.host, 'db=' + cfg.database);
  const c = await mysql.createConnection(cfg);

  const [idx] = await c.query("SHOW INDEX FROM dashboard_shares");
  // Group by Key_name. Keep PRIMARY + lowest-numbered index per logical column set.
  const groups = {};
  for (const row of idx) {
    if (!groups[row.Key_name]) groups[row.Key_name] = [];
    groups[row.Key_name].push(row);
  }
  console.log('Total indexes:', Object.keys(groups).length);

  // We want to keep: PRIMARY, the first one whose first column is shareToken,
  // the first one whose first column is dashboardId, and the first one for workspaceId.
  const keep = new Set(['PRIMARY']);
  let firstShareToken, firstDashboardId, firstWorkspaceId;
  for (const name of Object.keys(groups)) {
    if (name === 'PRIMARY') continue;
    const cols = groups[name].sort((a, b) => a.Seq_in_index - b.Seq_in_index).map(r => r.Column_name);
    if (cols[0] === 'shareToken' && cols.length === 1 && !firstShareToken) { firstShareToken = name; keep.add(name); }
    else if (cols[0] === 'dashboardId' && cols.length === 1 && !firstDashboardId) { firstDashboardId = name; keep.add(name); }
    else if (cols[0] === 'workspaceId' && cols.length === 1 && !firstWorkspaceId) { firstWorkspaceId = name; keep.add(name); }
  }
  console.log('Keeping:', [...keep]);

  let dropped = 0;
  for (const name of Object.keys(groups)) {
    if (keep.has(name)) continue;
    try {
      await c.query('ALTER TABLE dashboard_shares DROP INDEX `' + name + '`');
      dropped++;
      if (dropped % 10 === 0) console.log('Dropped', dropped, '...');
    } catch (e) {
      console.log('FAIL drop', name, '->', e.code, e.message);
    }
  }
  console.log('Total dropped:', dropped);

  const [after] = await c.query("SHOW INDEX FROM dashboard_shares");
  const remainingNames = [...new Set(after.map(r => r.Key_name))];
  console.log('Remaining indexes (' + remainingNames.length + '):', remainingNames);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
