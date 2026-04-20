'use strict';

const builderService       = require('../services/builderService');
const fullDashboardService = require('../services/fullDashboardService');
const aiInsightService     = require('../services/aiInsightService');

/** GET /dashboard/schema?sourceId= — returns schema JSON for schema explorer */
exports.schema = async (req, res) => {
  try {
    const sourceId = req.query.sourceId ? parseInt(req.query.sourceId, 10) : null;
    const schema = await builderService.getSchema(sourceId);
    res.json(schema);
  } catch (err) {
    console.error('Schema error:', err);
    res.status(500).json({ error: err.message });
  }
};

/** POST /dashboard/manual-panel — build one panel from explicit config, returns JSON */
exports.manualPanel = async (req, res) => {
  try {
    const { sourceId, tableKey, joinTableKey, dimension, measure, aggregation, chartType, limit, filters, title } = req.body;

    if (!tableKey) return res.status(400).json({ error: 'tableKey is required.' });

    const panel = await builderService.buildPanel({
      sourceId:     sourceId     ? parseInt(sourceId, 10) : null,
      tableKey,
      joinTableKey: joinTableKey || null,
      dimension:    dimension    || null,
      measure:      measure      || null,
      aggregation:  aggregation  || 'COUNT',
      chartType:    chartType    || 'bar',
      limit:        limit        || 20,
      filters:      Array.isArray(filters) ? filters : [],
      title:        title        || '',
    });

    res.json(panel);
  } catch (err) {
    console.error('Manual panel error:', err);
    res.status(400).json({ error: err.message });
  }
};

/** POST /dashboard/manual-multi — render dashboard-multi with pre-built panels */
exports.manualMulti = async (req, res) => {
  try {
    const { panelsJson, kpiDataJson, executiveSummary, paletteJson } = req.body;
    let panels = [];
    try { panels = JSON.parse(panelsJson || '[]'); } catch { /* ignore */ }

    let kpiData = [];
    try { kpiData = JSON.parse(kpiDataJson || '[]'); } catch { /* ignore */ }

    let palette = [];
    try { palette = JSON.parse(paletteJson || '[]'); } catch { /* ignore */ }

    if (!panels.length) {
      req.flash('error', 'No panels to render.');
      return res.redirect('/');
    }

    res.render('dashboard-multi', {
      title: 'Manual Dashboard — ' + panels.length + ' panel' + (panels.length > 1 ? 's' : ''),
      panels,
      kpiData,
      executiveSummary: executiveSummary || '',
      palette,
    });
  } catch (err) {
    console.error('Manual multi error:', err);
    req.flash('error', 'Failed to render dashboard: ' + err.message);
    res.redirect('/');
  }
};

/** POST /dashboard/full — generate a complete corporate dashboard automatically */
exports.fullDashboard = async (req, res) => {
  try {
    const sourceId = req.body.sourceId ? parseInt(req.body.sourceId, 10) : null;
    const isAjax = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))
                   || req.headers['content-type'] === 'application/json';
    const { title, panels, kpiData, reasoning, isFullDashboard } = await fullDashboardService.generateFullDashboard(sourceId);

    if (!panels.length) {
      if (isAjax) return res.status(400).json({ error: 'Could not generate any panels — check that the source has profiled data.' });
      req.flash('error', 'Could not generate any panels — check that the source has profiled data.');
      return res.redirect('/');
    }

    // Generate AI insights for each panel and executive summary
    try {
      await Promise.all(panels.map(async (panel) => {
        if (panel.hasData && panel.labels && panel.values) {
          panel.aiInsight = await aiInsightService.generateInsight({
            title: panel.title,
            chartType: panel.chartType,
            labels: panel.labels,
            values: panel.values,
            kpis: panel.kpis,
          });
        }
      }));
    } catch (err) {
      console.warn('[Full Dashboard] AI insights failed:', err.message);
    }

    let executiveSummary = null;
    try {
      executiveSummary = await aiInsightService.generateExecutiveSummary(panels);
    } catch (err) {
      console.warn('[Full Dashboard] Executive summary failed:', err.message);
    }

    // AJAX requests (from canvas) get JSON; form submissions get rendered view
    if (isAjax) {
      return res.json({ title, panels, executiveSummary, kpiData, reasoning, isFullDashboard });
    }
    res.render('dashboard-multi', { title, panels, executiveSummary, kpiData, isFullDashboard });
  } catch (err) {
    console.error('Full dashboard error:', err);
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ error: 'Full dashboard generation failed: ' + err.message });
    }
    req.flash('error', 'Full dashboard generation failed: ' + err.message);
    res.redirect('/');
  }
};
