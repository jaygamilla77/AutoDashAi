const db = require('../models');
const dashboardService = require('../services/dashboardService');
const queryService = require('../services/queryService');
const chartService = require('../services/chartService');
const aiInsightService = require('../services/aiInsightService');
const { refreshKpiValue } = require('../services/kpiService');
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

exports.save = async (req, res, next) => {
  try {
    const { title, promptText, dashboardConfigJson, dataSourceId } = req.body;

    if (!title || !title.trim()) {
      req.flash('error', 'Dashboard title is required.');
      return res.redirect('/');
    }

    if (req.workspace) {
      const workspaceService = require('../services/workspaceService');
      const currentCount = await db.SavedDashboard.count();
      try {
        workspaceService.enforceLimit(req.workspace, 'dashboards', currentCount);
      } catch (limitErr) { return next(limitErr); }
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

/**
 * POST /dashboard/save-direct — AJAX save that persists the full canvas state
 * and returns { id, redirectUrl } so the frontend can navigate straight to the
 * canvas renderer. Used by the Executive Dashboard "Generate & Save" flow to
 * avoid the legacy dashboard-multi intermediate page that visually downgrades
 * the dashboard.
 *
 * Body: { title, promptText, dashboardConfig (object), dataSourceId }
 */
exports.saveDirect = async (req, res, next) => {
  try {
    const { title, promptText, dashboardConfig, dataSourceId } = req.body || {};

    if (!dashboardConfig || typeof dashboardConfig !== 'object') {
      return res.status(400).json({ error: 'dashboardConfig (object) is required.' });
    }

    if (req.workspace) {
      const workspaceService = require('../services/workspaceService');
      const currentCount = await db.SavedDashboard.count();
      try {
        workspaceService.enforceLimit(req.workspace, 'dashboards', currentCount);
      } catch (limitErr) { return next(limitErr); }
    }

    // Stamp metadata for forward-compatibility on reopen
    const cfg = Object.assign({}, dashboardConfig);
    cfg.dashboardType   = cfg.dashboardType   || (cfg.dashboardRole ? 'executive' : null);
    cfg.renderMode      = cfg.renderMode      || (cfg.dashboardType === 'executive' ? 'executive-layout' : 'canvas');
    cfg.dashboardVersion = cfg.dashboardVersion || 'v2';
    cfg.schemaVersion   = cfg.schemaVersion   || 'executive-dashboard-v1';
    cfg.savedAt         = new Date().toISOString();

    const finalTitle = (title && title.trim()) ||
      cfg.dashboardRole ||
      'Executive Dashboard';

    const saved = await db.SavedDashboard.create({
      title: finalTitle.substring(0, 255),
      promptText: promptText || '',
      dashboardConfigJson: JSON.stringify(cfg),
      dataSourceId: dataSourceId ? parseInt(dataSourceId, 10) : null,
    });

    return res.json({
      id: saved.id,
      title: saved.title,
      redirectUrl: '/dashboard/' + saved.id + '/edit-canvas',
    });
  } catch (err) {
    console.error('Dashboard save-direct error:', err);
    return res.status(500).json({ error: 'Failed to save dashboard: ' + err.message });
  }
};

exports.generatePanel = async (req, res) => {
  const startTime = Date.now();
  try {
    const { prompt, chartType, dataSourceId } = req.body;
    if (!prompt || !prompt.trim()) return res.json({ error: 'Prompt is required.' });
    
    console.log('[generatePanel] Starting for prompt:', prompt.substring(0, 60) + '...');
    
    let r;
    try {
      r = await dashboardService.generate({
        prompt: prompt.trim(),
        chartType: chartType || 'auto',
        dataSourceId: dataSourceId ? parseInt(dataSourceId, 10) : null,
        templateId: null,
      });
    } catch (genErr) {
      console.error('[generatePanel] dashboardService.generate error:', {
        message: genErr.message,
        stack: genErr.stack,
        elapsedMs: Date.now() - startTime,
      });
      // Return error but don't crash
      return res.json({ error: 'Failed to generate dashboard: ' + (genErr.message || 'Unknown error') });
    }
    
    const cfg = r.chartConfig || null;
    const chartEngine = r.chartEngine || 'chartjs';
    const ds = cfg && cfg.data && cfg.data.datasets && cfg.data.datasets[0] ? cfg.data.datasets[0] : null;
    const td = r.tableData || { columns: [], rows: [] };

    // Build a human-readable calculation label from the structuredRequest
    const sr = r.structuredRequest || {};
    const metricStr = sr.metrics && sr.metrics.length ? sr.metrics[0].toUpperCase() : 'COUNT';
    const entityStr = sr.focusArea || '?';
    const dimStr = sr.dimensions && sr.dimensions.length ? sr.dimensions[0] : entityStr;
    const limitStr = sr.limit ? `, TOP ${sr.limit}` : '';
    const sortStr = sr.sort && sr.sort.direction ? ` (${sr.sort.direction === 'desc' ? '↓' : '↑'})` : '';
    const calculationLabel = `AI: ${metricStr}(${entityStr}) by ${dimStr}${sortStr}${limitStr}`;

    console.log('[generatePanel] Success in', Date.now() - startTime, 'ms');
    res.json({
      title: r.title,
      originalPrompt: prompt.trim(),
      calculationLabel,
      structuredRequest: sr,
      dataSourceId: dataSourceId ? parseInt(dataSourceId, 10) : null,
      chartType: r.chartType,
      chartEngine,
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
    console.error('[generatePanel] Outer catch error:', {
      message: err.message,
      stack: err.stack,
      elapsedMs: Date.now() - startTime,
    });
    res.json({ error: err.message || 'An unexpected error occurred' });
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
    // Remove dependent rows first to satisfy SQLite FK constraints.
    if (db.DashboardShare) {
      await db.DashboardShare.destroy({ where: { dashboardId: dashboard.id } });
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

    // Executive dashboards must always be rendered with the canvas renderer
    // to preserve their original premium layout (header, KPI strip, sectioned
    // charts, anomaly alert, executive summary). The legacy dashboard-detail
    // view is a basic flat layout and would visually downgrade them.
    const isExec = config.dashboardType === 'executive'
      || config.renderMode === 'executive-layout'
      || (config.dashboardRole && Array.isArray(config.kpiData) && config.kpiData.length > 0);
    if (isExec) {
      return res.redirect('/dashboard/' + dashboard.id + '/edit-canvas');
    }

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

    // Pass the saved dashboard data to ai-builder.ejs for pre-population
    res.render('ai-builder', {
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
        kpiPositions: config.kpiPositions || [],
        executiveSummary: config.executiveSummary || '',
        palette: config.palette || [],
        dashboardType: config.dashboardType || null,
        dashboardRole: config.dashboardRole || null,
        dashboardSubtitle: config.dashboardSubtitle || null,
        anomalyAlert: config.anomalyAlert || null,
        layoutHint: config.layoutHint || null,
        sections: config.sections || [],
        // ── AI intelligence — first-class dashboard content, persisted on save.
        insights: config.insights || [],
        recommendations: config.recommendations || [],
        schemaVersion: config.schemaVersion || null,
      },
    });
  } catch (err) {
    console.error('Edit in canvas error:', err);
    req.flash('error', 'Failed to load dashboard for editing.');
    res.redirect('/dashboard/history');
  }
};

/**
 * POST /dashboard/recalculate-panel
 * Re-run a panel query with a user-edited structuredRequest (skips AI parsing).
 */
exports.recalculatePanel = async (req, res) => {
  try {
    const { structuredRequest, dataSourceId, sql } = req.body;

    // ── Optional: Safe SQL mode (Advanced tab) ────────────────────────────────
    if (sql && String(sql).trim()) {
      const rawSql = String(sql).trim();
      const upper = rawSql.toUpperCase();
      const forbidden = /\b(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE|CREATE|REPLACE|ATTACH|DETACH|PRAGMA)\b/i;
      if (forbidden.test(rawSql)) {
        return res.json({ error: 'Only safe SELECT queries are allowed. Destructive SQL commands are blocked.' });
      }
      if (!/^\s*(SELECT|WITH)\b/i.test(rawSql)) {
        return res.json({ error: 'Only SELECT queries are allowed.' });
      }
      if (dataSourceId) {
        // For now: SQL mode only for the internal DB (file/API sources use safe in-memory aggregation).
        return res.json({ error: 'Advanced SQL Mode is only available for the Internal Database.' });
      }

      // Execute SQL against internal DB safely.
      const { QueryTypes } = require('sequelize');
      const sqlNoSemi = rawSql.replace(/;\s*$/, '');
      const wrapped = `SELECT * FROM (${sqlNoSemi}) AS q LIMIT 200`;
      const rows = await db.sequelize.query(wrapped, { type: QueryTypes.SELECT });
      const columns = rows && rows.length ? Object.keys(rows[0]) : [];

      // Derive labels/values for charting when possible (2-column result).
      let labels = [];
      let values = [];
      if (columns.length >= 2) {
        const c0 = columns[0];
        const c1 = columns[1];
        labels = rows.map((r) => r[c0]);
        values = rows.map((r) => {
          const v = r[c1];
          const n = typeof v === 'number' ? v : Number(v);
          return Number.isFinite(n) ? n : 0;
        });
      } else if (columns.length === 1) {
        const c0 = columns[0];
        labels = [c0];
        const v = rows[0] ? rows[0][c0] : 0;
        const n = typeof v === 'number' ? v : Number(v);
        values = [Number.isFinite(n) ? n : 0];
      }

      const chartResult = (labels && labels.length)
        ? chartService.buildChartConfig(labels, values, (structuredRequest && structuredRequest.chartPreference) || 'bar', (structuredRequest && structuredRequest.title) || 'SQL Query', null)
        : null;

      const cfg = chartResult ? chartResult.config : null;
      const chartEngine = chartResult ? chartResult.engine : 'chartjs';
      const ds = cfg && cfg.data && cfg.data.datasets && cfg.data.datasets[0] ? cfg.data.datasets[0] : null;

      return res.json({
        title: (structuredRequest && structuredRequest.title) || 'SQL Query',
        originalPrompt: '',
        calculationLabel: 'SQL: custom SELECT query',
        structuredRequest: structuredRequest || null,
        chartType: (structuredRequest && structuredRequest.chartPreference) || 'bar',
        chartEngine,
        hasData: Array.isArray(rows) && rows.length > 0,
        chartConfig: cfg,
        labels,
        values,
        bgColors: ds ? (Array.isArray(ds.backgroundColor) ? ds.backgroundColor : [ds.backgroundColor]) : [],
        borderColors: ds ? (Array.isArray(ds.borderColor) ? ds.borderColor : [ds.borderColor]) : [],
        tableData: { columns, rows },
        aiInsight: null,
        parsedByAI: false,
      });
    }

    if (!structuredRequest || !structuredRequest.focusArea) {
      return res.json({ error: 'structuredRequest with focusArea is required.' });
    }

    const sr = structuredRequest;
    const dataSource = dataSourceId ? await db.DataSource.findByPk(parseInt(dataSourceId, 10)) : null;

    // Run query directly — bypass AI parser
    const queryResult = await queryService.execute(sr, dataSource);

    const chartResult = (queryResult.labels && queryResult.labels.length)
      ? chartService.buildChartConfig(queryResult.labels, queryResult.values, sr.chartPreference || 'bar', sr.title, null)
      : null;

    const cfg = chartResult ? chartResult.config : null;
    const chartEngine = chartResult ? chartResult.engine : 'chartjs';
    const ds = cfg && cfg.data && cfg.data.datasets && cfg.data.datasets[0] ? cfg.data.datasets[0] : null;
    const td = { columns: queryResult.columns || [], rows: queryResult.rows || [] };

    // Rebuild calculation label
    const metricStr = sr.metrics && sr.metrics.length ? sr.metrics[0].toUpperCase() : 'COUNT';
    const entityStr = sr.focusArea || '?';
    const dimStr = sr.dimensions && sr.dimensions.length ? sr.dimensions[0] : entityStr;
    const limitStr = sr.limit ? `, TOP ${sr.limit}` : '';
    const sortStr = sr.sort && sr.sort.direction ? ` (${sr.sort.direction === 'desc' ? '↓' : '↑'})` : '';
    const calculationLabel = `AI: ${metricStr}(${entityStr}) by ${dimStr}${sortStr}${limitStr}`;

    let aiInsight = null;
    try {
      aiInsight = await aiInsightService.generateInsight({
        title: sr.title,
        chartType: sr.chartPreference,
        labels: queryResult.labels,
        values: queryResult.values,
        kpis: [],
      });
    } catch (e) { /* non-fatal */ }

    res.json({
      title: sr.title,
      originalPrompt: sr.originalPrompt || '',
      calculationLabel,
      structuredRequest: sr,
      chartType: sr.chartPreference || 'bar',
      chartEngine,
      hasData: queryResult.rows && queryResult.rows.length > 0,
      chartConfig: cfg,
      labels: queryResult.labels || [],
      values: queryResult.values || [],
      bgColors: ds ? (Array.isArray(ds.backgroundColor) ? ds.backgroundColor : [ds.backgroundColor]) : [],
      borderColors: ds ? (Array.isArray(ds.borderColor) ? ds.borderColor : [ds.borderColor]) : [],
      tableData: td,
      aiInsight,
      parsedByAI: false,
    });
  } catch (err) {
    console.error('Recalculate panel error:', err);
    res.json({ error: err.message });
  }
};

exports.refreshKpi = async (req, res) => {
  try {
    const { kpiKey } = req.body;
    if (!kpiKey) return res.json({ error: 'kpiKey is required.' });
    const result = await refreshKpiValue(kpiKey);
    res.json(result);
  } catch (err) {
    console.error('Refresh KPI error:', err);
    res.json({ error: err.message });
  }
};

/**
 * Save/update dashboard layout (drag-and-drop positions and sizes)
 * POST /dashboard/:id/layout
 */
exports.saveLayout = async (req, res) => {
  try {
    const { id } = req.params;
    const { widgets, isLocked } = req.body;

    if (!id || isNaN(id)) {
      return res.json({ error: 'Invalid dashboard ID.' });
    }

    if (!Array.isArray(widgets)) {
      return res.json({ error: 'widgets array is required.' });
    }

    // Validate widget data
    const validWidgets = widgets.every(
      (w) =>
        w.id &&
        typeof w.x === 'number' &&
        typeof w.y === 'number' &&
        typeof w.w === 'number' &&
        typeof w.h === 'number'
    );

    if (!validWidgets) {
      return res.json({ error: 'Invalid widget data structure.' });
    }

    // Find the dashboard
    const dashboard = await db.SavedDashboard.findByPk(parseInt(id, 10));
    if (!dashboard) {
      return res.json({ error: 'Dashboard not found.' });
    }

    // Parse existing config
    let config = {};
    try {
      config = JSON.parse(dashboard.dashboardConfigJson || '{}');
    } catch (e) {
      /* ignore parse errors */
    }

    // Merge layout config
    config.layoutConfig = {
      widgets: widgets.map((w) => ({
        id: w.id,
        x: w.x,
        y: w.y,
        w: w.w,
        h: w.h,
      })),
      isLocked: isLocked || false,
      savedAt: new Date().toISOString(),
    };

    // Update dashboard
    dashboard.dashboardConfigJson = JSON.stringify(config);
    await dashboard.save();

    console.log(`[Dashboard] Layout saved for dashboard #${id}`);
    res.json({
      success: true,
      message: 'Layout saved successfully.',
      dashboardId: id,
    });
  } catch (err) {
    console.error('[Dashboard] Save layout error:', err);
    res.json({ error: err.message });
  }
};
