'use strict';

/**
 * Intelligent Dashboard Service — UNIFIED PIPELINE
 * ───────────────────────────────────────────────────────────────────────
 * The single source of truth for automated dashboard generation.
 *
 * All entry points (Wizard, AI Canvas, Template Picker, /dashboard/full)
 * MUST go through generateIntelligentDashboardFromDatasource(). This
 * guarantees every generated dashboard receives the same level of:
 *   • full datasource analysis (tables / measures / dimensions / dates)
 *   • template-aware section ordering & KPI selection
 *   • smart chart selection with empty-data fallback
 *   • dynamic KPI cards with formatted values
 *   • rule-based business insights (concentration / trend / outliers)
 *   • AI-narrative per-panel insights (when AI is available)
 *   • AI-composed executive summary (with rule-based fallback)
 *   • risk detection & domain-specific recommendations
 *   • Power BI-style structuredRequest + dataConfig metadata for the
 *     properties-panel re-binding workflow
 *
 * Output is a flat schema both the canvas and dashboard-multi views
 * consume directly — no per-route adaptation required.
 */

const fullDashboardGeneratorService = require('./fullDashboardGeneratorService');
const aiInsightService              = require('./aiInsightService');
const dashboardTemplateService      = require('./dashboardTemplateService');

const DEFAULT_TEMPLATE_ID  = 'executive-dashboard';
const DEFAULT_COLOR_THEME  = 'corporate';
const AI_PANEL_CONCURRENCY = 3;

// ───────────────────────────────────────────────────────────── helpers ──

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
    if (executing.size >= poolLimit) await Promise.race(executing);
  }
  return Promise.allSettled(ret);
}

function formatKpiValue(v) {
  if (v == null || !isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (abs >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (abs >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2).replace(/\.?0+$/, '');
}

function statusToColor(status) {
  switch ((status || '').toLowerCase()) {
    case 'good':
    case 'success': return '#10B981';
    case 'warning': return '#F59E0B';
    case 'danger':  return '#EF4444';
    case 'info':    return '#0EA5E9';
    default:        return '#6366F1';
  }
}

function pickAnomalyAlert(insights) {
  if (!Array.isArray(insights) || !insights.length) return null;
  const ranked = insights.find(i =>
    i.riskLevel === 'CRITICAL' || i.riskLevel === 'HIGH' || i.level === 'danger'
  );
  if (!ranked) return null;
  // Prefer concise observation; fall back to title.
  return ranked.observation || ranked.title || null;
}

/**
 * Promote panel.data.{labels,values,chartConfig,...} to top-level so that
 * downstream consumers (canvas restore, dashboard-multi.ejs) all see one
 * consistent shape.
 */
function flattenPanel(panel) {
  if (!panel) return panel;
  const data = panel.data || {};
  return Object.assign({}, panel, {
    labels:      data.labels      || panel.labels      || [],
    values:      data.values      || panel.values      || [],
    chartConfig: data.chartConfig || panel.chartConfig || null,
    tableData:   data.tableData   || panel.tableData   || null,
    hasData:     typeof data.hasData === 'boolean' ? data.hasData
                  : (typeof panel.hasData === 'boolean' ? panel.hasData : false),
    kpiValue:    data.kpiValue   != null ? data.kpiValue   : panel.kpiValue,
  });
}

// ─────────────────────────────────────────────────────── main pipeline ──

/**
 * Single unified dashboard generator. Use this from every entry point.
 *
 * @param {Object} opts
 * @param {number|null} opts.sourceId       Internal DB if null/undefined.
 * @param {string|null} opts.sourceName     Display name for header.
 * @param {string|null} opts.templateId     Defaults to executive-dashboard.
 * @param {string|null} opts.colorTheme     Defaults to corporate.
 * @param {string|null} opts.title          Override generated title.
 * @param {string|null} opts.prompt         Optional natural-language goal.
 * @param {boolean}     opts.skipAiNarrative  Pass true to suppress AI calls
 *                                            (used by quick-preview paths).
 * @returns {Promise<UnifiedDashboard>}
 */
async function generateIntelligentDashboardFromDatasource(opts = {}) {
  const sourceId    = opts.sourceId != null ? Number(opts.sourceId) : null;
  const sourceName  = opts.sourceName || null;
  const templateId  = opts.templateId  || DEFAULT_TEMPLATE_ID;
  const rawTheme    = opts.colorTheme  || DEFAULT_COLOR_THEME;
  const overrideTitle = opts.title && String(opts.title).trim();
  const skipAi      = !!opts.skipAiNarrative;

  // ── 1) Verify the requested template exists, else fall back. ──
  let safeTemplateId = templateId;
  try {
    if (!dashboardTemplateService.getTemplate(safeTemplateId)) {
      safeTemplateId = DEFAULT_TEMPLATE_ID;
    }
  } catch { safeTemplateId = DEFAULT_TEMPLATE_ID; }

  // ── 1b) Resolve color theme. Wizard exposes friendly IDs
  //         (modern-corporate, executive-premium, …) that don't exist in
  //         dashboardTemplateService.getColorThemes(). Map them to a real
  //         theme; otherwise verify the ID and fall back to default. ──
  const THEME_ALIASES = {
    'modern-corporate':  'corporate',
    'executive-premium': 'corporate',
    'minimal-clean':     'green',
    'dark-professional': 'blue',
  };
  let colorTheme = THEME_ALIASES[rawTheme] || rawTheme;
  try {
    const themes = dashboardTemplateService.getColorThemes() || [];
    if (!themes.some(t => t.id === colorTheme)) colorTheme = DEFAULT_COLOR_THEME;
  } catch { colorTheme = DEFAULT_COLOR_THEME; }

  // ── 2) Run the rich, template-aware generator (analysis, sections,
  //       hydration, rule-based insights & rule-based exec summary). ──
  const base = await fullDashboardGeneratorService.generateFullDashboardFromDatasource({
    templateId: safeTemplateId,
    colorTheme,
    sourceId,
    sourceName,
    prompt: opts.prompt || null,
  });

  // ── 3) Flatten panel.data.* to top-level for cross-view compatibility. ──
  const panels = (base.panels || []).map(flattenPanel);

  // ── 4) AI narrative insight per chart panel (best-effort, parallel). ──
  if (!skipAi) {
    await asyncPool(AI_PANEL_CONCURRENCY, panels, async (panel) => {
      if (!panel || panel.type === 'kpi')                 return;
      if (!panel.hasData)                                 return;
      if (!Array.isArray(panel.labels) || !panel.labels.length) return;
      if (!Array.isArray(panel.values) || !panel.values.length) return;
      try {
        // Structured contract — preferred for new renderers.
        panel.aiInsightStructured = await aiInsightService.generateStructuredInsight({
          title:     panel.title,
          chartType: panel.chartType,
          labels:    panel.labels,
          values:    panel.values,
          kpis:      panel.kpis,
        });
        // Back-compat string form derived from the structured observation.
        if (panel.aiInsightStructured && panel.aiInsightStructured.observation) {
          const s = panel.aiInsightStructured;
          panel.aiInsight = [s.observation, s.businessImpact, s.recommendation]
            .filter(Boolean).join(' ');
        } else {
          panel.aiInsight = await aiInsightService.generateInsight({
            title: panel.title, chartType: panel.chartType,
            labels: panel.labels, values: panel.values, kpis: panel.kpis,
          });
        }
      } catch (err) {
        // AI offline / quota: silently keep the rule-based payload.
      }
    });
  } else {
    // Even on the fast path, run rule-based stats so the renderer has
    // structured findings without an AI call.
    panels.forEach(panel => {
      if (!panel || panel.type === 'kpi') return;
      if (!Array.isArray(panel.labels) || !panel.labels.length) return;
      try {
        const profile = aiInsightService.stats.profilePanel(panel);
        if (profile) panel.statsProfile = profile;
      } catch (_) { /* noop */ }
    });
  }

  // ── 5) AI executive summary — fall back to rule-based from generator. ──
  let executiveSummary = base.executiveSummary || '';
  if (!skipAi) {
    try {
      const aiSummary = await aiInsightService.generateExecutiveSummary(
        panels.filter(p => p.hasData && p.type !== 'kpi')
      );
      if (aiSummary && aiSummary.trim()) executiveSummary = aiSummary.trim();
    } catch (err) {
      // keep rule-based summary.
    }
  }

  // ── 6) Build canvas-friendly KPI strip (kpiData) from KPI panels. ──
  //       Prefer real hydrated KPI panels; fall back to base.kpis meta.
  const kpiPanels = panels.filter(p => p.type === 'kpi');
  let kpiData;
  if (kpiPanels.length) {
    kpiData = kpiPanels.map(p => ({
      label:          p.title || 'KPI',
      value:          formatKpiValue(p.kpiValue != null ? p.kpiValue : (p.values && p.values[0])),
      trend:          (p.kpis && p.kpis[0] && p.kpis[0].trend) || 'Stable',
      trendDirection: 'neutral',
      status:         (p.kpis && p.kpis[0] && p.kpis[0].status) || 'neutral',
      icon:           p.icon || (p.kpis && p.kpis[0] && p.kpis[0].icon) || 'bi-bar-chart',
      color:          statusToColor((p.kpis && p.kpis[0] && p.kpis[0].status) || 'neutral'),
      subtitle:       p.subtitle || '',
    }));
  } else {
    kpiData = (base.kpis || []).map(k => ({
      label:          k.name || 'KPI',
      value:          formatKpiValue(k.value),
      trend:          k.trend || 'Stable',
      trendDirection: 'neutral',
      status:         k.status || 'neutral',
      icon:           k.icon || 'bi-bar-chart',
      color:          statusToColor(k.status),
      subtitle:       '',
    }));
  }

  // ── 7) Recommendations distilled from insights. ──
  const recommendations = (base.insights || [])
    .filter(i => i.recommendation)
    .map(i => ({
      title:       i.title,
      detail:      i.recommendation,
      observation: i.observation || '',
      riskLevel:   i.riskLevel   || 'MEDIUM',
      confidence:  i.confidence  || 0,
      level:       i.level       || 'warning',
    }));

  // ── 8) Anomaly banner: most-severe insight as a single line. ──
  const anomalyAlert = pickAnomalyAlert(base.insights);

  // ── 8b) Statistical anomaly findings (always available, AI-free). ──
  const topAnomalies = aiInsightService.detectAnomalies(panels, { limit: 5 });

  // ── 9) Final unified output. Canvas/dashboard-multi consume the
  //       legacy keys; future code should consume the canonical keys. ──
  const finalTitle = overrideTitle || base.title;
  const charts     = panels.filter(p => p.type !== 'kpi');

  // LOG: Final dashboard structure before return
  console.log('[IntelligentDashboard] ─── Final Dashboard Output ───');
  console.log('  Title:        ', finalTitle);
  console.log('  Dashboard Type: ', 'executive');
  console.log('  Total panels: ', panels.length);
  console.log('  Charts:       ', charts.length);
  console.log('  KPIs:         ', kpiData.length);
  console.log('  Sections:     ', base.sections ? base.sections.length : 0);
  if (panels.length === 0) {
    console.warn('[IntelligentDashboard] ⚠️  WARNING: Dashboard has ZERO panels!');
    console.warn('[IntelligentDashboard]   Base skipped panels: ', (base.skippedPanels || []).map(s => s.title));
  }

  return {
    // ── Canonical schema (preferred for new code) ──
    dashboardTitle:   finalTitle,
    dashboardType:    'executive',
    executiveSummary,
    sections:         base.sections || [],
    kpis:             kpiData,
    charts,
    insights:         base.insights || [],
    topAnomalies,
    recommendations,
    filters:          [], // reserved — populated by builder UI on save
    layout:           base.layoutHint || '3+2',
    metadata: {
      sourceId:        base.sourceId        != null ? base.sourceId        : sourceId,
      sourceName:      base.sourceName      || sourceName,
      templateId:      base.templateId      || safeTemplateId,
      colorTheme:      base.colorTheme      || colorTheme,
      themeName:       base.themeName       || null,
      colors:          base.colors          || null,
      analysisDetails: base.analysisDetails || null,
      generatedAt:     base.generatedAt     || new Date().toISOString(),
      schemaVersion:   'unified-dashboard-v1',
      panelCount:      panels.length,
      skippedPanels:   base.skippedPanels   || [],
    },

    // ── Legacy / back-compat keys consumed by current views ──
    title:             finalTitle,
    panels,
    kpiData,
    dashboardRole:     base.template || base.dashboardRole || 'Executive Dashboard',
    dashboardSubtitle: base.description || 'AI-Generated Executive Overview',
    anomalyAlert,
    topAnomalies,
    layoutHint:        base.layoutHint || null,
    isFullDashboard:   true,
    sourceId:          base.sourceId  != null ? base.sourceId  : sourceId,
    sourceName:        base.sourceName || sourceName,
    template:          base.template,
    templateId:        base.templateId || safeTemplateId,
    colorTheme:        base.colorTheme || colorTheme,
    colors:            base.colors,
    skippedPanels:     base.skippedPanels || [],
    panelCount:        panels.length,
    reasoning:         base.reasoning || null,
  };
}

module.exports = {
  generateIntelligentDashboardFromDatasource,
  // Re-exported for convenience / testing
  formatKpiValue,
  flattenPanel,
};
