const db = require('../models');
const { SAMPLE_PROMPTS, CHART_TYPES } = require('../utils/constants');
const { take } = require('../utils/helpers');

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
    });

    res.render('home', {
      title: 'AI Auto-Dashboard Builder',
      samplePrompts: take(SAMPLE_PROMPTS, 10),
      chartTypes: CHART_TYPES,
      recentDashboards,
      recentSources,
      recentPrompts,
      sources,
    });
  } catch (err) {
    console.error('Home page error:', err);
    req.flash('error', 'Failed to load home page.');
    res.render('home', {
      title: 'AI Auto-Dashboard Builder',
      samplePrompts: SAMPLE_PROMPTS,
      chartTypes: CHART_TYPES,
      recentDashboards: [],
      recentSources: [],
      recentPrompts: [],
      sources: [],
    });
  }
};
