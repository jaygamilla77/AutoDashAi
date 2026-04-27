'use strict';

const builderService       = require('../services/builderService');
const fullDashboardService = require('../services/fullDashboardService');
const aiInsightService     = require('../services/aiInsightService');

async function asyncPool(limit, items, iteratorFn) {
  const poolLimit = Math.max(1, parseInt(limit, 10) || 1);
  const ret = [];
  const executing = new Set();

  for (const item of items) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean).catch(clean);
    if (executing.size >= poolLimit) {
      await Promise.race(executing);
    }
  }
  return Promise.allSettled(ret);
}

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
    const { sourceId, tableKey, joinTableKey, dimension, measure, aggregation, chartType, limit, filters, title, tableColumns } = req.body;

    if (!tableKey) return res.status(400).json({ error: 'tableKey is required.' });

    // Multi-column table mode
    if (chartType === 'table' && Array.isArray(tableColumns) && tableColumns.length > 0) {
      const panel = await builderService.buildMultiColTablePanel({
        sourceId: sourceId ? parseInt(sourceId, 10) : null,
        tableKey,
        joinTableKey: joinTableKey || null,
        tableColumns,
        limit: limit || 100,
        filters: Array.isArray(filters) ? filters : [],
        title: title || '',
      });
      return res.json(panel);
    }

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
    const { panelsJson, kpiDataJson, executiveSummary, paletteJson, sourceId, kpiPositionsJson, executiveMetaJson } = req.body;
    let panels = [];
    try { panels = JSON.parse(panelsJson || '[]'); } catch { /* ignore */ }

    let kpiData = [];
    try { kpiData = JSON.parse(kpiDataJson || '[]'); } catch { /* ignore */ }

    let palette = [];
    try { palette = JSON.parse(paletteJson || '[]'); } catch { /* ignore */ }

    let kpiPositions = [];
    try { kpiPositions = JSON.parse(kpiPositionsJson || '[]'); } catch { /* ignore */ }

    let executiveMeta = null;
    try { executiveMeta = JSON.parse(executiveMetaJson || 'null'); } catch { /* ignore */ }

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
      sourceId: sourceId || '',
      kpiPositions,
      executiveMeta: executiveMeta || null,
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
    const {
      title, panels, kpiData, reasoning, isFullDashboard,
      sections, dashboardRole, dashboardSubtitle, anomalyAlert, layoutHint,
    } = await fullDashboardService.generateFullDashboard(sourceId);

    if (!panels.length) {
      if (isAjax) return res.status(400).json({ error: 'Could not generate any panels — check that the source has profiled data.' });
      req.flash('error', 'Could not generate any panels — check that the source has profiled data.');
      return res.redirect('/');
    }

    // Generate AI insights for each panel and executive summary
    try {
      await asyncPool(3, panels, async (panel) => {
        if (!panel || !panel.hasData || !panel.labels || !panel.values) return;
        panel.aiInsight = await aiInsightService.generateInsight({
          title: panel.title,
          chartType: panel.chartType,
          labels: panel.labels,
          values: panel.values,
          kpis: panel.kpis,
        });
      });
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
      return res.json({
        title, panels, executiveSummary, kpiData, reasoning, isFullDashboard,
        sections, dashboardRole, dashboardSubtitle, anomalyAlert, layoutHint,
      });
    }
    res.render('dashboard-multi', {
      title, panels, executiveSummary, kpiData, isFullDashboard,
      dashboardRole, dashboardSubtitle, anomalyAlert,
    });
  } catch (err) {
    console.error('Full dashboard error:', err);
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ error: 'Full dashboard generation failed: ' + err.message });
    }
    req.flash('error', 'Full dashboard generation failed: ' + err.message);
    res.redirect('/');
  }
};
