const db = require('../models');
const { SAMPLE_PROMPTS, CHART_TYPES, CHART_TYPE_GROUPS } = require('../utils/constants');
const { take } = require('../utils/helpers');
const aiService = require('../services/aiService');

exports.index = async (req, res) => {
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

    res.render('home', {
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
    console.error('Home page error:', err);
    req.flash('error', 'Failed to load home page.');
    res.render('home', {
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
