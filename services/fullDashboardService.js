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

  // 13 – Employee roster table
  panels.push(await safePanel({ sourceId: sid, tableKey: 'employees', joinTableKey: 'departments', dimension: 'departments.name', measure: 'employees.id', aggregation: 'COUNT', chartType: 'table', limit: 50, title: 'Employee Roster by Department' }));
  // 14 – Open tickets detail table
  panels.push(await safePanel({ sourceId: sid, tableKey: 'tickets',  dimension: 'status', measure: 'id', aggregation: 'COUNT', chartType: 'table', limit: 50, title: 'All Tickets (Detail)' }));

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

    // Detail table (last per sheet)
    panels.push(await safePanel({
      sourceId, tableKey,
      dimension: mainDim.key, measure: mainMes.key,
      aggregation: mainMes.type === 'integer' || mainMes.type === 'float' ? 'SUM' : 'COUNT',
      chartType: 'table', limit: 50,
      title: `${table.displayName} — Detail Table`,
    }));
  }

  return panels.filter(Boolean);
}

// ─── AI Panel Curation ────────────────────────────────────────────────────────

const PANEL_CURATOR_PROMPT = `You are a senior data analyst designing a 1-page executive dashboard.
Given a list of candidate dashboard panels with their data, select the BEST panels that:

1. Provide maximum business insight at a glance
2. Cover diverse aspects (don't repeat similar views)
3. Prioritize: KPI summary first, then comparison charts, trends, distributions
4. Remove panels with very little data variance (all same values) or redundant views
5. Prefer charts over tables for a visual executive dashboard

Return a JSON object:
{
  "selectedIndices": [0, 2, 5, ...],
  "kpiData": [
    { "label": "Total Revenue", "value": "$2.4M", "trend": "+12%", "icon": "bi-currency-dollar" },
    ...
  ],
  "layoutHint": "2x2" or "3+1" or "2+2",
  "reasoning": "Brief explanation of why these panels were selected"
}

Rules:
- Select 4-6 chart panels (NOT cards/tables) for the main grid
- Generate 4-6 KPI cards from the data that summarize the most important metrics
- kpiData values should be formatted nicely (K, M for thousands/millions, % where appropriate)
- For kpiData trend, use arrow direction and % change if inferable, otherwise use descriptive like "Stable" or the count
- icon should be a Bootstrap Icons class (bi-people, bi-currency-dollar, bi-graph-up, bi-ticket-detailed, bi-kanban, bi-clock, bi-lightning, bi-bar-chart, bi-pie-chart, etc.)`;

/**
 * Use AI to curate the best panels for a 1-page dashboard.
 * Falls back to heuristic selection if AI is unavailable.
 */
async function curatePanels(allPanels) {
  const validPanels = allPanels.filter(p => p && p.hasData);
  if (validPanels.length <= 6) return { panels: validPanels, kpiData: null, reasoning: null };

  // Build panel summaries for AI
  const panelSummaries = validPanels.map((p, i) => {
    const dataPreview = (p.labels || []).slice(0, 8).map((l, j) => `${l}: ${(p.values || [])[j]}`).join(', ');
    return `[${i}] "${p.title}" (${p.chartType}) — ${(p.labels || []).length} items. Top data: ${dataPreview}`;
  }).join('\n');

  if (aiService.isAvailable()) {
    try {
      const result = await aiService.chatJSON(PANEL_CURATOR_PROMPT,
        `Total candidate panels: ${validPanels.length}\n\n${panelSummaries}`,
        { max_tokens: 800 }
      );

      if (result && Array.isArray(result.selectedIndices)) {
        const selected = result.selectedIndices
          .filter(i => i >= 0 && i < validPanels.length)
          .slice(0, 6)
          .map(i => validPanels[i]);

        if (selected.length >= 3) {
          return {
            panels: selected,
            kpiData: result.kpiData || null,
            reasoning: result.reasoning || null,
          };
        }
      }
    } catch (err) {
      console.warn('[fullDashboard] AI curation failed, using heuristic:', err.message);
    }
  }

  // Heuristic fallback: pick diverse panel types
  return heuristicCurate(validPanels);
}

/**
 * Heuristic panel selection when AI is unavailable.
 * Picks: 1 cards panel, 2 bar charts, 1 pie, 1 line, 1 table (max 6).
 */
function heuristicCurate(panels) {
  const byType = {};
  panels.forEach(p => {
    const t = p.chartType || 'bar';
    if (!byType[t]) byType[t] = [];
    byType[t].push(p);
  });

  const picks = [];
  // 1 cards
  if (byType.cards) picks.push(byType.cards[0]);
  // 2 bars (most data variance = most interesting)
  const bars = (byType.bar || [])
    .map(p => ({ p, variance: calcVariance(p.values || []) }))
    .sort((a, b) => b.variance - a.variance);
  bars.slice(0, 2).forEach(b => picks.push(b.p));
  // 1 pie
  if (byType.pie) picks.push(byType.pie[0]);
  // 1 line
  if (byType.line) picks.push(byType.line[0]);
  // Fill to 6 with remaining
  const pickedTitles = new Set(picks.map(p => p.title));
  for (const p of panels) {
    if (picks.length >= 6) break;
    if (!pickedTitles.has(p.title) && p.chartType !== 'table') {
      picks.push(p);
      pickedTitles.add(p.title);
    }
  }

  // Generate basic KPI data
  const kpiData = generateBasicKPIs(panels);

  return { panels: picks, kpiData, reasoning: null };
}

function calcVariance(values) {
  const nums = values.map(Number).filter(n => !isNaN(n));
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return nums.reduce((s, v) => s + (v - mean) ** 2, 0) / nums.length;
}

function generateBasicKPIs(panels) {
  const kpis = [];
  const icons = ['bi-bar-chart', 'bi-graph-up', 'bi-pie-chart', 'bi-collection', 'bi-speedometer2', 'bi-lightning'];
  panels.filter(p => p.hasData && p.values && p.values.length > 0).slice(0, 5).forEach((p, i) => {
    const total = (p.values || []).reduce((s, v) => s + (Number(v) || 0), 0);
    const formatted = total >= 1000000 ? (total / 1000000).toFixed(1) + 'M'
                    : total >= 1000 ? (total / 1000).toFixed(1) + 'K'
                    : total.toLocaleString();
    kpis.push({
      label: (p.title || 'Metric').replace(/^Top \d+ /, '').substring(0, 30),
      value: formatted,
      trend: `${(p.labels || []).length} items`,
      icon: icons[i % icons.length],
    });
  });
  return kpis;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a complete corporate dashboard for a given source.
 * AI curates the best panels for a 1-page executive view.
 * @param {number|null} sourceId — null = internal DB
 * @returns {Promise<{ title: string, panels: object[], kpiData: object[]|null, reasoning: string|null, isFullDashboard: boolean }>}
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

  // AI-curated selection for 1-page executive dashboard
  const { panels, kpiData, reasoning } = await curatePanels(allPanels);

  const title = `${sourceName} -- Executive Dashboard`;
  return { title, panels, kpiData, reasoning, isFullDashboard: true };
}

module.exports = { generateFullDashboard };
