'use strict';

const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');
const dbConfig = require('../config/db');

const env = process.env.NODE_ENV || 'development';
const config = dbConfig[env];

let sequelize;
if (config.dialect === 'sqlite') {
  // Ensure data directory exists
  const dir = path.dirname(config.storage);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: config.storage,
    logging: config.logging,
    define: config.define,
  });
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, {
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    logging: config.logging,
    define: config.define,
  });
}

const db = {};

// Load all model files
const basename = path.basename(__filename);
fs.readdirSync(__dirname)
  .filter((file) => file !== basename && file.endsWith('.js'))
  .forEach((file) => {
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

// Set up associations
Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

// ── Multi-tenant safety net: auto-filter reads, auto-stamp writes ──
// Models listed here have `workspaceId` (and optionally `ownerUserId`) columns.
// A Sequelize hook injects `workspaceId = currentWorkspace.id` into every
// SELECT and stamps it on every INSERT, using the request-scoped tenant
// context (AsyncLocalStorage). When no context is set (admin portal, scripts,
// seeders, public share lookups) the hook is a no-op.
const tenantCtx = require('../utils/tenantContext');
const TENANT_MODELS = ['DataSource', 'SavedDashboard', 'PromptHistory', 'DashboardShare'];

TENANT_MODELS.forEach((name) => {
  const M = db[name];
  if (!M) return;

  M.addHook('beforeFind', (options) => {
    const ctx = tenantCtx.get();
    if (!ctx || !ctx.workspace || ctx.bypass) return;
    options.where = options.where || {};
    if (options.where.workspaceId === undefined) {
      options.where.workspaceId = ctx.workspace.id;
    }
  });

  const stampInstance = (instance) => {
    const ctx = tenantCtx.get();
    if (!ctx || !ctx.workspace || ctx.bypass) return;
    if (instance.workspaceId == null) instance.workspaceId = ctx.workspace.id;
    if (ctx.user && instance.ownerUserId == null) instance.ownerUserId = ctx.user.id;
  };
  M.addHook('beforeCreate', stampInstance);
  M.addHook('beforeUpdate', (instance) => {
    const ctx = tenantCtx.get();
    if (!ctx || !ctx.workspace || ctx.bypass) return;
    // Prevent re-parenting a record into another workspace via update.
    if (instance.changed('workspaceId') && instance.workspaceId !== ctx.workspace.id) {
      throw new Error('Cross-workspace update blocked.');
    }
  });
  M.addHook('beforeBulkCreate', (instances) => {
    const ctx = tenantCtx.get();
    if (!ctx || !ctx.workspace || ctx.bypass) return;
    instances.forEach((i) => {
      if (i.workspaceId == null) i.workspaceId = ctx.workspace.id;
      if (ctx.user && i.ownerUserId == null) i.ownerUserId = ctx.user.id;
    });
  });
  // beforeBulkDestroy / beforeBulkUpdate also need scoping
  ['beforeBulkUpdate', 'beforeBulkDestroy'].forEach((hookName) => {
    M.addHook(hookName, (options) => {
      const ctx = tenantCtx.get();
      if (!ctx || !ctx.workspace || ctx.bypass) return;
      options.where = options.where || {};
      if (options.where.workspaceId === undefined) {
        options.where.workspaceId = ctx.workspace.id;
      }
    });
  });
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
