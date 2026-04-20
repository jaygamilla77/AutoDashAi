const db = require('../models');
const dashboardService = require('../services/dashboardService');
const { safeJsonParse } = require('../utils/helpers');

exports.generateMulti = async (req, res) => {
  try {
    const { panels, dataSourceId, templateId } = req.body;
    let panelArray = [];
    try { panelArray = JSON.parse(panels || '[]'); } catch (e) { /* invalid json */ }

    if (!panelArray.length) {
      req.flash('error', 'Please add at least one panel.');
      return res.redirect('/');
    }

    const srcId = dataSourceId ? parseInt(dataSourceId, 10) : null;
    const tmplId = templateId ? parseInt(templateId, 10) : null;

    // Generate each panel sequentially to avoid DB overload
    const results = [];
    for (const p of panelArray) {
      try {
        const r = await dashboardService.generate({
          prompt: p.prompt || '',
          chartType: p.chartType || 'auto',
          dataSourceId: srcId,
          templateId: tmplId,
        });
        results.push(r);
      } catch (err) {
        results.push({
          title: p.prompt.substring(0, 60),
          originalPrompt: p.prompt,
          hasData: false,
          error: err.message,
          kpis: [],
          chartConfig: null,
          tableData: { columns: [], rows: [] },
          template: null,
        });
      }
    }

    res.render('dashboard-multi', {
      title: 'Dashboard — ' + results.length + ' panels',
      panels: results,
    });
  } catch (err) {
    console.error('Dashboard multi generate error:', err);
    req.flash('error', `Dashboard generation failed: ${err.message}`);
    res.redirect('/');
  }
};

exports.generate = async (req, res) => {
  try {
    const { prompt, chartType, dataSourceId, templateId } = req.body;

    if (!prompt || !prompt.trim()) {
      req.flash('error', 'Please enter a prompt.');
      return res.redirect('/');
    }

    const result = await dashboardService.generate({
      prompt: prompt.trim(),
      chartType: chartType || 'auto',
      dataSourceId: dataSourceId ? parseInt(dataSourceId, 10) : null,
      templateId: templateId ? parseInt(templateId, 10) : null,
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

exports.generatePanel = async (req, res) => {
  try {
    const { prompt, chartType, dataSourceId } = req.body;
    if (!prompt || !prompt.trim()) return res.json({ error: 'Prompt is required.' });
    const r = await dashboardService.generate({
      prompt: prompt.trim(),
      chartType: chartType || 'auto',
      dataSourceId: dataSourceId ? parseInt(dataSourceId, 10) : null,
      templateId: null,
    });
    const cfg = r.chartConfig || null;
    const ds = cfg && cfg.data && cfg.data.datasets && cfg.data.datasets[0] ? cfg.data.datasets[0] : null;
    const td = r.tableData || { columns: [], rows: [] };
    res.json({
      title: r.title,
      originalPrompt: prompt.trim(),
      chartType: r.chartType,
      hasData: r.hasData,
      chartConfig: cfg,
      labels: cfg && cfg.data ? (cfg.data.labels || []) : [],
      values: ds ? (ds.data || []) : [],
      bgColors: ds ? (Array.isArray(ds.backgroundColor) ? ds.backgroundColor : [ds.backgroundColor]) : [],
      borderColors: ds ? (Array.isArray(ds.borderColor) ? ds.borderColor : [ds.borderColor]) : [],
      tableData: { columns: td.columns || [], rows: td.rows || [] },
      aiInsight: r.aiInsight || null,
      parsedByAI: r.parsedByAI || false,
    });
  } catch (err) {
    console.error('Panel generate error:', err);
    res.json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { panelsJson, title, promptText } = req.body;
    const dashboard = await db.SavedDashboard.findByPk(req.params.id);
    if (!dashboard) {
      req.flash('error', 'Dashboard not found.');
      return res.redirect('/dashboard/history');
    }
    
    // Parse the panelsJson - it could be a complete config object or just panels array
    let configData;
    try {
      configData = JSON.parse(panelsJson || '{}');
    } catch (e) {
      configData = {};
    }
    
    // If configData is a complete dashboard config (has panels, kpiData, etc.)
    let existingConfig = safeJsonParse(dashboard.dashboardConfigJson) || {};
    
    if (configData.panels !== undefined) {
      // It's a complete config object
      existingConfig = configData;
    } else {
      // It's just panels array, merge with existing
      existingConfig.panels = configData;
    }
    
    dashboard.dashboardConfigJson = JSON.stringify(existingConfig);
    if (title && title.trim()) dashboard.title = title.trim();
    if (promptText !== undefined) dashboard.promptText = promptText;
    await dashboard.save();
    req.flash('success', 'Dashboard updated.');
    res.redirect('/dashboard/history');
  } catch (err) {
    console.error('Dashboard update error:', err);
    req.flash('error', 'Failed to update dashboard.');
    res.redirect('/dashboard/' + req.params.id);
  }
};

exports.destroy = async (req, res) => {
  try {
    const dashboard = await db.SavedDashboard.findByPk(req.params.id);
    if (!dashboard) {
      req.flash('error', 'Dashboard not found.');
      return res.redirect('/dashboard/history');
    }
    await dashboard.destroy();
    req.flash('success', 'Dashboard deleted.');
    res.redirect('/dashboard/history');
  } catch (err) {
    console.error('Dashboard delete error:', err);
    req.flash('error', 'Failed to delete dashboard.');
    res.redirect('/dashboard/history');
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
    const sources = await db.DataSource.findAll({ where: { status: 'active' }, order: [['name', 'ASC']] });

    res.render('dashboard-detail', {
      title: dashboard.title,
      dashboard,
      config,
      sources,
    });
  } catch (err) {
    console.error('Dashboard detail error:', err);
    req.flash('error', 'Failed to load dashboard.');
    res.redirect('/dashboard/history');
  }
};

exports.editInCanvas = async (req, res) => {
  try {
    const dashboard = await db.SavedDashboard.findByPk(req.params.id);

    if (!dashboard) {
      req.flash('error', 'Dashboard not found.');
      return res.redirect('/dashboard/history');
    }

    const config = safeJsonParse(dashboard.dashboardConfigJson) || {};
    const { SAMPLE_PROMPTS, CHART_TYPES } = require('../utils/constants');
    const { take } = require('../utils/helpers');

    const sources = await db.DataSource.findAll({
      where: { status: 'active' },
      order: [['name', 'ASC']],
      attributes: ['id', 'name', 'sourceType', 'analysisJson'],
    });

    const templates = await db.DashboardTemplate.findAll({
      order: [['isBuiltIn', 'DESC'], ['name', 'ASC']],
    });

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

    // Pass the saved dashboard data to home.ejs for pre-population
    res.render('home', {
      title: 'Edit Dashboard - ' + dashboard.title,
      samplePrompts: take(SAMPLE_PROMPTS, 10),
      chartTypes: CHART_TYPES,
      sources,
      templates,
      sourcePromptMap,
      recentDashboards: [],
      recentSources: [],
      recentPrompts: [],
      // Pre-populate canvas with saved dashboard data
      preloadDashboard: {
        id: dashboard.id,
        title: dashboard.title,
        promptText: dashboard.promptText,
        sourceId: dashboard.dataSourceId,
        panels: config.panels || [],
        kpiData: config.kpiData || [],
        executiveSummary: config.executiveSummary || '',
        palette: config.palette || [],
      },
    });
  } catch (err) {
    console.error('Edit in canvas error:', err);
    req.flash('error', 'Failed to load dashboard for editing.');
    res.redirect('/dashboard/history');
  }
};
