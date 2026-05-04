const db = require('../models');
const { SAMPLE_PROMPTS, CHART_TYPES, CHART_TYPE_GROUPS } = require('../utils/constants');
const { take } = require('../utils/helpers');
const aiService = require('../services/aiService');

/**
 * Executive Dashboard / Home Page
 */
exports.index = async (req, res) => {
  // Explicit workspace scope — don't rely solely on the Sequelize beforeFind
  // hook because Model.count() doesn't always pass through it cleanly, which
  // caused the home page "Total Dashboards" to show a global count while the
  // "Recent Dashboards" list (findAll) was correctly scoped to the workspace.
  const wsId = req.workspace ? req.workspace.id : null;
  const wsWhere = wsId ? { workspaceId: wsId } : {};

  const safeCount = async (model, where) => {
    try { return model ? await model.count({ where: where || {} }) : 0; } catch { return 0; }
  };
  const safeFindAll = async (model, opts) => {
    try { return model ? await model.findAll(opts) : []; } catch { return []; }
  };

  try {
    const [recentDashboards, totalDashboards, totalSources, totalInsights, totalMembers, recentSources, recentInsights, recentMembers] = await Promise.all([
      safeFindAll(db.SavedDashboard, {
        where: wsWhere,
        order: [['updatedAt', 'DESC']],
        limit: 6,
        attributes: ['id', 'title', 'createdAt', 'updatedAt', 'dataSourceId', 'visibility'].filter(Boolean),
      }),
      safeCount(db.SavedDashboard, wsWhere),
      safeCount(db.DataSource, wsWhere),
      safeCount(db.PromptHistory, wsWhere),
      // Team Members: count users belonging to this workspace (fallback to all
      // users if the column doesn't exist yet on this deploy).
      safeCount(db.User, wsId ? { workspaceId: wsId } : {}),
      safeFindAll(db.DataSource, { where: wsWhere, order: [['createdAt', 'DESC']], limit: 4, attributes: ['id', 'name', 'createdAt'] }),
      safeFindAll(db.PromptHistory, { where: wsWhere, order: [['createdAt', 'DESC']], limit: 4, attributes: ['id', 'prompt', 'createdAt'] }),
      safeFindAll(db.User, { where: wsId ? { workspaceId: wsId } : {}, order: [['createdAt', 'DESC']], limit: 4, attributes: ['id', 'name', 'email', 'createdAt'] }),
    ]);

    // Build a unified activity feed
    const activity = [];
    recentDashboards.slice(0, 4).forEach((d) => activity.push({
      type: 'dashboard',
      icon: 'bi-bar-chart-line-fill',
      tone: 'blue',
      text: `Dashboard "${d.title}" was updated`,
      at: d.updatedAt || d.createdAt,
    }));
    recentSources.forEach((s) => activity.push({
      type: 'source',
      icon: 'bi-database-fill',
      tone: 'green',
      text: `Data source "${s.name}" was connected`,
      at: s.createdAt,
    }));
    recentInsights.forEach((p) => activity.push({
      type: 'insight',
      icon: 'bi-stars',
      tone: 'violet',
      text: `AI insight generated${p.prompt ? ` for "${String(p.prompt).slice(0, 40)}${String(p.prompt).length > 40 ? '…' : ''}"` : ''}`,
      at: p.createdAt,
    }));
    recentMembers.forEach((u) => activity.push({
      type: 'member',
      icon: 'bi-person-fill',
      tone: 'amber',
      text: `New team member "${u.name || u.email}" joined`,
      at: u.createdAt,
    }));
    activity.sort((a, b) => new Date(b.at) - new Date(a.at));

    res.render('home', {
      title: 'AutoDash AI – Intelligent AI Dashboard Builder',
      layout: false,
      userDisplayName: req.user ? req.user.name || 'User' : 'Executive',
      recentDashboards,
      stats: {
        dashboards: totalDashboards,
        sources: totalSources,
        insights: totalInsights,
        members: totalMembers || 1,
      },
      activity: activity.slice(0, 6),
    });
  } catch (err) {
    console.error('Home index error:', err);
    res.render('home', {
      title: 'AutoDash AI – Intelligent AI Dashboard Builder',
      layout: false,
      userDisplayName: req.user ? req.user.name || 'User' : 'Executive',
      recentDashboards: [],
      stats: { dashboards: 0, sources: 0, insights: 0, members: 1 },
      activity: [],
    });
  }
};

/**
 * AI Builder Page (formerly home)
 */
exports.aiBuilder = async (req, res) => {
  try {
    const recentDashboards = await db.SavedDashboard.findAll({
      order: [['createdAt', 'DESC']],
      limit: 5,
      include: [{ model: db.DataSource, attributes: ['id', 'name'] }],
    });

    const recentSources = await db.DataSource.findAll({
      order: [['createdAt', 'DESC']],
      limit: 5,
    });

    const recentPrompts = await db.PromptHistory.findAll({
      order: [['createdAt', 'DESC']],
      limit: 5,
    });

    const sources = await db.DataSource.findAll({
      where: { status: 'active' },
      order: [['name', 'ASC']],
      attributes: ['id', 'name', 'sourceType', 'analysisJson'],
    });

    // Build a map of sourceId → suggestedPrompts for client-side dynamic hints
    const sourcePromptMap = {};
    sources.forEach((s) => {
      if (s.analysisJson) {
        try {
          const a = JSON.parse(s.analysisJson);
          if (a.suggestedPrompts && a.suggestedPrompts.length) {
            sourcePromptMap[s.id] = a.suggestedPrompts;
          }
        } catch { /* ignore */ }
      }
    });

    const templates = await db.DashboardTemplate.findAll({
      order: [['isBuiltIn', 'DESC'], ['name', 'ASC']],
    });

    res.render('ai-builder', {
      title: 'AI Auto-Dashboard Builder',
      samplePrompts: take(SAMPLE_PROMPTS, 10),
      chartTypes: CHART_TYPES,
      chartTypeGroups: CHART_TYPE_GROUPS,
      recentDashboards,
      recentSources,
      recentPrompts,
      sources,
      templates,
      sourcePromptMap,
    });
  } catch (err) {
    console.error('AI Builder page error:', err);
    req.flash('error', 'Failed to load AI Builder page.');
    res.render('ai-builder', {
      title: 'AI Auto-Dashboard Builder',
      samplePrompts: SAMPLE_PROMPTS,
      chartTypes: CHART_TYPES,
      chartTypeGroups: CHART_TYPE_GROUPS,
      recentDashboards: [],
      recentSources: [],
      recentPrompts: [],
      sources: [],
      templates: [],
      sourcePromptMap: {},
    });
  }
};
