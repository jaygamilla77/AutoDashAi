'use strict';

/**
 * Full Dashboard Service
 *
 * Acts as a data analyst + data visualization expert.
 * Given a data source (internal or external), it:
 *   1. Reads the schema, profile stats, relationships, and AI-generated analysis
 *   2. Generates candidate panels
 *   3. Uses AI to rank by business impact and select the best ones for a 1-page dashboard
 *   4. Returns a curated set: KPI strip + 4 charts (max 6) for a single-page executive view
 */

const { safeJsonParse } = require('../utils/helpers');
const builderService    = require('./builderService');
const { buildRawTablePanel } = builderService;
const db                = require('../models');
const aiService         = require('./aiService');

// ─── Helpers ───────────────────────────────────────────────────────────────────

function pickColumns(columns, role, count = 1) {
  return columns.filter((c) => c.role === role).slice(0, count);
}

function firstOf(columns, ...roles) {
  for (const role of roles) {
    const found = columns.find((c) => c.role === role);
    if (found) return found;
  }
  return columns[0] || null;
}

/** Safely build one panel — returns null on error so the rest still render. */
async function safePanel(params) {
  try {
    return await builderService.buildPanel(params);
  } catch (e) {
    console.warn('[fullDashboard] panel skipped:', e.message, params);
    return null;
  }
}

/** Safely build a raw all-columns table panel — returns null on error. */
async function safeRawPanel(params) {
  try {
    return await buildRawTablePanel(params);
  } catch (e) {
    console.warn('[fullDashboard] raw table panel skipped:', e.message, params);
    return null;
  }
}

// ─── Internal DB dashboard plan ────────────────────────────────────────────────

async function planInternalDashboard() {
  const schema = await builderService.getSchema(null);
  const panels = [];

  /*
   * Panel layout for the internal HR/Operations database:
   *
   *  Row 1  — KPI summary cards (cards chart type)
   *    1. Employee Count                     (employees.id  COUNT)
   *    2. Department Count                   (departments.id COUNT)
   *    3. Open Ticket Count                  (tickets.id    COUNT, filter status=open)
   *    4. Avg Productivity Score             (productivity_records.productivityScore AVG)
   *
   *  Row 2  — Bar charts
   *    5. Employees by Department (bar)
   *    6. Tickets by Status       (bar)
   *    7. Tickets by Priority     (bar)
   *
   *  Row 3  — Breakdown / Rankings
   *    8. Top 10 Projects by Budget           (bar)
   *    9. Avg Productivity by Employee (top 15) (bar)
   *   10. Tasks Completed by Project (bar)
   *
   *  Row 4  — Distribution pie charts
   *   11. Ticket category distribution       (pie)
   *   12. Project status distribution        (pie)
   *
   *  Row 5  — Detailed table
   *   13. Employee roster (table)
   *   14. Open tickets detail (table)
   */

  const sid = null; // internal

  // 1 – Employee KPI card
  panels.push(await safePanel({ sourceId: sid, tableKey: 'employees',            dimension: 'fullName',          measure: 'id',                aggregation: 'COUNT', chartType: 'cards', limit: 1,  title: 'Total Employees' }));
  // 2 – Department count card
  panels.push(await safePanel({ sourceId: sid, tableKey: 'departments',           dimension: 'name',              measure: 'id',                aggregation: 'COUNT', chartType: 'cards', limit: 1,  title: 'Total Departments' }));
  // 3 – Open tickets card
  panels.push(await safePanel({ sourceId: sid, tableKey: 'tickets',               dimension: 'status',            measure: 'id',                aggregation: 'COUNT', chartType: 'cards', limit: 5,  title: 'Tickets by Status (KPI)' }));
  // 4 – Avg productivity card
  panels.push(await safePanel({ sourceId: sid, tableKey: 'productivity_records',  dimension: 'workDate',          measure: 'productivityScore', aggregation: 'AVG',   chartType: 'cards', limit: 1,  title: 'Avg Productivity Score' }));

  // 5 – Employees by Department bar
  panels.push(await safePanel({ sourceId: sid, tableKey: 'employees', joinTableKey: 'departments', dimension: 'departments.name', measure: 'employees.id', aggregation: 'COUNT', chartType: 'bar', limit: 20, title: 'Employees by Department' }));
  // 6 – Tickets by Status bar
  panels.push(await safePanel({ sourceId: sid, tableKey: 'tickets',   dimension: 'status',   measure: 'id', aggregation: 'COUNT', chartType: 'bar', limit: 10, title: 'Tickets by Status' }));
  // 7 – Tickets by Priority bar
  panels.push(await safePanel({ sourceId: sid, tableKey: 'tickets',   dimension: 'priority', measure: 'id', aggregation: 'COUNT', chartType: 'bar', limit: 10, title: 'Tickets by Priority' }));

  // 8 – Top 10 Projects by Budget bar
  panels.push(await safePanel({ sourceId: sid, tableKey: 'projects',             dimension: 'name',          measure: 'budget',            aggregation: 'SUM', chartType: 'bar', limit: 10, title: 'Top 10 Projects by Budget' }));
  // 9 – Avg Productivity by Employee (top 15) bar
  panels.push(await safePanel({ sourceId: sid, tableKey: 'productivity_records', joinTableKey: 'employees', dimension: 'employees.fullName', measure: 'productivity_records.productivityScore', aggregation: 'AVG', chartType: 'bar', limit: 15, title: 'Top 15 Employees by Avg Productivity' }));
  // 10 – Tasks Completed by Project
  panels.push(await safePanel({ sourceId: sid, tableKey: 'productivity_records', joinTableKey: 'projects',  dimension: 'projects.name',     measure: 'productivity_records.tasksCompleted',     aggregation: 'SUM', chartType: 'bar', limit: 10, title: 'Tasks Completed by Project' }));

  // 11 – Ticket category pie
  panels.push(await safePanel({ sourceId: sid, tableKey: 'tickets',  dimension: 'category', measure: 'id', aggregation: 'COUNT', chartType: 'pie', limit: 10, title: 'Ticket Distribution by Category' }));
  // 12 – Project status pie
  panels.push(await safePanel({ sourceId: sid, tableKey: 'projects', dimension: 'status',   measure: 'id', aggregation: 'COUNT', chartType: 'pie', limit: 10, title: 'Project Status Distribution' }));

  // 13 – Employees — all columns
  panels.push(await safeRawPanel({ sourceId: sid, tableKey: 'employees',            limit: 200, title: 'Employees — All Columns' }));
  // 14 – Departments — all columns
  panels.push(await safeRawPanel({ sourceId: sid, tableKey: 'departments',          limit: 200, title: 'Departments — All Columns' }));
  // 15 – Projects — all columns
  panels.push(await safeRawPanel({ sourceId: sid, tableKey: 'projects',             limit: 200, title: 'Projects — All Columns' }));
  // 16 – Tickets — all columns
  panels.push(await safeRawPanel({ sourceId: sid, tableKey: 'tickets',              limit: 200, title: 'Tickets — All Columns' }));
  // 17 – Productivity Records — all columns
  panels.push(await safeRawPanel({ sourceId: sid, tableKey: 'productivity_records', limit: 200, title: 'Productivity Records — All Columns' }));

  return panels.filter(Boolean);
}

// ─── External source dashboard plan ───────────────────────────────────────────

/**
 * Builds a dashboard plan from external source schema + analysis.
 * Follows the analyst pattern:
 *   1 panel of KPI cards  per table (distinct count of key columns)
 *   1 bar chart           per table (top dimension by measure)
 *   1 pie chart           for each table with a categorical dimension
 *   1 bar chart           for cross-sheet relationships if they exist
 *   1 detail table        per sheet
 */
async function planExternalDashboard(sourceId) {
  const schema = await builderService.getSchema(parseInt(sourceId, 10));
  const panels = [];

  // Get analysis for suggested prompts / relationships
  const src = await db.DataSource.findByPk(sourceId);
  const analysis = src ? safeJsonParse(src.analysisJson) : null;
  const relationships = analysis ? (analysis.relationships || []) : [];

  // Filter out the __unified__ table if present
  const tables = schema.tables.filter((t) => t.datasetName !== '__unified__');

  // ── Per-table panels ────────────────────────────────────────────────────────
  for (const table of tables) {
    const dims    = pickColumns(table.columns, 'dimension', 4);
    const measures = pickColumns(table.columns, 'measure', 3);

    if (!dims.length || !measures.length) continue;

    const mainDim = dims[0];
    const mainMes = measures[0];
    const tableKey = table.key;

    // KPI cards — all dimensions summarised
    panels.push(await safePanel({
      sourceId, tableKey,
      dimension: mainDim.key, measure: mainMes.key,
      aggregation: mainMes.type === 'integer' || mainMes.type === 'float' ? 'SUM' : 'COUNT',
      chartType: 'cards', limit: 20,
      title: `${table.displayName} — Summary`,
    }));

    // Bar chart — top dimension by measure
    panels.push(await safePanel({
      sourceId, tableKey,
      dimension: mainDim.key, measure: mainMes.key,
      aggregation: mainMes.type === 'integer' || mainMes.type === 'float' ? 'SUM' : 'COUNT',
      chartType: 'bar', limit: 15,
      title: `Top 15 ${table.displayName} by ${mainMes.displayName}`,
    }));

    // Pie chart for second categorical dimension if it exists
    if (dims.length >= 2) {
      const catDim = dims[1];
      panels.push(await safePanel({
        sourceId, tableKey,
        dimension: catDim.key, measure: mainMes.key,
        aggregation: 'COUNT', chartType: 'pie', limit: 10,
        title: `${table.displayName} Distribution by ${catDim.displayName}`,
      }));
    }

    // Line chart for date dimension if available
    const dateDim = table.columns.find((c) => c.type === 'date');
    if (dateDim) {
      panels.push(await safePanel({
        sourceId, tableKey,
        dimension: dateDim.key, measure: mainMes.key,
        aggregation: mainMes.type === 'integer' || mainMes.type === 'float' ? 'SUM' : 'COUNT',
        chartType: 'line', limit: 30,
        title: `${table.displayName} Trend over Time`,
      }));
    }

    // Detail table — all columns
    panels.push(await safeRawPanel({
      sourceId, tableKey,
      limit: 200,
      title: `${table.displayName} — All Columns`,
    }));
  }

  return panels.filter(Boolean);
}

// ─── AI Panel Curation ────────────────────────────────────────────────────────

const PANEL_CURATOR_PROMPT = `You are a senior BI consultant designing a premium executive dashboard — Power BI / Tableau quality.
Given a list of candidate dashboard panels with their data, you must:

1. Select the BEST 4-8 chart panels that provide maximum business insight at a glance
2. Eliminate panels with near-zero variance, very few rows (<3), or duplicated perspectives
3. Assign each selected panel to a dashboard SECTION for structured layout storytelling
4. Generate 4-6 premium KPI cards with trend indicators and business context
5. Detect the likely business DOMAIN from the data (HR, Finance, Operations, Sales, IT, etc.)
6. Optionally detect an anomaly or risk across the data

Sections (use these exact names):
  "Executive Summary"  — KPI cards row (always first)
  "Performance Overview"  — primary comparison/ranking charts (1-3 panels)
  "Trend Analysis"  — time-based or sequential charts (1-2 panels)
  "Distribution & Breakdown"  — pie/funnel/treemap/heatmap (1-2 panels)
  "Operational Detail"  — bar charts for operational metrics (1-2 panels)
  "Risk & Alerts"  — any anomaly, bottleneck, or lagging metric (optional, 0-1 panels)

Return ONLY a valid JSON object with this exact structure:
{
  "selectedIndices": [0, 2, 5, ...],
  "sections": ["Performance Overview", "Trend Analysis", "Performance Overview", ...],
  "kpiData": [
    {
      "label": "Total Employees",
      "value": "248",
      "trend": "+12%",
      "trendDirection": "up",
      "status": "good",
      "subtitle": "vs last month",
      "icon": "bi-people-fill",
      "color": "#3b82f6"
    }
  ],
  "dashboardRole": "HR Dashboard",
  "dashboardSubtitle": "Workforce & Operations Overview",
  "layoutHint": "3+2" ,
  "anomalyAlert": "Ticket backlog increased 34% — may indicate staffing gap",
  "reasoning": "Brief explanation"
}

Field rules:
- selectedIndices: array of panel indices to include (4-8 panels, no cards/table types)
- sections[i] maps to selectedIndices[i] — must be same length
- kpiData: 4-6 items; value formatted (1.2M, 48K, 94.3%, $2.4M); trend like "+12%", "-6%", "Stable", "18 open"
- trendDirection: "up" | "down" | "neutral"
- status: "good" | "warning" | "danger" | "neutral"
- icon: Bootstrap Icons class (bi-people-fill, bi-currency-dollar, bi-graph-up-arrow, bi-ticket-detailed, bi-kanban, bi-clock-history, bi-lightning-charge-fill, bi-shield-check, bi-trophy, bi-exclamation-triangle-fill)
- color: a hex color appropriate to the metric (blue for volume, green for good, red/orange for risk, purple for financial)
- anomalyAlert: null if none detected, or a 1-sentence business concern
- dashboardRole: e.g. "HR Dashboard", "Finance Dashboard", "Operations Dashboard", "Sales Dashboard"
- layoutHint: "3+2", "2+2", "3+1", "2+3"

IMPORTANT: Return ONLY the JSON. No markdown, no extra text.`;

/**
 * Use AI to curate the best panels for a 1-page dashboard.
 * Falls back to heuristic selection if AI is unavailable.
 */
async function curatePanels(allPanels) {
  const validPanels = allPanels.filter(p => p && p.hasData);
  if (validPanels.length <= 4) {
    return {
      panels: validPanels,
      sections: validPanels.map((_, i) => i === 0 ? 'Performance Overview' : 'Operational Detail'),
      kpiData: generateBasicKPIs(validPanels),
      dashboardRole: null,
      dashboardSubtitle: null,
      anomalyAlert: null,
      reasoning: null,
    };
  }

  // Build panel summaries for AI
  const panelSummaries = validPanels.map((p, i) => {
    const dataPreview = (p.labels || []).slice(0, 8).map((l, j) => `${l}: ${(p.values || [])[j]}`).join(', ');
    return `[${i}] "${p.title}" (${p.chartType}) — ${(p.labels || []).length} rows. Top: ${dataPreview}`;
  }).join('\n');

  if (aiService.isAvailable()) {
    try {
      const result = await aiService.chatJSON(
        PANEL_CURATOR_PROMPT,
        `Total candidate panels: ${validPanels.length}\n\n${panelSummaries}`,
        { max_tokens: 1200 }
      );

      if (result && Array.isArray(result.selectedIndices) && result.selectedIndices.length >= 3) {
        const selectedIndices = result.selectedIndices.filter(i => i >= 0 && i < validPanels.length).slice(0, 8);
        const selected = selectedIndices.map(i => validPanels[i]);
        const sections = Array.isArray(result.sections) ? result.sections.slice(0, selectedIndices.length) : selected.map(() => 'Performance Overview');

        return {
          panels: selected,
          sections,
          kpiData: Array.isArray(result.kpiData) && result.kpiData.length ? result.kpiData : generateBasicKPIs(validPanels),
          dashboardRole: result.dashboardRole || null,
          dashboardSubtitle: result.dashboardSubtitle || null,
          anomalyAlert: result.anomalyAlert || null,
          layoutHint: result.layoutHint || '2+2',
          reasoning: result.reasoning || null,
        };
      }
    } catch (err) {
      console.warn('[fullDashboard] AI curation failed, using heuristic:', err.message);
    }
  }

  // Heuristic fallback
  return heuristicCurate(validPanels);
}

/**
 * Heuristic panel selection when AI is unavailable.
 */
function heuristicCurate(panels) {
  const byType = {};
  panels.forEach(p => {
    const t = p.chartType || 'bar';
    if (!byType[t]) byType[t] = [];
    byType[t].push(p);
  });

  const picks = [];
  const sectionMap = [];

  // 2 bars (most data variance = most interesting)
  const bars = (byType.bar || [])
    .map(p => ({ p, variance: calcVariance(p.values || []) }))
    .sort((a, b) => b.variance - a.variance);
  bars.slice(0, 2).forEach(b => { picks.push(b.p); sectionMap.push('Performance Overview'); });

  // 1 pie / doughnut
  const pies = [...(byType.pie || []), ...(byType.doughnut || [])];
  if (pies[0]) { picks.push(pies[0]); sectionMap.push('Distribution & Breakdown'); }

  // 1 line
  if (byType.line && byType.line[0]) { picks.push(byType.line[0]); sectionMap.push('Trend Analysis'); }

  // 1 hbar or stacked
  const hbars = [...(byType.hbar || []), ...(byType.stackedbar || [])];
  if (hbars[0]) { picks.push(hbars[0]); sectionMap.push('Operational Detail'); }

  // Fill to 6 with remaining charts
  const pickedTitles = new Set(picks.map(p => p.title));
  const sections = ['Performance Overview', 'Trend Analysis', 'Operational Detail', 'Distribution & Breakdown'];
  for (const p of panels) {
    if (picks.length >= 7) break;
    if (!pickedTitles.has(p.title) && p.chartType !== 'table' && p.chartType !== 'cards') {
      picks.push(p);
      pickedTitles.add(p.title);
      sectionMap.push(sections[picks.length % sections.length]);
    }
  }

  return {
    panels: picks,
    sections: sectionMap,
    kpiData: generateBasicKPIs(panels),
    dashboardRole: null,
    dashboardSubtitle: null,
    anomalyAlert: null,
    layoutHint: '2+2',
    reasoning: null,
  };
}

function calcVariance(values) {
  const nums = values.map(Number).filter(n => !isNaN(n));
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return nums.reduce((s, v) => s + (v - mean) ** 2, 0) / nums.length;
}

const KPI_ICON_MAP = [
  'bi-people-fill', 'bi-graph-up-arrow', 'bi-pie-chart-fill',
  'bi-collection-fill', 'bi-speedometer2', 'bi-lightning-charge-fill',
];
const KPI_COLOR_MAP = ['#3b82f6', '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

function generateBasicKPIs(panels) {
  const kpis = [];
  panels.filter(p => p.hasData && p.values && p.values.length > 0).slice(0, 6).forEach((p, i) => {
    const total = (p.values || []).reduce((s, v) => s + (Number(v) || 0), 0);
    const formatted = total >= 1000000 ? (total / 1000000).toFixed(1) + 'M'
                    : total >= 1000    ? (total / 1000).toFixed(1) + 'K'
                    : total.toLocaleString();
    const count = (p.labels || []).length;
    kpis.push({
      label: (p.title || 'Metric').replace(/^Top \d+ /, '').replace(/ — All Columns$/, '').substring(0, 32),
      value: formatted,
      trend: count + ' items',
      trendDirection: 'neutral',
      status: 'neutral',
      subtitle: 'total',
      icon: KPI_ICON_MAP[i % KPI_ICON_MAP.length],
      color: KPI_COLOR_MAP[i % KPI_COLOR_MAP.length],
    });
  });
  return kpis;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a complete executive dashboard for a given source.
 * @param {number|null} sourceId — null = internal DB
 */
async function generateFullDashboard(sourceId) {
  const sid = sourceId ? parseInt(sourceId, 10) : null;

  let sourceName = 'Internal Database';
  if (sid) {
    const src = await db.DataSource.findByPk(sid);
    sourceName = src ? src.name : `Source #${sid}`;
  }

  const allPanels = sid
    ? await planExternalDashboard(sid)
    : await planInternalDashboard();

  // Separate table panels from chart panels
  const chartPanels = allPanels.filter(p => p.chartType !== 'table');
  const tablePanels = allPanels.filter(p => p.chartType === 'table');

  // AI-curated selection
  const {
    panels: curatedCharts,
    sections,
    kpiData,
    dashboardRole,
    dashboardSubtitle,
    anomalyAlert,
    layoutHint,
    reasoning,
  } = await curatePanels(chartPanels);

  // Attach section label to each panel
  curatedCharts.forEach((p, i) => { p._section = sections[i] || 'Performance Overview'; });

  // Always append table panels
  const panels = [...curatedCharts, ...tablePanels];

  const title = `${sourceName} — Executive Dashboard`;
  return {
    title,
    panels,
    sections,
    kpiData,
    dashboardRole: dashboardRole || `${sourceName} Dashboard`,
    dashboardSubtitle: dashboardSubtitle || 'AI-Generated Executive Overview',
    anomalyAlert,
    layoutHint,
    reasoning,
    isFullDashboard: true,
  };
}

module.exports = { generateFullDashboard };
