'use strict';

/**
 * Per-request tenant context using Node's AsyncLocalStorage.
 *
 * Express middleware wraps each authenticated request, storing the resolved
 * `user` and `workspace`. Sequelize hooks then read this store to:
 *   - Auto-filter SELECT queries by workspaceId (defense in depth)
 *   - Auto-stamp INSERTs with workspaceId + ownerUserId
 *
 * This means even if a controller forgets to scope, data leakage is prevented.
 *
 * Routes that should NOT be tenant-scoped (admin portal, public marketing,
 * shared-dashboard view by token, the auth flow itself) simply do not run
 * inside a tenant context, so hooks become no-ops.
 */

const { AsyncLocalStorage } = require('node:async_hooks');

const als = new AsyncLocalStorage();

function run(ctx, fn) { return als.run(ctx, fn); }
function get() { return als.getStore() || null; }

// Express middleware that opens an ALS scope for downstream handlers.
// Pass a function that resolves { user, workspace } from the request.
function middleware(resolve) {
  return function tenantContextMiddleware(req, res, next) {
    Promise.resolve(resolve(req)).then((ctx) => {
      if (!ctx) return next();
      run(ctx, () => next());
    }).catch(next);
  };
}

module.exports = { run, get, middleware };
