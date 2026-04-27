'use strict';

const crypto = require('crypto');
const db = require('../models');
const { safeJsonParse } = require('../utils/helpers');

function genToken(bytes = 18) {
  // URL-safe base64
  return crypto.randomBytes(bytes).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hashPwd(pwd) {
  return crypto.createHash('sha256').update(String(pwd)).digest('hex');
}

function shareToDto(share, baseUrl) {
  return {
    id: share.id,
    dashboardId: share.dashboardId,
    shareToken: share.shareToken,
    shareUrl: baseUrl + '/share/dashboard/' + share.shareToken,
    permissionType: share.permissionType,
    allowFilters: share.allowFilters,
    allowExport: share.allowExport,
    hasPassword: !!share.passwordHash,
    expiresAt: share.expiresAt,
    isActive: share.isActive,
    viewCount: share.viewCount,
    lastViewedAt: share.lastViewedAt,
    createdAt: share.createdAt,
  };
}

function getBaseUrl(req) {
  return req.protocol + '://' + req.get('host');
}

/** POST /dashboard/:id/share — create a new share link */
exports.createShare = async (req, res) => {
  try {
    const dashboardId = parseInt(req.params.id, 10);
    const dashboard = await db.SavedDashboard.findByPk(dashboardId);
    if (!dashboard) return res.status(404).json({ error: 'Dashboard not found' });

    const {
      permissionType = 'interactive',
      allowFilters = true,
      allowExport = true,
      password = null,
      expiresAt = null,
    } = req.body || {};

    const allowedPerms = ['view', 'interactive', 'filters'];
    const perm = allowedPerms.includes(permissionType) ? permissionType : 'interactive';

    let expiresAtDate = null;
    if (expiresAt) {
      const d = new Date(expiresAt);
      if (!isNaN(d.getTime())) expiresAtDate = d;
    }

    const share = await db.DashboardShare.create({
      dashboardId,
      shareToken: genToken(),
      permissionType: perm,
      allowFilters: !!allowFilters,
      allowExport: !!allowExport,
      passwordHash: password ? hashPwd(password) : null,
      expiresAt: expiresAtDate,
      isActive: true,
      viewCount: 0,
    });

    return res.json({ share: shareToDto(share, getBaseUrl(req)) });
  } catch (err) {
    console.error('createShare error:', err);
    return res.status(500).json({ error: err.message });
  }
};

/** GET /dashboard/:id/shares — list active links */
exports.listShares = async (req, res) => {
  try {
    const dashboardId = parseInt(req.params.id, 10);
    const shares = await db.DashboardShare.findAll({
      where: { dashboardId },
      order: [['createdAt', 'DESC']],
    });
    const baseUrl = getBaseUrl(req);
    return res.json({ shares: shares.map((s) => shareToDto(s, baseUrl)) });
  } catch (err) {
    console.error('listShares error:', err);
    return res.status(500).json({ error: err.message });
  }
};

/** POST /dashboard/share/:shareId/revoke — disable a link */
exports.revokeShare = async (req, res) => {
  try {
    const shareId = parseInt(req.params.shareId, 10);
    const share = await db.DashboardShare.findByPk(shareId);
    if (!share) return res.status(404).json({ error: 'Share not found' });
    share.isActive = false;
    await share.save();
    return res.json({ success: true });
  } catch (err) {
    console.error('revokeShare error:', err);
    return res.status(500).json({ error: err.message });
  }
};

/** POST /dashboard/share/:shareId/regenerate — rotate token */
exports.regenerateShare = async (req, res) => {
  try {
    const shareId = parseInt(req.params.shareId, 10);
    const share = await db.DashboardShare.findByPk(shareId);
    if (!share) return res.status(404).json({ error: 'Share not found' });
    share.shareToken = genToken();
    share.viewCount = 0;
    share.isActive = true;
    await share.save();
    return res.json({ share: shareToDto(share, getBaseUrl(req)) });
  } catch (err) {
    console.error('regenerateShare error:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /share/dashboard/:token — public shared dashboard view
 * Renders the dashboard via the same executive renderer as edit-canvas, but
 * read-only and stripped of admin/source-credential information.
 */
exports.viewShared = async (req, res) => {
  try {
    const token = req.params.token;
    const share = await db.DashboardShare.findOne({ where: { shareToken: token } });

    if (!share) return res.status(404).render('shared-error', { reason: 'Link not found.', layout: false });
    if (!share.isActive) return res.status(403).render('shared-error', { reason: 'This share link has been revoked.', layout: false });
    if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
      return res.status(403).render('shared-error', { reason: 'This share link has expired.', layout: false });
    }

    // Password gate
    if (share.passwordHash) {
      const provided = (req.query.pwd || req.body?.pwd || '').trim();
      if (!provided || hashPwd(provided) !== share.passwordHash) {
        return res.status(401).render('shared-password', { token, error: provided ? 'Incorrect password.' : null, layout: false });
      }
    }

    const dashboard = await db.SavedDashboard.findByPk(share.dashboardId);
    if (!dashboard) return res.status(404).render('shared-error', { reason: 'Dashboard no longer exists.', layout: false });

    const config = safeJsonParse(dashboard.dashboardConfigJson) || {};

    // Sanitise — never leak data source credentials
    const safeConfig = {
      panels: config.panels || [],
      kpiData: config.kpiData || [],
      executiveSummary: config.executiveSummary || '',
      palette: config.palette || [],
      dashboardType: config.dashboardType || null,
      dashboardRole: config.dashboardRole || null,
      dashboardSubtitle: config.dashboardSubtitle || null,
      anomalyAlert: config.anomalyAlert || null,
      layoutHint: config.layoutHint || null,
      sections: config.sections || [],
      schemaVersion: config.schemaVersion || null,
      renderMode: config.renderMode || null,
    };

    // Track view (fire-and-forget)
    share.viewCount += 1;
    share.lastViewedAt = new Date();
    share.save().catch(() => {});

    return res.render('shared-dashboard', {
      title: dashboard.title,
      dashboard: { id: dashboard.id, title: dashboard.title, promptText: dashboard.promptText },
      config: safeConfig,
      permission: {
        type: share.permissionType,
        allowFilters: share.allowFilters,
        allowExport: share.allowExport,
      },
      viewCount: share.viewCount,
      layout: false, // standalone page, no admin sidebar
    });
  } catch (err) {
    console.error('viewShared error:', err);
    return res.status(500).render('shared-error', { reason: 'An unexpected error occurred.', layout: false });
  }
};
