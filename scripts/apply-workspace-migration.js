'use strict';

/**
 * Multi-tenant SaaS schema migration.
 *
 * 1. Creates `workspaces` table.
 * 2. Adds `workspaceId` + `role` to `users`.
 * 3. Adds `workspaceId` + `ownerUserId` to: data_sources, saved_dashboards,
 *    prompt_history, dashboard_shares.
 * 4. Backfills: each existing user gets their own workspace; pre-existing
 *    rows on tenant tables are assigned to the *first* user's workspace
 *    (preserves dev/demo data without scattering it).
 *
 * Run against any DB by setting env vars:
 *   PROD_DB_HOST, PROD_DB_PORT, PROD_DB_USER, PROD_DB_PASSWORD, PROD_DB_NAME
 * Falls back to the dev .env DB_* vars when those are unset.
 *
 * Idempotent — safe to re-run.
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
    multipleStatements: true,
  };
  if (!cfg.user || !cfg.password || !cfg.database) {
    console.error('Missing DB credentials. Set PROD_DB_* or DB_* env vars.');
    process.exit(1);
  }

  console.log('Connecting to', cfg.host + ':' + cfg.port, 'db=' + cfg.database, 'user=' + cfg.user);
  const c = await mysql.createConnection(cfg);

  async function safe(sql) {
    try {
      await c.query(sql);
      console.log('OK   ', sql.split('\n')[0].slice(0, 100));
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME' || e.code === 'ER_DUP_KEYNAME' || /already exists/i.test(e.message)) {
        console.log('SKIP ', sql.split('\n')[0].slice(0, 100), '(already applied)');
      } else {
        console.log('FAIL ', sql.split('\n')[0].slice(0, 100), '->', e.code, e.message);
      }
    }
  }

  // ── 1. workspaces table ──
  await safe(`CREATE TABLE IF NOT EXISTS workspaces (
    id          INT(11) NOT NULL AUTO_INCREMENT,
    name        VARCHAR(180) NOT NULL,
    slug        VARCHAR(120) NOT NULL,
    ownerUserId INT(11) NOT NULL,
    plan        VARCHAR(32)  NOT NULL DEFAULT 'starter',
    trialEndsAt DATETIME NULL,
    subscriptionStatus VARCHAR(32) NOT NULL DEFAULT 'active',
    paymentProvider VARCHAR(32) NULL,
    settings    TEXT NULL,
    createdAt   DATETIME NOT NULL,
    updatedAt   DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_workspaces_slug (slug),
    KEY idx_workspaces_owner (ownerUserId),
    KEY idx_workspaces_plan (plan)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // ── 2. users: workspaceId + role ──
  await safe("ALTER TABLE users ADD COLUMN workspaceId INT(11) NULL");
  await safe("ALTER TABLE users ADD COLUMN role VARCHAR(24) NOT NULL DEFAULT 'admin'");
  await safe("ALTER TABLE users ADD KEY idx_users_workspace (workspaceId)");

  // ── 3. tenant tables ──
  const tenantTables = ['data_sources', 'saved_dashboards', 'prompt_history', 'dashboard_shares'];
  for (const t of tenantTables) {
    await safe(`ALTER TABLE ${t} ADD COLUMN workspaceId INT(11) NULL`);
    await safe(`ALTER TABLE ${t} ADD COLUMN ownerUserId INT(11) NULL`);
    await safe(`ALTER TABLE ${t} ADD KEY idx_${t}_workspace (workspaceId)`);
  }

  // ── 4. Backfill ──
  // Create a workspace for every user that doesn't have one yet.
  const [users] = await c.query('SELECT id, name, email FROM users WHERE workspaceId IS NULL ORDER BY id');
  for (const u of users) {
    const baseSlug = String(u.email || ('user-' + u.id))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || ('ws-' + u.id);
    let slug = baseSlug;
    let i = 1;
    // resolve uniqueness
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const [r] = await c.query('SELECT id FROM workspaces WHERE slug = ? LIMIT 1', [slug]);
      if (!r.length) break;
      slug = baseSlug + '-' + (++i);
      if (i > 200) { slug = baseSlug + '-' + Date.now().toString(36); break; }
    }
    const wsName = (u.name || u.email || ('User ' + u.id)) + "'s Workspace";
    const [ins] = await c.query(
      "INSERT INTO workspaces (name, slug, ownerUserId, plan, subscriptionStatus, createdAt, updatedAt) " +
      "VALUES (?, ?, ?, 'starter', 'active', NOW(), NOW())",
      [wsName, slug, u.id]
    );
    await c.query('UPDATE users SET workspaceId = ?, role = ? WHERE id = ?', [ins.insertId, 'admin', u.id]);
    console.log('  backfilled user id=' + u.id + ' (' + u.email + ') → workspace id=' + ins.insertId);
  }

  // Assign existing tenant rows to the *first* user's workspace (best
  // available default — admins can re-attribute later via admin UI).
  const [first] = await c.query('SELECT id, workspaceId FROM users WHERE workspaceId IS NOT NULL ORDER BY id ASC LIMIT 1');
  if (first.length) {
    const wsId = first[0].workspaceId;
    const ownerId = first[0].id;
    for (const t of tenantTables) {
      const [r] = await c.query(`UPDATE ${t} SET workspaceId = ?, ownerUserId = ? WHERE workspaceId IS NULL`, [wsId, ownerId]);
      console.log(`  backfilled ${t}: ${r.affectedRows} rows → workspace ${wsId}`);
    }
  }

  // ── 5. summary ──
  console.log('\n--- summary ---');
  const [u] = await c.query('SELECT id, email, role, workspaceId FROM users ORDER BY id');
  console.table(u);
  const [w] = await c.query('SELECT id, slug, plan, ownerUserId, subscriptionStatus FROM workspaces ORDER BY id');
  console.table(w);

  await c.end();
})().catch(e => { console.error('ERR', e.code, e.message, e.stack); process.exit(1); });
