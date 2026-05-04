'use strict';

/**
 * Full Dashboard Generator Service
 *
 * Generates complete professional dashboards with 8-15 panels automatically.
 * Behaves like a Senior Data Analyst + BI Consultant:
 *   - Picks business KPIs (not raw row counts) when possible
 *   - Generates business-friendly titles
 *   - Selects intelligent chart types per data shape
 *   - Produces an executive summary + rule-based AI insights
 */

const db = require('../models');
const builderService = require('./builderService');
const aiService = require('./aiService');
const templateService = require('./dashboardTemplateService');
const { safeJsonParse } = require('../utils/helpers');

// ────────────────────────────────────────────────────────────────────────────
// Humanization & business-naming helpers
// ────────────────────────────────────────────────────────────────────────────

const FIELD_RENAMES = {
  id: 'Records',
  fullname: 'Name',
  firstname: 'First Name',
  lastname: 'Last Name',
  empname: 'Employee',
  employeename: 'Employee',
  emailaddress: 'Email',
  weekstartdate: 'Week',
  weekenddate: 'Week',
  startdate: 'Start Date',
  enddate: 'End Date',
  createdat: 'Created',
  updatedat: 'Updated',
  deptid: 'Department',
  deptname: 'Department',
  departmentid: 'Department',
  departmentname: 'Department',
  managerid: 'Manager',
  projectid: 'Project',
  projectname: 'Project',
  ticketid: 'Ticket',
  ticketstatus: 'Ticket Status',
  wbscode: 'WBS Code',
};

function humanizeField(name) {
  if (!name) return '';
  const k = String(name).toLowerCase().replace(/[_\s-]/g, '');
  if (FIELD_RENAMES[k]) return FIELD_RENAMES[k];
  // Insert space before capitals: "totalHours" -> "total Hours"
  let out = String(name).replace(/[_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  // Title-case
  out = out.replace(/\b\w/g, (c) => c.toUpperCase()).trim();
  return out;
}

function humanizeTable(name) {
  if (!name) return '';
  // Singularize basic plurals: employees -> Employee, departments -> Department
  let s = String(name);
  if (/ies$/i.test(s)) s = s.replace(/ies$/i, 'y');
  else if (/sses$/i.test(s)) s = s.replace(/es$/i, '');
  else if (/s$/i.test(s) && !/ss$/i.test(s)) s = s.replace(/s$/i, '');
  return humanizeField(s);
}

function pluralizeTable(name) {
  return humanizeField(String(name || ''));
}

// Build a business label "{Aggregation} of {Measure}" e.g. "Total Hours", "Average Budget"
function businessMeasureLabel(measure, agg) {
  // Reject names we can't humanize cleanly — caller should already have filtered
  // these via isInvalidFieldName, but guard anyway.
  if (isInvalidFieldName(measure)) return null;
  const m = humanizeField(measure);
  const a = String(agg || 'SUM').toUpperCase();

  // If the field name already begins with the same aggregation word, don't
  // duplicate it ("Total Hours" + SUM should stay "Total Hours", not become
  // "Total Total Hours"). Same logic for Avg / Min / Max / Count.
  const lc = m.toLowerCase();
  const startsWith = (...prefixes) => prefixes.some(p => lc.startsWith(p + ' ') || lc === p);

  if (a === 'COUNT') {
    if (startsWith('total', 'count', 'number', 'num', '#')) return m;
    return `Total ${pluralizeTable(measure)}`;
  }
  if (a === 'AVG' || a === 'AVERAGE') {
    if (startsWith('avg', 'average', 'mean')) return m;
    return `Avg ${m}`;
  }
  if (a === 'MIN') {
    if (startsWith('min', 'minimum')) return m;
    return `Min ${m}`;
  }
  if (a === 'MAX') {
    if (startsWith('max', 'maximum', 'peak')) return m;
    return `Max ${m}`;
  }
  if (a === 'SUM') {
    if (startsWith('total', 'sum', 'gross', 'net')) return m;
    return `Total ${m}`;
  }
  return m;
}

// Compose a "{Measure} by {Dimension}" title in business language.
function businessByTitle(measure, dimension, agg) {
  const lhs = businessMeasureLabel(measure, agg);
  const rhs = humanizeField(dimension);
  if (!lhs || !rhs) return null;
  return `${lhs} by ${rhs}`;
}

// Detect column names that should never appear in a chart title because they
// are placeholders, numeric-only headers (e.g. "31", "2024"), single-character
// stubs, weekday/month abbreviations used as column headers in pivoted data,
// or whitespace-only.
const WEEKDAY_NAMES = new Set([
  'sun', 'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat',
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
]);
const MONTH_NAMES = new Set([
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'january', 'february', 'march', 'april', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
]);
function isInvalidFieldName(name) {
  if (name == null) return true;
  const s = String(name).trim();
  if (!s) return true;
  // Pure numeric headers like "31", "2024", "1.5"
  if (/^[\d.\-+]+$/.test(s)) return true;
  // Single-character stubs
  if (s.length <= 1) return true;
  // System columns
  const lc = s.toLowerCase();
  if (['unnamed', 'column', 'col', 'field', 'value', 'na', 'n/a', 'null', 'none', 'undefined'].includes(lc)) return true;
  if (/^unnamed[:_\s]?\d*$/i.test(s)) return true;
  if (/^column[:_\s]?\d+$/i.test(s)) return true;
  if (/^col[:_\s]?\d+$/i.test(s)) return true;
  // Weekday / month abbreviations used as pivoted column headers — rarely
  // make good axis titles ("Hours vs Sun" is meaningless).
  if (WEEKDAY_NAMES.has(lc)) return true;
  if (MONTH_NAMES.has(lc)) return true;
  return false;
}

// Quality: never produce things like "id by fullName" or "Distribution by id"
function isLowQualityField(field) {
  if (isInvalidFieldName(field)) return true;
  const k = String(field).toLowerCase();
  if (k === 'id') return true;
  if (k.endsWith('id') && k.length <= 8 && !['userid'].includes(k)) return true;
  // Filter free-form/PII-ish text that makes terrible groupings
  if (['email', 'emailaddress', 'phone', 'phonenumber', 'address', 'notes',
       'description', 'comments', 'comment'].includes(k)) return true;
  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// Template strategies — make each template visibly different by controlling
// section order, naming style, KPI emphasis, and chart preferences. Source
// profile decides what's *available*; strategy decides how it's *presented*.
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_STRATEGY = {
  // Order in which to assemble sections. Sections that produce no panels are
  // dropped automatically by the pipeline.
  sectionOrder: ['kpi', 'overview', 'trend', 'comparison', 'ranking'],
  // Display names for each section id (override per template).
  sectionNames: {
    kpi:        'Executive Summary',
    overview:   'Performance Overview',
    trend:      'Trend Analysis',
    comparison: 'Comparison & Breakdown',
    ranking:    'Ranking & Performance',
  },
  // KPI emphasis: which kind of KPIs to surface first.
  //   'sum-first'   — prefer SUM(numeric business measure) cards
  //   'count-first' — prefer COUNT(records) cards
  //   'mixed'       — half-and-half
  kpiMode: 'sum-first',
  // Maximum number of KPI cards to emit
  maxKpis: 4,
  // Which measures to favour when scoring (regex against field name)
  measureSignal: /budget|amount|revenue|profit|cost|salary|hours|spend|value|price|count|total/i,
  // Which dimensions to favour
  dimensionSignal: /dept|department|status|category|type|region|priority|stage|role|level/i,
  // Whether to emit specific optional panels
  emitDistribution: true,
  emitMultiMetricTrend: true,
  emitScatter: true,
  emitBottomRanking: true,
};

const TEMPLATE_STRATEGIES = {
  'executive-dashboard': {
    sectionOrder: ['kpi', 'trend', 'ranking', 'comparison', 'overview'],
    sectionNames: {
      kpi:        'Key Performance Indicators',
      trend:      'Performance Trends',
      ranking:    'Top Performers',
      comparison: 'Strategic Breakdown',
      overview:   'Operational Snapshot',
    },
    kpiMode: 'mixed',
    maxKpis: 4,
    emitDistribution: true,
    emitMultiMetricTrend: true,
    emitScatter: false,        // executives prefer cleaner panels
    emitBottomRanking: false,  // only show winners
  },
  'hr-dashboard': {
    sectionOrder: ['kpi', 'overview', 'comparison', 'trend', 'ranking'],
    sectionNames: {
      kpi:        'Workforce Snapshot',
      overview:   'Headcount & Hours Distribution',
      comparison: 'Department / Status Breakdown',
      trend:      'Workforce Trends',
      ranking:    'Top Employees',
    },
    kpiMode: 'count-first',
    maxKpis: 4,
    measureSignal: /hours|salary|headcount|attrition|tenure|count|total/i,
    dimensionSignal: /dept|department|role|status|level|grade|location|manager|employee|wbs/i,
    emitDistribution: true,
    emitMultiMetricTrend: false,
    emitScatter: false,
    emitBottomRanking: false,
  },
  'sales-dashboard': {
    sectionOrder: ['kpi', 'trend', 'overview', 'ranking', 'comparison'],
    sectionNames: {
      kpi:        'Revenue Snapshot',
      trend:      'Sales Trend',
      overview:   'Pipeline Distribution',
      ranking:    'Top Sales Performers',
      comparison: 'Revenue by Segment & Stage',
    },
    kpiMode: 'sum-first',
    maxKpis: 4,
    measureSignal: /revenue|sales|deal|amount|value|price|profit|margin|quantity|units|count/i,
    dimensionSignal: /stage|status|region|territory|product|customer|segment|channel|rep/i,
    emitDistribution: true,
    emitMultiMetricTrend: true,
    emitScatter: false,
    emitBottomRanking: true,
  },
  'finance-dashboard': {
    sectionOrder: ['kpi', 'comparison', 'trend', 'ranking', 'overview'],
    sectionNames: {
      kpi:        'Financial Position',
      comparison: 'Budget vs Actual / Cost Breakdown',
      trend:      'Cash & Spend Trends',
      ranking:    'Top Cost Drivers',
      overview:   'Expense Distribution',
    },
    kpiMode: 'sum-first',
    maxKpis: 4,
    measureSignal: /budget|cost|expense|spend|revenue|profit|cash|invoice|amount|value/i,
    dimensionSignal: /account|category|costcenter|gl|department|type|status|vendor/i,
    emitDistribution: true,
    emitMultiMetricTrend: true,
    emitScatter: false,
    emitBottomRanking: false,
  },
  'operations-dashboard': {
    sectionOrder: ['kpi', 'overview', 'comparison', 'ranking', 'trend'],
    sectionNames: {
      kpi:        'Operations Snapshot',
      overview:   'Status & Process Distribution',
      comparison: 'Workload Breakdown',
      ranking:    'Bottlenecks & Throughput',
      trend:      'Operational Trends',
    },
    kpiMode: 'count-first',
    maxKpis: 4,
    measureSignal: /hours|count|throughput|volume|sla|cycle|duration|backlog/i,
    dimensionSignal: /status|stage|priority|type|category|location|process|step|owner/i,
    emitDistribution: true,
    emitMultiMetricTrend: false,
    emitScatter: false,
    emitBottomRanking: true,
  },
  'customer-service-dashboard': {
    sectionOrder: ['kpi', 'overview', 'trend', 'ranking', 'comparison'],
    sectionNames: {
      kpi:        'Service Snapshot',
      overview:   'Ticket Distribution',
      trend:      'Volume & SLA Trends',
      ranking:    'Top Agents / Categories',
      comparison: 'Priority vs Status Breakdown',
    },
    kpiMode: 'count-first',
    maxKpis: 4,
    measureSignal: /count|hours|sla|response|resolution|csat|nps|satisfaction/i,
    dimensionSignal: /status|priority|category|channel|agent|team|severity/i,
    emitDistribution: true,
    emitMultiMetricTrend: false,
    emitScatter: false,
    emitBottomRanking: false,
  },
  'project-dashboard': {
    sectionOrder: ['kpi', 'overview', 'ranking', 'trend', 'comparison'],
    sectionNames: {
      kpi:        'Project Snapshot',
      overview:   'Effort by Project',
      ranking:    'Top Projects by Effort',
      trend:      'Delivery Trend',
      comparison: 'Status vs Owner Breakdown',
    },
    kpiMode: 'mixed',
    maxKpis: 4,
    measureSignal: /hours|effort|days|budget|cost|count|tasks/i,
    dimensionSignal: /project|wbs|status|owner|phase|milestone|sprint/i,
    emitDistribution: true,
    emitMultiMetricTrend: false,
    emitScatter: false,
    emitBottomRanking: false,
  },
};

function getTemplateStrategy(templateId) {
  const id = String(templateId || '').toLowerCase();
  // Match exact id first, then partial keyword match
  if (TEMPLATE_STRATEGIES[id]) return { ...DEFAULT_STRATEGY, ...TEMPLATE_STRATEGIES[id] };
  for (const key of Object.keys(TEMPLATE_STRATEGIES)) {
    const kw = key.replace('-dashboard', '');
    if (id.includes(kw)) return { ...DEFAULT_STRATEGY, ...TEMPLATE_STRATEGIES[key] };
  }
  return { ...DEFAULT_STRATEGY };
}

// Pick a (dimension, measure) pair that share the same table. Falls back to
// best-quality pair if no co-located match exists.
function pickCoLocatedDimMeasure(analysis, strategy) {
  const strat = strategy || DEFAULT_STRATEGY;
  const dims = (analysis.dimensions || []).filter(d => !isLowQualityField(d.field));
  const measures = (analysis.measures || []).filter(m => !isLowQualityField(m.field));

  // Score dims: prefer common business dims over free-text names
  const dimScore = (d) => {
    const f = d.field.toLowerCase();
    if (strat.dimensionSignal && strat.dimensionSignal.test(f)) return 6;
    if (/dept|department|status|category|type|region|priority|stage|role|level/.test(f)) return 5;
    if (/name|fullname/.test(f)) return 1;
    return 2;
  };
  const measureScore = (m) => {
    const f = m.field.toLowerCase();
    if (strat.measureSignal && strat.measureSignal.test(f)) return 6;
    if (/budget|amount|revenue|profit|cost|salary|hours|spend|value|price/.test(f)) return 5;
    return 2;
  };

  const sortedDims = dims.slice().sort((a, b) => dimScore(b) - dimScore(a));
  const sortedMeasures = measures.slice().sort((a, b) => measureScore(b) - measureScore(a));

  // First pass: same-table pair
  for (const m of sortedMeasures) {
    for (const d of sortedDims) {
      if (d.table === m.table) return { dimension: d, measure: m };
    }
  }
  // Fallback to best-of-each (may be cross-table)
  if (sortedDims[0] && sortedMeasures[0]) {
    return { dimension: sortedDims[0], measure: sortedMeasures[0] };
  }
  return { dimension: null, measure: null };
}

// Pick a (date, measure) pair on the same table for time-series.
function pickCoLocatedDateMeasure(analysis) {
  const dates = analysis.dateFields || [];
  const measures = (analysis.measures || []).filter(m => !isLowQualityField(m.field));
  for (const m of measures) {
    for (const d of dates) {
      if (d.table === m.table) return { date: d, measure: m };
    }
  }
  if (dates[0] && measures[0]) return { date: dates[0], measure: measures[0] };
  return { date: null, measure: null };
}

// ────────────────────────────────────────────────────────────────────────────
// Smart chart-type selection
// ────────────────────────────────────────────────────────────────────────────

// Decide chart type given dimension/measure metadata + cardinality hints.
function pickChartType({ kind, dimensionField, distinctCount, measureField }) {
  // kind: 'overview' | 'trend' | 'breakdown' | 'ranking'
  if (kind === 'trend') return 'line';
  if (kind === 'ranking') return 'hbar';
  if (kind === 'breakdown') {
    // Pie ONLY when the dimension is genuinely categorical and small
    const fld = (dimensionField || '').toLowerCase();
    const looksHighCard = ['name', 'fullname', 'email', 'id', 'code'].some(s => fld.includes(s));
    const small = !distinctCount || distinctCount <= 8;
    if (!looksHighCard && small) return 'pie';
    return 'bar';
  }
  // overview default
  return 'bar';
}

/**
 * Generate full dashboard with multiple panels
 */
async function generateFullDashboardFromDatasource(config) {
  try {
    const { templateId, colorTheme, sourceId, sourceName: providedSourceName, prompt } = config;

    // Load template and theme
    const template = templateService.getTemplate(templateId);
    if (!template) throw new Error(`Template not found: ${templateId}`);

    const themes = templateService.getColorThemes();
    const theme = themes.find(t => t.id === colorTheme);
    if (!theme) throw new Error(`Color theme not found: ${colorTheme}`);

    // Get schema for the SELECTED source (null ⇒ Internal Database)
    const sidNum = sourceId ? parseInt(sourceId, 10) : null;
    const schema = await builderService.getSchema(sidNum);

    // Resolve a real, human-readable source name. Prefer:
    //  1. The name provided by the client (matches the dropdown text exactly)
    //  2. The schema's sourceName (database lookup in builderService)
    //  3. A generic fallback that still distinguishes external vs internal
    const resolvedSourceName = providedSourceName
      || schema.sourceName
      || (sidNum ? `Source #${sidNum}` : 'Internal Database');
    
    // Analyze schema to identify tables, measures, dimensions
    const analysis = analyzeSchemaStructure(schema);
    console.log('[FullDashboardGenerator] Analyzing source:', {
      sourceId: sidNum,
      sourceName: resolvedSourceName,
      tables: analysis.tables,
      measures: analysis.measures.map(m => m.fullName),
      dimensions: analysis.dimensions.map(d => d.fullName),
      dateFields: analysis.dateFields.map(d => d.fullName),
    });

    // Build a quick lookup of "table.field" pairs so we can validate every
    // panel's required fields exist BEFORE we try to query them.
    const fieldIndex = buildFieldIndex(schema);

    // Resolve template-specific strategy (section order, KPI emphasis, etc.).
    const strategy = getTemplateStrategy(templateId || (template && template.id));
    console.log('[FullDashboardGenerator] Strategy:', {
      sectionOrder: strategy.sectionOrder,
      kpiMode: strategy.kpiMode,
    });

    // Track template visuals we could not generate so the UI can show a notice.
    const skippedPanels = [];

    // Generate candidate panels, organised by section id. Sections only get
    // emitted into the final dashboard if they yield ≥1 valid panel.
    const sectionBuilders = {
      kpi:        () => generateKPISection(template, analysis, sourceId, strategy),
      overview:   () => generateOverviewSection(template, analysis, sourceId, strategy),
      trend:      () => generateTrendSection(template, analysis, sourceId, strategy),
      comparison: () => generateComparisonSection(template, analysis, sourceId, strategy),
      ranking:    () => generateRankingSection(template, analysis, sourceId, strategy),
    };

    const sections = [];
    const panels = [];
    const kpis = [];
    const insights = [];

    for (const sectionId of strategy.sectionOrder) {
      const builder = sectionBuilders[sectionId];
      if (!builder) continue;
      const built = builder();
      if (!built) continue;
      // Apply template-specific section name override
      built.id = sectionId;
      if (strategy.sectionNames && strategy.sectionNames[sectionId]) {
        built.name = strategy.sectionNames[sectionId];
      }
      sections.push(built);
      // IMPORTANT: do NOT clone the panel objects here. The hydration step
      // below mutates `p.data` in place; if we cloned, `sections[].panels`
      // would still hold the un-hydrated originals and the client would see
      // panel.data === undefined → "No data returned". We attach `_section`
      // directly to the originals so both arrays share the same references.
      if (Array.isArray(built.panels)) {
        for (const p of built.panels) {
          if (!p) continue;
          p._section = built.name;
          panels.push(p);
        }
      }
      if (Array.isArray(built.kpis)) kpis.push(...built.kpis);
    }

    // Insight section is appended last (currently produces 0 panels — cards
    // live in the top strip).
    const insightSection = generateInsightSection(template, analysis, sourceId);
    if (insightSection) {
      sections.push(insightSection);
      if (Array.isArray(insightSection.insights)) insights.push(...insightSection.insights);
    }

    // De-duplicate candidate panels by their semantic identity. Two panels
    // that hit the same table+dimension+measure+aggregation+chartType are the
    // same visual and only one should survive.
    const seenSignatures = new Set();
    const dedupedPanels = [];
    for (const p of panels) {
      const q = p.query || {};
      const sig = [
        p.type || 'chart',
        p.chartType || '',
        q.table || '',
        q.dimension || '',
        Array.isArray(q.measures) ? q.measures.join(',') : (q.measure || ''),
        (q.aggregation || '').toUpperCase(),
        q.orderBy || '',
        q.x || '',
        q.y || '',
      ].join('|');
      if (seenSignatures.has(sig)) {
        skippedPanels.push({
          id: p.id, title: p.title, section: p._section || null,
          reason: 'Duplicate panel — same table/fields/aggregation already generated.',
          suggestion: null,
        });
        continue;
      }
      seenSignatures.add(sig);
      dedupedPanels.push(p);
    }

    // Hydrate every chart/KPI panel with real data via builderService.buildPanel
    const sidForBuild = sidNum;

    // Pre-validate: drop any planned panel whose table/dimension/measure does
    // not exist in the actual selected source. This prevents wasted queries
    // and guarantees we never render a panel for an unavailable field.
    const validatedPanels = [];
    for (const p of dedupedPanels) {
      if (!p) continue;
      // Reject any panel whose title contains an invalid field placeholder
      // (e.g. "Hours vs 31"). These slip through when CSV headers are numeric.
      if (p.title && /\b\d{1,4}\b\s*$/.test(p.title.trim())) {
        skippedPanels.push({
          id: p.id, title: p.title, section: p._section || null,
          reason: 'Title references a numeric column header that is not a meaningful business field.',
          suggestion: null,
        });
        continue;
      }
      // Insight placeholders have no query — keep them
      if (!p.query || !p.query.table) { validatedPanels.push(p); continue; }
      const reason = validatePanelAgainstSource(p, fieldIndex);
      if (reason) {
        skippedPanels.push({
          id: p.id,
          title: p.title,
          section: p._section || null,
          reason,
          suggestion: 'Add this field to the data source or pick a different template.',
        });
        continue;
      }
      validatedPanels.push(p);
    }

    await Promise.all(validatedPanels.map(async (p) => {
      if (!p || !p.query || !p.query.table) return;
      try {
        const built = await builderService.buildPanel({
          sourceId: sidForBuild,
          tableKey: p.query.table,
          dimension: p.query.dimension || null,
          measure: p.query.measure || null,
          aggregation: p.query.aggregation || (p.type === 'kpi' ? 'COUNT' : 'SUM'),
          chartType: p.chartType || 'bar',
          limit: p.query.limit || (p.chartType === 'hbar' ? 10 : 20),
          title: p.title,
        });
        // Attach data needed by the frontend renderer.
        // buildPanel returns top-level labels/values (even when chartConfig is null for KPI/table).
        const labels = Array.isArray(built.labels) && built.labels.length
          ? built.labels
          : (built.chartConfig && built.chartConfig.data ? (built.chartConfig.data.labels || []) : []);
        const values = Array.isArray(built.values) && built.values.length
          ? built.values
          : (built.chartConfig && built.chartConfig.data && built.chartConfig.data.datasets && built.chartConfig.data.datasets[0]
              ? (built.chartConfig.data.datasets[0].data || [])
              : []);
        p.data = {
          labels,
          values,
          chartConfig: built.chartConfig || null,
          tableData: built.tableData || null,
          hasData: !!built.hasData,
        };
        if (p.type === 'kpi') {
          // Aggregate to a single value for KPI cards
          p.data.kpiValue = values.reduce((a, b) => a + (Number(b) || 0), 0);
          console.log(`[FullDashboardGenerator] KPI "${p.title}": rows=${values.length}, kpiValue=${p.data.kpiValue}, hasData=${p.data.hasData}`);
        }

        // ── Save the panel's data configuration so the right Properties → Data
        // tab can populate every dropdown from the actual source/table/fields.
        const _agg = (p.query.aggregation || (p.type === 'kpi' ? 'COUNT' : 'SUM')).toLowerCase();
        const _aggLabel = _agg.charAt(0).toUpperCase() + _agg.slice(1);
        const _metric = p.query.measure || null;
        const _dim = p.query.dimension || null;
        const _t = p.query.table || '';
        const _qm = _metric ? (_t ? _t + '.' + _metric : _metric) : '*';
        const _qd = _dim ? (_t ? _t + '.' + _dim : _dim) : '';
        let _calcLabel = _aggLabel + '(' + _qm + ')';
        if (_qd) _calcLabel += ' grouped by ' + _qd;
        p.structuredRequest = p.structuredRequest || {
          focusArea: _t || null,
          dimensions: _dim ? [_dim] : [],
          metrics: _metric ? [_metric] : [],
          aggregation: _agg,
          chartPreference: p.chartType || null,
          limit: p.query.limit || null,
          filters: [],
          sort: p.query.sortBy ? { field: p.query.sortBy, direction: p.query.sortDirection || 'desc' } : null,
        };
        p.dataSourceId = sidNum != null ? sidNum : null;
        p.dataConfig = {
          sourceId: p.dataSourceId,
          sourceName: resolvedSourceName,
          table: _t,
          groupByField: _dim,
          valueField: _metric,
          xField: _dim,
          yField: _metric,
          metricField: _metric || (_agg === 'count' ? 'id' : null),
          aggregation: _agg,
          calculationLabel: _calcLabel,
          filters: [],
          sortBy: p.query.sortBy || null,
          sortDirection: p.query.sortDirection || (p.query.sortBy ? 'desc' : null),
          topN: p.query.limit || null,
          resultPreview: labels.slice(0, 10).map((l, i) => ({
            [_dim || 'group']: l != null ? l : '(null)',
            [_agg + '_' + (_metric || 'value')]: values[i] != null ? values[i] : null,
          })),
          currentValue: p.type === 'kpi' ? p.data.kpiValue
                      : (values.length === 1 ? values[0] : null),
          lastCalculatedAt: new Date().toISOString(),
        };
      } catch (err) {
        console.warn(`[FullDashboardGenerator] Panel "${p.title}" build failed: ${err.message}`);
        p.data = { labels: [], values: [], chartConfig: null, hasData: false, error: err.message };
      }
    }));

    // Drop any panel that ended up with no usable data. We require:
    //   • at least one row of data
    //   • at least one non-zero, non-null value (otherwise the chart is blank)
    //   • for KPIs: a finite, non-zero kpiValue
    //   • for line/area trends: at least 2 data points
    //   • for scatter: at least 5 data points
    const hydratedPanels = [];
    for (const p of validatedPanels) {
      if (!p) continue;
      if (p.type === 'insights') { hydratedPanels.push(p); continue; }

      const data = p.data || {};
      const values = Array.isArray(data.values) ? data.values : [];
      const numericValues = values.map(v => Number(v)).filter(v => Number.isFinite(v));
      const hasAnyNonZero = numericValues.some(v => v !== 0);
      const reasonMissing = (() => {
        if (data.error) return `Query failed: ${data.error}`;
        if (!data.hasData && values.length === 0) return 'Query returned no data for the selected source.';
        if (numericValues.length === 0) return 'Query returned only null/empty values.';
        if (!hasAnyNonZero) return 'All returned values are zero — chart would be blank.';

        if (p.type === 'kpi') {
          const kv = Number(data.kpiValue);
          if (!Number.isFinite(kv) || kv === 0) return 'KPI value is zero or unavailable.';
        }
        if (p.chartType === 'line' || p.chartType === 'area' || p.chartType === 'stackedarea') {
          if (numericValues.length < 2) return 'Trend chart needs at least 2 data points.';
        }
        if (p.chartType === 'scatter') {
          if (numericValues.length < 5) return 'Scatter chart needs at least 5 data points.';
        }
        if (p.chartType === 'pie') {
          // Pie with only 1 slice or >12 slices is meaningless / unreadable
          const distinctSlices = new Set(values.map(v => v == null ? '' : String(v))).size;
          if (numericValues.length < 2) return 'Pie chart needs at least 2 categories.';
          if (numericValues.length > 12) return 'Pie chart has too many slices to be readable.';
          // distinctSlices is informational only
          void distinctSlices;
        }
        return null;
      })();

      if (reasonMissing) {
        skippedPanels.push({
          id: p.id,
          title: p.title,
          section: p._section || null,
          reason: reasonMissing,
          suggestion: 'The required field exists but the source has no usable rows for this visual.',
        });
        continue;
      }
      hydratedPanels.push(p);
    }

    // Replace section.panels references with the surviving panels and drop
    // any section that ended up empty.
    const survivorIds = new Set(hydratedPanels.map(p => p.id));
    const finalSections = sections
      .map(s => ({ ...s, panels: (s.panels || []).filter(p => p && survivorIds.has(p.id)) }))
      .filter(s => s.panels.length > 0);

    // Sync hydrated KPI values + status back onto the kpis[] meta-array so the
    // frontend can render compact cards with status dots without a second pass.
    hydratedPanels.forEach((p) => {
      if (!p || p.type !== 'kpi') return;
      const meta = kpis.find(k => k.name === p.title);
      if (!meta) return;
      const v = p.data && Number.isFinite(Number(p.data.kpiValue)) ? Number(p.data.kpiValue) : 0;
      meta.value = v;
      meta.status = computeKpiStatus(v, p.thresholds);
      p.statusLevel = meta.status;
    });

    // Filter the kpis[] meta-array to only those that survived hydration.
    const survivingKpiNames = new Set(hydratedPanels.filter(p => p.type === 'kpi').map(p => p.title));
    const finalKpis = kpis.filter(k => survivingKpiNames.has(k.name));

    // Debug log — full picture of what we generated, what we skipped, and why.
    console.log('[FullDashboardGenerator] ─── Generation Summary ───');
    console.log('  Selected source:   ', resolvedSourceName, '(id=' + (sidNum || 'internal') + ')');
    console.log('  Available tables:  ', analysis.tables);
    console.log('  Generated panels:  ', hydratedPanels.map(p => p.title));
    console.log('  Skipped panels:    ', skippedPanels.map(s => `${s.title} — ${s.reason}`));
    console.log('  Final sections:    ', finalSections.map(s => `${s.name} (${s.panels.length})`));
    
    // CRITICAL: Log if NO panels were generated (indicates empty dashboard)
    if (hydratedPanels.length === 0) {
      console.error('[FullDashboardGenerator] ⚠️  WARNING: NO PANELS GENERATED! Dashboard will be empty.');
      console.error('[FullDashboardGenerator]   - Total candidates created: ', dedupedPanels.length);
      console.error('[FullDashboardGenerator]   - Panels after dedup:       ', validatedPanels.length);
      console.error('[FullDashboardGenerator]   - Panels after validation:  ', validatedPanels.length);
      console.error('[FullDashboardGenerator]   - Panels after hydration:   ', hydratedPanels.length);
      if (skippedPanels.length > 0) {
        console.error('[FullDashboardGenerator]   Reasons for skipping:');
        skippedPanels.forEach(s => console.error(`     • ${s.title}: ${s.reason}`));
      }
      console.error('[FullDashboardGenerator]   Available analysis data: ', {
        tables: analysis.tables,
        measures: analysis.measures.length,
        dimensions: analysis.dimensions.length,
        dateFields: analysis.dateFields.length,
      });
    }

    return {
      success: true,
      title: `${template.name} — Auto-Generated`,
      description: template.description,
      template: template.name,
      templateId,
      colorTheme: theme.id,
      themeName: theme.name,
      colors: theme.colors,
      sections: finalSections,
      panels: hydratedPanels,
      kpis: finalKpis,
      insights: computeBusinessInsights({ template, analysis, panels: hydratedPanels, kpis: finalKpis }),
      executiveSummary: composeExecutiveSummary({ template, analysis, panels: hydratedPanels, kpis: finalKpis }),
      panelCount: hydratedPanels.length,
      skippedPanels,
      sourceId: sidNum,
      sourceName: resolvedSourceName,
      analysisDetails: analysis,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[FullDashboardGenerator] Error:', err.message);
    throw err;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Source-aware validation helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build a fast lookup of available { table → Set<columnKey> } pairs from the
 * schema returned by builderService.getSchema(). Used to validate that every
 * planned panel's table/dimension/measure actually exists in the selected
 * data source BEFORE we attempt to query it.
 */
function buildFieldIndex(schema) {
  const index = new Map();
  if (!schema || !Array.isArray(schema.tables)) return index;
  for (const t of schema.tables) {
    const tableKey = t.key || t.displayName || t.name;
    if (!tableKey) continue;
    const cols = new Set();
    (t.columns || []).forEach((c) => {
      const k = c.key || c.dbCol || c.name;
      if (k) cols.add(k);
    });
    index.set(tableKey, cols);
  }
  return index;
}

/**
 * Returns null if the panel can be generated, or a human-readable reason why
 * it cannot. We deliberately accept COUNT-on-id KPIs even when the source has
 * no literal "id" column — builderService falls back gracefully.
 */
function validatePanelAgainstSource(panel, fieldIndex) {
  const q = panel.query || {};
  const cols = fieldIndex.get(q.table);
  if (!cols) {
    return `Table "${q.table}" is not available in the selected source.`;
  }
  // Dimension must exist (when present)
  if (q.dimension && !cols.has(q.dimension)) {
    return `Field "${q.dimension}" is not available in table "${q.table}".`;
  }
  // Secondary grouping (e.g. stacked bar) must exist
  if (q.groupBy && !cols.has(q.groupBy)) {
    return `Field "${q.groupBy}" is not available in table "${q.table}".`;
  }
  // Measure must exist UNLESS this is a COUNT (which can fall back to row count)
  const agg = String(q.aggregation || '').toUpperCase();
  if (q.measure && agg !== 'COUNT' && !cols.has(q.measure)) {
    return `Field "${q.measure}" is not available in table "${q.table}".`;
  }
  // Multi-measure trend panels (stacked area)
  if (Array.isArray(q.measures) && q.measures.length) {
    const missing = q.measures.filter(m => !cols.has(m));
    if (missing.length) {
      return `Fields "${missing.join(', ')}" are not available in table "${q.table}".`;
    }
  }
  // Scatter (x/y) panels
  if (q.x && !cols.has(q.x)) return `Field "${q.x}" is not available in table "${q.table}".`;
  if (q.y && !cols.has(q.y)) return `Field "${q.y}" is not available in table "${q.table}".`;
  return null;
}

/**
 * Analyze schema structure to identify tables, measures, dimensions
 */
function analyzeSchemaStructure(schema) {
  const analysis = {
    tables: [],
    measures: [],
    dimensions: [],
    dateFields: [],
    numericFields: [],
    textFields: [],
  };

  // Handle new schema structure with tables array
  if (schema && schema.tables && Array.isArray(schema.tables)) {
    for (const table of schema.tables) {
      const tableName = table.key || table.displayName || table.name;
      if (!tableName) continue;
      
      analysis.tables.push(tableName);

      if (table.columns && Array.isArray(table.columns)) {
        for (const col of table.columns) {
          const colName = col.key || col.name;
          // Skip columns whose names are placeholders, numeric-only, single-char,
          // weekday/month abbreviations, etc. These never make good axes/titles.
          if (isInvalidFieldName(colName)) continue;
          const displayName = col.displayName;
          const colType = col.type || 'string';
          const colRole = col.role || 'dimension'; // 'measure' or 'dimension'
          const fullName = `${tableName}.${colName}`;

          // Classify based on type and role
          if (colType.toLowerCase().includes('date') || colType.toLowerCase().includes('time')) {
            analysis.dateFields.push({ table: tableName, field: colName, fullName, displayName });
          } else if (
            colRole === 'measure' ||
            colType.toLowerCase() === 'number' ||
            ['int', 'decimal', 'float', 'numeric', 'double', 'bigint'].some(t => colType.toLowerCase().includes(t))
          ) {
            analysis.numericFields.push({ table: tableName, field: colName, fullName, displayName });
            
            // Mark as measure based on role or field name patterns
            if (colRole === 'measure' || 
                colName.toLowerCase().includes('amount') || colName.toLowerCase().includes('count') || 
                colName.toLowerCase().includes('total') || colName.toLowerCase().includes('value') ||
                colName.toLowerCase().includes('salary') || colName.toLowerCase().includes('hours') ||
                colName.toLowerCase().includes('revenue') || colName.toLowerCase().includes('profit') ||
                colName.toLowerCase().includes('budget') || colName.toLowerCase().includes('cost') ||
                colName.toLowerCase().includes('price') || colName.toLowerCase().includes('quantity') ||
                colName.toLowerCase().includes('spend')) {
              analysis.measures.push({ table: tableName, field: colName, fullName, displayName, type: 'measure' });
            } else {
              // Numeric without business-name signal — still allow as a measure
              // so we can build something sensible (sum/avg). The picker will
              // score the better-named ones higher.
              analysis.measures.push({ table: tableName, field: colName, fullName, displayName, type: 'measure' });
            }
          } else {
            analysis.textFields.push({ table: tableName, field: colName, fullName, displayName });
            
            // Mark as dimension based on role or field name patterns
            if (colRole === 'dimension' || 
                colName.toLowerCase().includes('name') || colName.toLowerCase().includes('type') || 
                colName.toLowerCase().includes('category') || colName.toLowerCase().includes('department') ||
                colName.toLowerCase().includes('status') || colName.toLowerCase().includes('level')) {
              analysis.dimensions.push({ table: tableName, field: colName, fullName, displayName, type: 'dimension' });
            }
          }
        }
      }
    }
  }

  // Fallback: if no measures detected, use numeric fields
  if (analysis.measures.length === 0 && analysis.numericFields.length > 0) {
    analysis.measures = analysis.numericFields.slice(0, 5).map(f => ({ ...f, type: 'measure' }));
  }

  // Fallback: if no dimensions, use text fields
  if (analysis.dimensions.length === 0 && analysis.textFields.length > 0) {
    analysis.dimensions = analysis.textFields.slice(0, 5).map(f => ({ ...f, type: 'dimension' }));
  }

  return analysis;
}

/**
 * Generate KPI section (Top row with key metrics).
 * Prioritizes meaningful business measures (sumable amounts, hours, budgets,
 * salary, etc.) over raw row counts. Falls back to per-table headcount only
 * when nothing better is available.
 */
function generateKPISection(template, analysis, sourceId, strategy) {
  const strat = strategy || DEFAULT_STRATEGY;
  const panels = [];
  const kpis = [];

  // Score measures using strategy's measureSignal regex (template-aware) so
  // each template surfaces its own preferred KPIs first.
  const scoredMeasures = analysis.measures
    .filter(m => !isLowQualityField(m.field))
    .map(m => {
      const f = m.field.toLowerCase();
      let score = 0;
      if (strat.measureSignal && strat.measureSignal.test(f)) score += 8;
      if (/budget|amount|revenue|profit|cost|salary|hours|spend|value|price|count|total/.test(f)) score += 4;
      // Prefer measures from "fact" tables (records, transactions)
      if (/record|trans|hour|invoice|ticket|order|sale|payment/i.test(m.table)) score += 3;
      return { ...m, _score: score };
    })
    .sort((a, b) => b._score - a._score);

  // Determine how many sumable vs count KPIs to emit based on strategy
  const maxKpis = strat.maxKpis || 4;
  let sumableSlots, countSlots;
  if (strat.kpiMode === 'count-first') {
    sumableSlots = Math.min(1, scoredMeasures.length);
    countSlots = maxKpis - sumableSlots;
  } else if (strat.kpiMode === 'mixed') {
    sumableSlots = Math.min(2, scoredMeasures.length);
    countSlots = maxKpis - sumableSlots;
  } else {
    // sum-first (default)
    sumableSlots = Math.min(2, scoredMeasures.length);
    countSlots = maxKpis - sumableSlots;
  }

  // Track unique titles to prevent duplicates ("Total Hours" twice etc.)
  const usedTitles = new Set();
  const usedTables = new Set();

  // Sumable KPIs
  const chosenSumable = scoredMeasures.slice(0, sumableSlots);
  chosenSumable.forEach((m, i) => {
    const title = businessMeasureLabel(m.field, 'SUM');
    if (!title || usedTitles.has(title.toLowerCase())) return;
    usedTitles.add(title.toLowerCase());
    usedTables.add(m.table);
    panels.push({
      id: `kpi-sum-${i}`,
      title,
      type: 'kpi',
      chartType: 'cards',
      query: { table: m.table, measure: m.field, aggregation: 'SUM' },
      thresholds: defaultThresholdsForMeasure(m.field),
      layout: { width: 3, height: 2, order: i },
    });
    kpis.push({ name: title, icon: getKPIIcon(m.field), trend: 'up', value: null });
  });

  // Optional: average KPIs (only for mixed mode if we have room and a clear measure)
  if (strat.kpiMode === 'mixed' && scoredMeasures.length && countSlots > 1) {
    const top = scoredMeasures[0];
    const avgTitle = businessMeasureLabel(top.field, 'AVG');
    if (avgTitle && !usedTitles.has(avgTitle.toLowerCase())) {
      usedTitles.add(avgTitle.toLowerCase());
      panels.push({
        id: `kpi-avg-${panels.length}`,
        title: avgTitle,
        type: 'kpi',
        chartType: 'cards',
        query: { table: top.table, measure: top.field, aggregation: 'AVG' },
        thresholds: null,
        layout: { width: 3, height: 2, order: panels.length },
      });
      kpis.push({ name: avgTitle, icon: getKPIIcon(top.field), trend: 'up', value: null });
      countSlots--;
    }
  }

  // Headcount/record-count KPIs to fill remaining slots — pick tables we
  // haven't already used so each KPI represents a distinct business object.
  // Skip tables whose names look invalid (numeric, single-char, etc).
  const candidateTables = (analysis.tables || []).filter(t => !isInvalidFieldName(t));
  let placed = panels.length;
  for (const t of candidateTables) {
    if (placed >= maxKpis) break;
    if (usedTables.has(t)) continue;
    const title = `Total ${pluralizeTable(t)}`;
    if (usedTitles.has(title.toLowerCase())) continue;
    usedTitles.add(title.toLowerCase());
    usedTables.add(t);
    panels.push({
      id: `kpi-count-${placed}`,
      title,
      type: 'kpi',
      chartType: 'cards',
      query: { table: t, measure: 'id', aggregation: 'COUNT' },
      layout: { width: 3, height: 2, order: placed },
    });
    kpis.push({ name: title, icon: getKPIIcon(t), trend: 'up', value: null });
    placed++;
  }

  return { name: (strat.sectionNames && strat.sectionNames.kpi) || 'Executive Summary', type: 'kpi-section', panels, kpis };
}

// Default green/yellow/red thresholds based on measure name semantics.
function defaultThresholdsForMeasure(field) {
  const f = (field || '').toLowerCase();
  if (f.includes('cost') || f.includes('expense')) {
    // Lower is better — but we don't know baseline; leave undefined (no badge).
    return null;
  }
  // For positive measures: any positive value = healthy by default.
  return { kind: 'positive-better' };
}

/**
 * Generate Overview section with key overview charts (business titles, smart chart picks).
 */
function generateOverviewSection(template, analysis, sourceId, strategy) {
  const strat = strategy || DEFAULT_STRATEGY;
  const panels = [];

  const { dimension: dim, measure } = pickCoLocatedDimMeasure(analysis, strat);
  if (!dim || !measure) return { name: strat.sectionNames.overview, type: 'chart-section', panels: [] };

  const barTitle = businessByTitle(measure.field, dim.field, 'SUM');
  if (barTitle) {
    panels.push({
      id: 'overview-bar',
      title: barTitle,
      type: 'chart',
      chartType: pickChartType({ kind: 'overview', dimensionField: dim.field }),
      query: { table: dim.table, dimension: dim.field, measure: measure.field, aggregation: 'SUM', limit: 10 },
      layout: { width: 6, height: 3, order: 0 },
    });
  }

  if (strat.emitDistribution !== false) {
    const mLabel = humanizeField(measure.field);
    const dLabel = humanizeField(dim.field);
    if (mLabel && dLabel) {
      panels.push({
        id: 'overview-distribution',
        title: `${mLabel} Distribution by ${dLabel}`,
        type: 'chart',
        chartType: pickChartType({ kind: 'breakdown', dimensionField: dim.field }),
        query: { table: dim.table, dimension: dim.field, measure: measure.field, aggregation: 'SUM', limit: 8 },
        layout: { width: 6, height: 3, order: 1 },
      });
    }
  }

  return { name: strat.sectionNames.overview, type: 'chart-section', panels };
}

/**
 * Generate Trend section.
 */
function generateTrendSection(template, analysis, sourceId, strategy) {
  const strat = strategy || DEFAULT_STRATEGY;
  const panels = [];

  const { date: dateField, measure } = pickCoLocatedDateMeasure(analysis);

  if (dateField && measure && !isInvalidFieldName(measure.field) && !isInvalidFieldName(dateField.field)) {
    const mLabel = humanizeField(measure.field);
    if (mLabel) {
      panels.push({
        id: 'trend-line',
        title: `${mLabel} Trend Over Time`,
        type: 'chart',
        chartType: 'line',
        query: { table: measure.table, dimension: dateField.field, measure: measure.field, aggregation: 'SUM', sortBy: 'date' },
        layout: { width: 12, height: 3, order: 0 },
      });
    }
  }

  // Multi-metric stacked area — only if the strategy enables it AND we have
  // ≥2 GOOD measures (passing isLowQualityField + matching the strategy
  // signal) co-located with the date field. We use named measures in the
  // title so it never reads as the generic "Multi-Metric Trend".
  if (strat.emitMultiMetricTrend && dateField) {
    const goodMeasures = (analysis.measures || [])
      .filter(m => m.table === dateField.table && !isLowQualityField(m.field))
      .filter(m => !strat.measureSignal || strat.measureSignal.test(m.field.toLowerCase()))
      .slice(0, 3);
    if (goodMeasures.length >= 2) {
      const niceNames = goodMeasures.map(m => humanizeField(m.field)).filter(Boolean);
      panels.push({
        id: 'trend-area',
        title: `${niceNames.slice(0, 2).join(' & ')} Trend`,
        type: 'chart',
        chartType: 'stackedarea',
        query: {
          table: dateField.table,
          dimension: dateField.field,
          measures: goodMeasures.map(m => m.field),
          measure: goodMeasures[0].field,
          aggregation: 'SUM',
        },
        layout: { width: 12, height: 3, order: 1 },
      });
    }
  }

  return { name: strat.sectionNames.trend, type: 'chart-section', panels };
}

/**
 * Generate Comparison section.
 */
function generateComparisonSection(template, analysis, sourceId, strategy) {
  const strat = strategy || DEFAULT_STRATEGY;
  const panels = [];

  const { dimension: primaryDim, measure } = pickCoLocatedDimMeasure(analysis, strat);

  // Find a SECOND dimension on the SAME table as the primary dim+measure
  let secondaryDim = null;
  if (primaryDim && measure) {
    const sameTableDims = (analysis.dimensions || []).filter(d =>
      d.table === primaryDim.table &&
      d.field !== primaryDim.field &&
      !isLowQualityField(d.field)
    );
    secondaryDim = sameTableDims[0] || null;
  }

  if (primaryDim && secondaryDim && measure) {
    const mLabel = humanizeField(measure.field);
    const d1 = humanizeField(primaryDim.field);
    const d2 = humanizeField(secondaryDim.field);
    if (mLabel && d1 && d2) {
      panels.push({
        id: 'comparison-grouped',
        title: `${mLabel} by ${d1} and ${d2}`,
        type: 'chart',
        chartType: 'stackedbar',
        query: {
          table: primaryDim.table,
          dimension: primaryDim.field,
          groupBy: secondaryDim.field,
          measure: measure.field,
          aggregation: 'SUM',
          limit: 10,
        },
        layout: { width: 6, height: 3, order: 0 },
      });
    }
  }

  // Scatter — only if the strategy enables it AND two real, business-named
  // numerics live on the SAME table. Strict naming filter prevents weird
  // titles like "Hours vs Sun".
  if (strat.emitScatter) {
    const realNumerics = (analysis.numericFields || []).filter(f =>
      !isLowQualityField(f.field) &&
      !isInvalidFieldName(f.field) &&
      // require at least 3 chars and contain a letter (kills "31", "v2", etc.)
      f.field.length >= 3 && /[a-zA-Z]{2,}/.test(f.field)
    );
    let pairA = null, pairB = null;
    outer: for (let i = 0; i < realNumerics.length; i++) {
      for (let j = i + 1; j < realNumerics.length; j++) {
        if (realNumerics[i].table === realNumerics[j].table) {
          pairA = realNumerics[i];
          pairB = realNumerics[j];
          break outer;
        }
      }
    }
    if (pairA && pairB) {
      const a = humanizeField(pairA.field);
      const b = humanizeField(pairB.field);
      if (a && b) {
        panels.push({
          id: 'comparison-scatter',
          title: `${a} vs ${b}`,
          type: 'chart',
          chartType: 'scatter',
          query: { table: pairA.table, x: pairA.field, y: pairB.field, limit: 500 },
          layout: { width: 6, height: 3, order: 1 },
        });
      }
    }
  }

  return { name: strat.sectionNames.comparison, type: 'chart-section', panels };
}

/**
 * Generate Ranking section (Top / Bottom N performers) with business titles.
 */
function generateRankingSection(template, analysis, sourceId, strategy) {
  const strat = strategy || DEFAULT_STRATEGY;
  const panels = [];

  const { dimension: dim, measure } = pickCoLocatedDimMeasure(analysis, strat);

  if (dim && measure) {
    const dLabel = humanizeField(dim.field);
    const mLabel = humanizeField(measure.field);
    if (dLabel && mLabel) {
      panels.push({
        id: 'ranking-top',
        title: `Top 10 ${dLabel} by ${mLabel}`,
        type: 'chart',
        chartType: 'hbar',
        query: { table: dim.table, dimension: dim.field, measure: measure.field, aggregation: 'SUM', limit: 10, orderBy: 'DESC' },
        layout: { width: 6, height: 3, order: 0 },
      });

      if (strat.emitBottomRanking) {
        panels.push({
          id: 'ranking-bottom',
          title: `Bottom 10 ${dLabel} by ${mLabel}`,
          type: 'chart',
          chartType: 'hbar',
          query: { table: dim.table, dimension: dim.field, measure: measure.field, aggregation: 'SUM', limit: 10, orderBy: 'ASC' },
          layout: { width: 6, height: 3, order: 1 },
        });
      }
    }
  }

  return { name: strat.sectionNames.ranking, type: 'chart-section', panels };
}

/**
 * Insights are now rendered as a colored strip at the TOP of the dashboard
 * (see frontend `injectInsightsStrip`). We no longer emit a placeholder panel
 * inside the canvas, since the rich rule-based insights live in
 * `dashboard.insights` already.
 */
function generateInsightSection(template, analysis, sourceId) {
  return { name: 'Insights & Alerts', type: 'insight-section', panels: [], insights: [] };
}

/**
 * Get appropriate icon for KPI
 */
function getKPIIcon(fieldName) {
  const name = String(fieldName || '').toLowerCase();
  if (name.includes('employee') || name.includes('headcount') || name.includes('people')) return '👥';
  if (name.includes('revenue') || name.includes('income') || name.includes('sales')) return '💰';
  if (name.includes('budget')) return '💼';
  if (name.includes('cost') || name.includes('expense') || name.includes('spend')) return '📉';
  if (name.includes('profit') || name.includes('margin')) return '📈';
  if (name.includes('hours') || name.includes('time') || name.includes('duration')) return '⏱️';
  if (name.includes('project')) return '📁';
  if (name.includes('ticket') || name.includes('issue')) return '🎫';
  if (name.includes('department')) return '🏢';
  if (name.includes('count')) return '🔢';
  if (name.includes('average') || name.includes('avg')) return '📊';
  return '📌';
}

// ────────────────────────────────────────────────────────────────────────────
// Executive AI Insights Engine — rule-based, decision-focused
// ────────────────────────────────────────────────────────────────────────────

function computeKpiStatus(value, thresholds) {
  if (!Number.isFinite(value)) return 'info';
  if (!thresholds) return value > 0 ? 'success' : 'warning';
  if (thresholds.kind === 'positive-better') {
    if (value <= 0) return 'danger';
    return 'success';
  }
  if (typeof thresholds.danger === 'number' && value <= thresholds.danger) return 'danger';
  if (typeof thresholds.warning === 'number' && value <= thresholds.warning) return 'warning';
  if (typeof thresholds.good === 'number' && value >= thresholds.good) return 'success';
  return 'info';
}

function formatNum(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}


//   {
//     level:          'success' | 'warning' | 'danger' | 'info',
//     icon:           one of 🟢 🟡 🔴 ⚠ 📈 🚨 💡
//     title:          short headline
//     observation:    "What was detected?"
//     businessImpact: "Why does it matter?"
//     riskLevel:      'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
//     recommendation: "What should management do next?"
//     confidence:     0..100  (how reliable the insight is from the data)
//   }
// ────────────────────────────────────────────────────────────────────────────

const RISK_BY_LEVEL = { success: 'LOW', info: 'LOW', warning: 'MEDIUM', danger: 'HIGH' };

// Infer the business domain from the template + analysis so insight wording
// reads like a domain expert.
function inferDomain(template, analysis) {
  const id = String(template && (template.id || template.templateId) || '').toLowerCase();
  const name = String(template && template.name || '').toLowerCase();
  const fields = (analysis.measures || []).concat(analysis.dimensions || [])
    .map(f => (f.field || '').toLowerCase()).join(' ');

  if (/finance|budget|revenue|profit|cost/.test(id + ' ' + name + ' ' + fields)) return 'finance';
  if (/hr|recruit|employee|hiring|attrition/.test(id + ' ' + name + ' ' + fields)) return 'hr';
  if (/sales|pipeline|deal|conversion|lead/.test(id + ' ' + name + ' ' + fields)) return 'sales';
  if (/project|wbs|milestone|delivery|deadline/.test(id + ' ' + name + ' ' + fields)) return 'projects';
  if (/support|ticket|sla|incident|service/.test(id + ' ' + name + ' ' + fields)) return 'support';
  if (/inventory|stock|warehouse|shipment/.test(id + ' ' + name + ' ' + fields)) return 'operations';
  return 'general';
}

// Domain-specific recommendation phrasing for the four most common patterns.
const DOMAIN_PLAYBOOK = {
  concentration: {
    finance:    'Review budget allocation strategy and diversify funding across business units.',
    hr:         'Rebalance workload and headcount allocation across teams to reduce single-point-of-failure risk.',
    sales:      'Diversify the sales pipeline; over-reliance on a few accounts threatens revenue stability.',
    projects:   'Spread project ownership and resourcing across more workstreams to limit delivery risk.',
    support:    'Distribute ticket ownership more evenly and cross-train agents on top categories.',
    operations: 'Diversify supplier and SKU mix; concentration creates supply-chain fragility.',
    general:    'Investigate whether this concentration is a strategic strength or a structural risk to diversify.',
  },
  upTrend: {
    finance:    'Identify the drivers of growth and reinforce them in the next budget cycle.',
    hr:         'Capture the practices behind this lift and replicate them across underperforming teams.',
    sales:      'Double down on the channels driving growth and increase quotas where conversion improved.',
    projects:   'Document the delivery patterns enabling this momentum and roll them out program-wide.',
    support:    'Recognize the teams achieving this lift and codify their playbooks as standards.',
    operations: 'Lock in the operational practices behind this gain and scale them across sites.',
    general:    'Sustain the practices driving this growth and benchmark them across teams.',
  },
  downTrend: {
    finance:    'Drill into expense drivers, freeze discretionary spend, and define a recovery plan.',
    hr:         'Investigate attrition or productivity drivers and act on retention before next quarter.',
    sales:      'Run pipeline reviews and reset forecast assumptions; intervene on stalled deals immediately.',
    projects:   'Trigger a delivery audit, reallocate critical-path resources, and reset client expectations.',
    support:    'Open an SLA war-room, add staffing to peak shifts, and review escalation paths.',
    operations: 'Audit throughput bottlenecks and trigger a contingency plan before service degrades further.',
    general:    'Drill into the underlying drivers and define a recovery plan with named owners.',
  },
  imbalance: {
    finance:    'Reset budget guardrails so allocations align with strategic priorities.',
    hr:         'Rebalance workload and review reporting structures across departments.',
    sales:      'Rebalance territory coverage and redirect SDR support to underperforming regions.',
    projects:   'Review portfolio mix and reassign sponsors to under-served programs.',
    support:    'Reweight queue routing rules so coverage matches ticket volume by category.',
    operations: 'Rebalance capacity allocation across sites or production lines.',
    general:    'Rebalance allocation so distribution matches strategic priorities.',
  },
  sla: {
    support:    'Reinforce SLA workflow, add escalation triggers, and review on-call coverage for high-priority tickets.',
    projects:   'Tighten milestone tracking and trigger early-warning alerts on slipping workstreams.',
    general:    'Tighten SLA governance and define automatic escalation triggers.',
  },
  outlier: {
    finance:    'Audit the outlier transactions to confirm they are legitimate and not control failures.',
    operations: 'Investigate outlier readings; they often signal equipment issues or data integrity problems.',
    general:    'Investigate the outlier values for control failures, anomalies, or data-quality issues.',
  },
};

function pick(playbook, domain) {
  return playbook[domain] || playbook.general;
}

// Statistical helpers -------------------------------------------------------
function _stats(values) {
  const v = (values || []).map(Number).filter(Number.isFinite);
  const n = v.length;
  if (!n) return { n: 0, sum: 0, mean: 0, std: 0, min: 0, max: 0 };
  const sum = v.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const variance = v.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
  const std = Math.sqrt(variance);
  return { n, sum, mean, std, min: Math.min(...v), max: Math.max(...v), values: v };
}
function _pct(part, whole) { return whole > 0 ? Math.round((part / whole) * 100) : 0; }

// Confidence model: more rows + tighter distribution + larger effect = higher confidence.
function _confidence({ rows = 0, effect = 0, baseline = 60, max = 95 }) {
  const rowsBoost = Math.min(20, Math.log10(Math.max(rows, 1)) * 12);
  const effectBoost = Math.min(20, Math.abs(effect) * 0.25);
  return Math.min(max, Math.round(baseline + rowsBoost + effectBoost));
}

function _findPanel(panels, id) {
  return (panels || []).find(p => p && p.id === id && p.data && Array.isArray(p.data.values) && p.data.values.length);
}

function _humanTitleNoun(title) {
  // "Top 10 Status by Budget" -> "Budget"
  if (!title) return 'this metric';
  const m = String(title).match(/by\s+(.+)$/i);
  return (m && m[1]) ? m[1].trim() : title;
}

// Strip trailing punctuation so we can re-punctuate cleanly when stitching
// observation/impact strings into the executive summary prose.
function stripTrailingPunct(s) {
  return String(s || '').replace(/[\s.;,—–-]+$/g, '').trim();
}

// ────────────────────────────────────────────────────────────────────────────
// composeExecutiveSummary — management-briefing style 2-3 paragraph summary
// ────────────────────────────────────────────────────────────────────────────
function composeExecutiveSummary({ template, analysis, panels, kpis }) {
  const domain = inferDomain(template, analysis);
  const validKpis = (kpis || []).filter(k => Number.isFinite(Number(k.value)) && Number(k.value) !== 0);

  // Build the insights first so the summary can reference them.
  const insights = computeBusinessInsights({ template, analysis, panels, kpis });
  const critical = insights.filter(i => i.riskLevel === 'CRITICAL' || i.riskLevel === 'HIGH');
  const positive = insights.filter(i => i.level === 'success');

  const para1Parts = [];
  if (validKpis.length) {
    const top = validKpis.slice().sort((a, b) => Number(b.value) - Number(a.value))[0];
    para1Parts.push(`${template.name} performance is anchored by ${top.name.toLowerCase()} at ${formatNum(top.value)}.`);
  } else {
    para1Parts.push(`${template.name} performance is being assessed across ${analysis.tables.length} data domain${analysis.tables.length === 1 ? '' : 's'}.`);
  }
  if (positive.length) {
    const obs = stripTrailingPunct(positive[0].observation || '').toLowerCase();
    if (obs) para1Parts.push(`Positive signal: ${obs}.`);
  }

  const para2Parts = [];
  if (critical.length) {
    const obs = stripTrailingPunct(critical[0].observation || '').toLowerCase();
    const imp = stripTrailingPunct(critical[0].businessImpact || '').toLowerCase();
    para2Parts.push(`The strongest concern is that ${obs}${imp ? ' — ' + imp : ''}.`);
    if (critical.length > 1) {
      const obs2 = stripTrailingPunct(critical[1].observation || '').toLowerCase();
      para2Parts.push(`A secondary risk is that ${obs2}.`);
    }
  } else if (insights.length) {
    para2Parts.push(`No critical risks detected; the dashboard surfaces ${insights.length} observation${insights.length === 1 ? '' : 's'} to monitor.`);
  }

  const para3Parts = [];
  const topRecs = insights
    .filter(i => i.recommendation)
    .slice(0, 2)
    .map(i => i.recommendation.replace(/\.$/, ''));
  if (topRecs.length) {
    para3Parts.push(`Recommended focus — ${topRecs.join('; ')}.`);
  }

  return [para1Parts.join(' '), para2Parts.join(' '), para3Parts.join(' ')]
    .filter(s => s && s.trim()).join(' ');
}

// ────────────────────────────────────────────────────────────────────────────
// computeBusinessInsights — produces structured executive insights
// ────────────────────────────────────────────────────────────────────────────
function computeBusinessInsights({ template, analysis, panels, kpis }) {
  const out = [];
  const domain = inferDomain(template, analysis);

  // 1. CONCENTRATION RISK — Top-N share of total in ranking
  const ranking = _findPanel(panels, 'ranking-top');
  if (ranking) {
    const stats = _stats(ranking.data.values);
    if (stats.sum > 0 && stats.n >= 3) {
      const top2 = stats.values.slice(0, 2).reduce((a, b) => a + b, 0);
      const top2Pct = _pct(top2, stats.sum);
      const top3 = stats.values.slice(0, 3).reduce((a, b) => a + b, 0);
      const top3Pct = _pct(top3, stats.sum);
      const noun = _humanTitleNoun(ranking.title);
      const dimNoun = humanizeField(ranking.query && ranking.query.dimension || '');
      if (top2Pct >= 60 || top3Pct >= 75) {
        const level = top2Pct >= 70 ? 'danger' : 'warning';
        out.push({
          level,
          icon: level === 'danger' ? '🚨' : '⚠',
          title: 'Concentration risk detected',
          observation: `${top2Pct}% of total ${noun.toLowerCase()} is concentrated in only the top 2 ${dimNoun.toLowerCase() || 'entries'}.`,
          businessImpact: 'High concentration creates single-point-of-failure risk and reduces strategic flexibility.',
          riskLevel: level === 'danger' ? 'HIGH' : 'MEDIUM',
          recommendation: pick(DOMAIN_PLAYBOOK.concentration, domain),
          confidence: _confidence({ rows: stats.n, effect: top2Pct }),
        });
      }
    }
  }

  // 2. TREND DIRECTION — first-half vs second-half average on the trend panel
  const trend = _findPanel(panels, 'trend-line');
  if (trend) {
    const stats = _stats(trend.data.values);
    if (stats.n >= 4) {
      const half = Math.floor(stats.n / 2);
      const a = stats.values.slice(0, half).reduce((s, x) => s + x, 0) / half;
      const b = stats.values.slice(half).reduce((s, x) => s + x, 0) / (stats.n - half);
      if (a > 0) {
        const delta = ((b - a) / a) * 100;
        const noun = humanizeField(trend.query && trend.query.measure || 'metric');
        if (delta >= 10) {
          out.push({
            level: 'success',
            icon: '📈',
            title: `Positive trend (+${delta.toFixed(0)}%)`,
            observation: `${noun} has increased by ${delta.toFixed(0)}% in the most recent period versus the prior period.`,
            businessImpact: 'Operational performance is improving and capacity is strengthening.',
            riskLevel: 'LOW',
            recommendation: pick(DOMAIN_PLAYBOOK.upTrend, domain),
            confidence: _confidence({ rows: stats.n, effect: delta }),
          });
        } else if (delta <= -10) {
          const level = delta <= -25 ? 'danger' : 'warning';
          out.push({
            level,
            icon: level === 'danger' ? '🚨' : '⚠',
            title: `Declining trend (${delta.toFixed(0)}%)`,
            observation: `${noun} has dropped by ${Math.abs(delta).toFixed(0)}% in the most recent period.`,
            businessImpact: 'Sustained decline threatens forecast accuracy and downstream commitments.',
            riskLevel: delta <= -25 ? 'CRITICAL' : 'HIGH',
            recommendation: pick(DOMAIN_PLAYBOOK.downTrend, domain),
            confidence: _confidence({ rows: stats.n, effect: delta }),
          });
        }
      }
    }
  }

  // 3. OUTLIER / SPIKE — z-score >= 2.5 on trend or overview values
  const spikePanel = trend || _findPanel(panels, 'overview-bar');
  if (spikePanel) {
    const stats = _stats(spikePanel.data.values);
    if (stats.n >= 5 && stats.std > 0) {
      const labels = spikePanel.data.labels || [];
      let spikeIdx = -1, spikeZ = 0;
      stats.values.forEach((v, i) => {
        const z = (v - stats.mean) / stats.std;
        if (Math.abs(z) > Math.abs(spikeZ)) { spikeZ = z; spikeIdx = i; }
      });
      if (Math.abs(spikeZ) >= 2.5 && spikeIdx >= 0) {
        const lbl = labels[spikeIdx] != null ? String(labels[spikeIdx]) : `point #${spikeIdx + 1}`;
        const direction = spikeZ > 0 ? 'spike' : 'drop';
        out.push({
          level: spikeZ > 0 ? 'warning' : 'danger',
          icon: spikeZ > 0 ? '⚠' : '🚨',
          title: `Anomaly detected (${spikeZ > 0 ? '+' : ''}${spikeZ.toFixed(1)}σ)`,
          observation: `Unusual ${direction} at "${lbl}" — value is ${formatNum(stats.values[spikeIdx])} versus average ${formatNum(stats.mean)}.`,
          businessImpact: 'Outliers often indicate data-quality issues, control failures, or one-off events that distort forecasts.',
          riskLevel: spikeZ > 0 ? 'MEDIUM' : 'HIGH',
          recommendation: pick(DOMAIN_PLAYBOOK.outlier, domain),
          confidence: _confidence({ rows: stats.n, effect: Math.abs(spikeZ) * 10 }),
        });
      }
    }
  }

  // 4. DISTRIBUTION IMBALANCE — overview-bar where one entry dominates
  const overview = _findPanel(panels, 'overview-bar');
  if (overview) {
    const stats = _stats(overview.data.values);
    const labels = overview.data.labels || [];
    if (stats.n >= 3 && stats.sum > 0) {
      const sorted = stats.values
        .map((v, i) => ({ v, lbl: labels[i] }))
        .sort((a, b) => b.v - a.v);
      const topShare = _pct(sorted[0].v, stats.sum);
      if (topShare >= 50) {
        const dimNoun = humanizeField(overview.query && overview.query.dimension || 'category');
        out.push({
          level: 'warning',
          icon: '⚠',
          title: `${dimNoun} imbalance`,
          observation: `${sorted[0].lbl || 'Top entry'} alone accounts for ${topShare}% of total ${humanizeField(overview.query && overview.query.measure || '').toLowerCase() || 'volume'}.`,
          businessImpact: 'Heavy skew toward one segment makes the business sensitive to localised shocks and policy changes.',
          riskLevel: topShare >= 70 ? 'HIGH' : 'MEDIUM',
          recommendation: pick(DOMAIN_PLAYBOOK.imbalance, domain),
          confidence: _confidence({ rows: stats.n, effect: topShare }),
        });
      }
    }
  }

  // 5. WEAK PERFORMERS — bottom-ranked entries far below median
  const bottom = _findPanel(panels, 'ranking-bottom');
  if (bottom) {
    const stats = _stats(bottom.data.values);
    const labels = bottom.data.labels || [];
    if (stats.n >= 5 && stats.mean > 0) {
      const weakest = stats.values[0];
      const ratio = weakest / stats.mean;
      if (ratio < 0.4) {
        out.push({
          level: 'warning',
          icon: '⚠',
          title: 'Underperforming segment identified',
          observation: `${labels[0] || 'Bottom entry'} delivers only ${Math.round(ratio * 100)}% of the average ${humanizeField(bottom.query && bottom.query.measure || '').toLowerCase() || 'output'}.`,
          businessImpact: 'Persistent underperformance erodes overall capacity and signals coaching, tooling, or process gaps.',
          riskLevel: 'MEDIUM',
          recommendation: 'Run a root-cause review of the lowest performers and define a 30-60-90 day improvement plan.',
          confidence: _confidence({ rows: stats.n, effect: (1 - ratio) * 100 }),
        });
      }
    }
  }

  // 6. STRONG PERFORMERS — single best stands well above rest
  const top = _findPanel(panels, 'ranking-top');
  if (top) {
    const stats = _stats(top.data.values);
    const labels = top.data.labels || [];
    if (stats.n >= 5 && stats.mean > 0) {
      const best = stats.values[0];
      const lift = best / stats.mean;
      if (lift > 1.7) {
        out.push({
          level: 'success',
          icon: '🟢',
          title: 'Standout performer',
          observation: `${labels[0] || 'Top entry'} delivers ${lift.toFixed(1)}× the average ${humanizeField(top.query && top.query.measure || '').toLowerCase() || 'output'}.`,
          businessImpact: 'Outsized performance points to a replicable practice or competitive advantage worth codifying.',
          riskLevel: 'LOW',
          recommendation: 'Capture the playbook behind this performance and roll it out to comparable teams or accounts.',
          confidence: _confidence({ rows: stats.n, effect: (lift - 1) * 50 }),
        });
      }
    }
  }

  // 7. SPARSE / EMPTY DATA WARNING
  const allKpis = (kpis || []);
  const zeroKpis = allKpis.filter(k => Number(k.value) === 0);
  if (allKpis.length && zeroKpis.length === allKpis.length) {
    out.push({
      level: 'warning',
      icon: '⚠',
      title: 'No KPI signal in data',
      observation: 'All headline KPIs returned zero values for the selected source.',
      businessImpact: 'Decision-makers cannot evaluate performance without baseline data; reporting credibility is at risk.',
      riskLevel: 'HIGH',
      recommendation: 'Verify the data pipeline is delivering recent records and remove any restrictive filters before sharing the dashboard.',
      confidence: 80,
    });
  }

  // De-duplicate and cap to the strongest 4-6 insights for executive readability.
  const seen = new Set();
  const unique = out.filter(i => {
    const key = i.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by severity (CRITICAL > HIGH > MEDIUM > LOW), then confidence.
  const sevOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  unique.sort((a, b) =>
    (sevOrder[a.riskLevel] || 9) - (sevOrder[b.riskLevel] || 9) ||
    (b.confidence || 0) - (a.confidence || 0)
  );

  // Always keep at least one positive/contextual note so the strip never looks bare.
  if (unique.length === 0) {
    unique.push({
      level: 'info',
      icon: '💡',
      title: 'Stable performance, no critical risks',
      observation: `No concentration, trend, or anomaly issues detected across ${analysis.tables.length} data domain${analysis.tables.length === 1 ? '' : 's'}.`,
      businessImpact: 'Operations appear balanced; this is the right moment to invest in growth initiatives rather than firefighting.',
      riskLevel: 'LOW',
      recommendation: 'Use this stability window to plan strategic initiatives, optimise costs, or expand capacity.',
      confidence: 70,
    });
  }

  return unique.slice(0, 6);
}

module.exports = {
  generateFullDashboardFromDatasource
};
