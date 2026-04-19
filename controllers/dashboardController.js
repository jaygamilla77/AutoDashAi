const db = require('../models');
const dashboardService = require('../services/dashboardService');
const { safeJsonParse } = require('../utils/helpers');

exports.generate = async (req, res) => {
  try {
    const { prompt, chartType, dataSourceId } = req.body;

    if (!prompt || !prompt.trim()) {
      req.flash('error', 'Please enter a prompt.');
      return res.redirect('/');
    }

    const result = await dashboardService.generate({
      prompt: prompt.trim(),
      chartType: chartType || 'auto',
      dataSourceId: dataSourceId ? parseInt(dataSourceId, 10) : null,
    });

    // Fetch sources for the form
    const sources = await db.DataSource.findAll({
      where: { status: 'active' },
      order: [['name', 'ASC']],
    });

    res.render('dashboard-result', {
      title: result.title || 'Dashboard',
      dashboard: result,
      sources,
    });
  } catch (err) {
    console.error('Dashboard generate error:', err);
    req.flash('error', `Dashboard generation failed: ${err.message}`);
    res.redirect('/');
  }
};

exports.save = async (req, res) => {
  try {
    const { title, promptText, dashboardConfigJson, dataSourceId } = req.body;

    if (!title || !title.trim()) {
      req.flash('error', 'Dashboard title is required.');
      return res.redirect('/');
    }

    await db.SavedDashboard.create({
      title: title.trim(),
      promptText: promptText || '',
      dashboardConfigJson: dashboardConfigJson || '{}',
      dataSourceId: dataSourceId ? parseInt(dataSourceId, 10) : null,
    });

    req.flash('success', 'Dashboard saved successfully.');
    res.redirect('/dashboard/history');
  } catch (err) {
    console.error('Dashboard save error:', err);
    req.flash('error', `Failed to save dashboard: ${err.message}`);
    res.redirect('/');
  }
};

exports.detail = async (req, res) => {
  try {
    const dashboard = await db.SavedDashboard.findByPk(req.params.id, {
      include: [{ model: db.DataSource, attributes: ['id', 'name'] }],
    });

    if (!dashboard) {
      req.flash('error', 'Dashboard not found.');
      return res.redirect('/dashboard/history');
    }

    const config = safeJsonParse(dashboard.dashboardConfigJson) || {};

    res.render('dashboard-detail', {
      title: dashboard.title,
      dashboard,
      config,
    });
  } catch (err) {
    console.error('Dashboard detail error:', err);
    req.flash('error', 'Failed to load dashboard.');
    res.redirect('/dashboard/history');
  }
};
