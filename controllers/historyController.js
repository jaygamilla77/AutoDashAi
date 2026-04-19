const db = require('../models');

exports.index = async (req, res) => {
  try {
    const dashboards = await db.SavedDashboard.findAll({
      order: [['createdAt', 'DESC']],
      include: [{ model: db.DataSource, attributes: ['id', 'name'] }],
    });

    const prompts = await db.PromptHistory.findAll({
      order: [['createdAt', 'DESC']],
      limit: 20,
      include: [{ model: db.DataSource, attributes: ['id', 'name'] }],
    });

    res.render('dashboard-history', {
      title: 'Dashboard History',
      dashboards,
      prompts,
    });
  } catch (err) {
    console.error('History error:', err);
    req.flash('error', 'Failed to load history.');
    res.render('dashboard-history', {
      title: 'Dashboard History',
      dashboards: [],
      prompts: [],
    });
  }
};
